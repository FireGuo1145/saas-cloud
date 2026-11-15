import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Context, Schema, Session } from "yumeri";
import type { AuthService } from "@mirelia/auth";
import "@mirelia/auth";
import "@mirelia/dashboard";
import "@mirelia/database-core";
import "@mirelia/user";

export const depend = ["auth", "dashboard", "database", "user"];
export const provide = ["billing"];

export type BillingOrderStatus = "pending" | "awaiting_confirm" | "paid" | "cancelled" | "rejected";
export interface BillingOrder {
  id?: number;
  order_id: string;
  user_id: number;
  amount_cents: number;
  status: BillingOrderStatus;
  payment_method: string;
  adapter_id: string;
  trade_no: string;
  note: string;
  created_at: string;
  submitted_at: string;
  paid_at: string;
}
export interface BillingLedgerEntry { id?: number; user_id: number; amount_cents: number; entry_type: string; reference: string; description: string; created_at: string }

/** A payment method a user can pick when topping up. */
export interface PaymentMethod {
  id: string;
  label: string;
  description?: string;
  /** Optional illustration shown next to the instructions. */
  imageUrl?: string;
}

/** Extra content the checkout dialog renders for an adapter. */
export interface BillingPaymentView {
  adapter: string;
  method: string;
  instructions: string;
  imageUrl?: string;
  /** Amount the payer transfers, preformatted. */
  amount: string;
  reference: string;
  /** `manual` orders wait for an administrator; `redirect` leaves for the gateway. */
  kind: "manual" | "redirect";
  /** Present for redirect adapters. */
  paymentUrl?: string;
}

export interface BillingPaymentAdapter {
  id: string;
  /** Methods offered for this adapter; the first one is the default. */
  methods(): PaymentMethod[];
  /** Start a top-up: either hand back manual instructions or a redirect URL. */
  createPayment(order: BillingOrder, method: string, title: string): Promise<{ view: BillingPaymentView } | { paymentUrl: string }>;
  /** Optional: the user confirms they have paid, moving the order to awaiting confirmation. */
  submitPayment?(order: BillingOrder, input: { note: string }): Promise<void>;
  /** Optional: an out-of-band gateway notification confirms a payment. */
  verifyNotification?(params: Record<string, string>): boolean;
}

export interface BillingService {
  balance(userId: number): Promise<number>;
  ledger(userId: number, limit?: number): Promise<BillingLedgerEntry[]>;
  debit(userId: number, amountCents: number, reference: string, description: string): Promise<boolean>;
  credit(userId: number, amountCents: number, reference: string, description: string, entryType?: string): Promise<void>;
  registerAdapter(adapter: BillingPaymentAdapter): () => void;
  /** Credit a confirmed order exactly once; returns false when a reference was already used. */
  settleOrder(order: BillingOrder, tradeNo?: string, description?: string): Promise<boolean>;
}

export interface ManualMethodConfig { id: string; label: string; description: string; imageUrl: string }
export interface ManualConfig { enabled: boolean; instructions: string; methods: ManualMethodConfig[] }
export interface BillingConfig {
  publicBaseUrl: string;
  minimumTopUpCents: number;
  maximumTopUpCents: number;
  manual: ManualConfig;
  epay: EpayConfig;
}
export interface EpayConfig { enabled: boolean; gatewayUrl: string; pid: string; key: string }

declare module "@yumerijs/types" { interface Tables { billing_orders: BillingOrder; billing_ledger: BillingLedgerEntry } }
declare module "yumeri" { interface Components { billing: BillingService } }

export const config: Schema<BillingConfig> = Schema.object({
  publicBaseUrl: Schema.string("Public base URL used by payment callbacks").key("billing.publicBaseUrl").default("http://localhost:3001"),
  minimumTopUpCents: Schema.number("Minimum top-up amount in cents").key("billing.minimumTopUpCents").default(100),
  maximumTopUpCents: Schema.number("Maximum top-up amount in cents").key("billing.maximumTopUpCents").default(500000),
  manual: Schema.object({
    enabled: Schema.boolean("Enable manual payments confirmed by an administrator").key("billing.manual.enabled").default(false),
    instructions: Schema.string("Instructions shown to the payer, e.g. account and amount text").key("billing.manual.instructions").default(""),
    methods: Schema.array(Schema.object<ManualMethodConfig>({
      id: Schema.string("Stable method id stored on the order").key("billing.manual.methods.id").default(""),
      label: Schema.string("Method name shown to the payer").key("billing.manual.methods.label").default(""),
      description: Schema.string("Optional line under the method name").key("billing.manual.methods.description").default(""),
      imageUrl: Schema.string("Payment method image URL or path, e.g. /assets/alipay.png").key("billing.manual.methods.imageUrl").default(""),
    }), "Manual payment methods").key("billing.manual.methods").default([]),
  }),
  epay: Schema.object({
    enabled: Schema.boolean("Enable YiPay adapter").key("billing.epay.enabled").default(false),
    gatewayUrl: Schema.string("YiPay submit.php URL").key("billing.epay.gatewayUrl").default(""),
    pid: Schema.string("YiPay merchant ID").key("billing.epay.pid").default(""),
    key: Schema.string("YiPay signing key").key("billing.epay.key").default(""),
  }),
});

function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function paySign(values: Record<string, string>, key: string) {
  const query = Object.keys(values).filter((name) => values[name] !== "" && name !== "sign" && name !== "sign_type").sort().map((name) => `${name}=${values[name]}`).join("&");
  return createHash("md5").update(`${query}${key}`).digest("hex");
}
function validSign(values: Record<string, string>, key: string) {
  const actual = values.sign ?? "";
  const expected = paySign(values, key);
  if (!/^[a-f\d]{32}$/i.test(actual)) return false;
  return timingSafeEqual(Buffer.from(actual.toLowerCase()), Buffer.from(expected));
}
function orderNumber() { return `MC${Date.now()}${randomBytes(5).toString("hex")}`; }

export async function apply(ctx: Context, pluginConfig: BillingConfig = {
  publicBaseUrl: "http://localhost:3001", minimumTopUpCents: 100, maximumTopUpCents: 500000,
  manual: { enabled: false, instructions: "", methods: [] },
  epay: { enabled: false, gatewayUrl: "", pid: "", key: "" },
}) {
  ctx.i18n({ cloud: { billing: {
    nav: { billing: { zh: "账单与余额", en: "Billing", ja: "請求と残高" } },
    title: { zh: "账单与余额", en: "Billing and balance", ja: "請求と残高" },
    balance: { zh: "账户余额", en: "Account balance", ja: "アカウント残高" },
    recharge: { zh: "余额充值", en: "Add funds", ja: "チャージ" },
    amount: { zh: "充值金额（元）", en: "Amount (CNY)", ja: "チャージ金額（CNY）" },
    paymentMethod: { zh: "支付方式", en: "Payment method", ja: "支払い方法" },
    alipay: { zh: "支付宝", en: "Alipay", ja: "Alipay" },
    wechat: { zh: "微信支付", en: "WeChat Pay", ja: "WeChat Pay" },
    continuePayment: { zh: "前往支付", en: "Continue to payment", ja: "支払いに進む" },
    creating: { zh: "正在创建订单…", en: "Creating order…", ja: "注文を作成中…" },
    minimum: { zh: "最低充值金额为 {amount} 元", en: "Minimum top-up is CNY {amount}", ja: "最低チャージ金額は CNY {amount} です" },
    history: { zh: "余额记录", en: "Balance history", ja: "残高履歴" },
    noHistory: { zh: "暂无余额记录", en: "No balance activity yet", ja: "残高履歴はありません" },
    pending: { zh: "待支付", en: "Pending", ja: "支払い待ち" },
    awaitingConfirm: { zh: "待确认", en: "Awaiting confirmation", ja: "確認待ち" },
    paid: { zh: "已完成", en: "Paid", ja: "支払い済み" },
    cancelled: { zh: "已取消", en: "Cancelled", ja: "キャンセル済み" },
    rejected: { zh: "已驳回", en: "Rejected", ja: "却下済み" },
    date: { zh: "时间", en: "Date", ja: "日時" },
    description: { zh: "说明", en: "Description", ja: "説明" },
    change: { zh: "变动金额", en: "Change", ja: "変動額" },
    status: { zh: "状态", en: "Status", ja: "状態" },
    topUpDescription: { zh: "余额充值", en: "Balance top-up", ja: "残高チャージ" },
    unavailable: { zh: "易支付暂未配置或不可用。", en: "YiPay is not configured or unavailable.", ja: "YiPay が未設定または利用できません。" },
    noPaymentMethod: { zh: "当前没有可用的支付方式。", en: "No payment method is available.", ja: "利用可能な支払い方法がありません。" },
    returnSuccess: { zh: "已返回支付页面，到账状态以支付通知为准。", en: "Returned from payment. Balance updates after the verified notification.", ja: "決済から戻りました。残高は通知検証後に反映されます。" },
    orders: { zh: "充值订单", en: "Top-up orders", ja: "チャージ注文" },
    noOrders: { zh: "暂无充值订单", en: "No top-up orders yet", ja: "チャージ注文はありません" },
    manual: {
      title: { zh: "手动支付", en: "Manual payment", ja: "手動支払い" },
      description: { zh: "请按下方说明完成转账，然后提交订单等待管理员确认。", en: "Transfer the amount as described below, then submit the order for confirmation.", ja: "以下の手順で振り込みを行い、注文を送信してください。" },
      orderId: { zh: "订单号", en: "Order", ja: "注文番号" },
      amount: { zh: "应付金额", en: "Amount due", ja: "支払い金額" },
      instructions: { zh: "支付说明", en: "Instructions", ja: "支払い手順" },
      method: { zh: "支付方式", en: "Method", ja: "支払い方法" },
      submit: { zh: "我已支付", en: "I have paid", ja: "支払い済みです" },
      submitting: { zh: "正在提交…", en: "Submitting…", ja: "送信中…" },
      note: { zh: "备注（可选，例如付款账号后四位）", en: "Note (optional, e.g. last digits of the paying account)", ja: "メモ（任意：支払元口座の下 4 桁など）" },
      submitted: { zh: "已提交，等待管理员确认到账。", en: "Submitted. An administrator will confirm the payment.", ja: "送信しました。管理者が入金を確認します。" },
      awaitingHint: { zh: "该订单正在等待管理员确认。", en: "This order is waiting for an administrator to confirm it.", ja: "この注文は管理者の確認待ちです。" },
      resubmit: { zh: "更新支付信息", en: "Update payment details", ja: "支払い情報を更新" },
      rejectedHint: { zh: "管理员未找到对应款项，请重新支付或提交新的说明。", en: "An administrator could not find the payment. Pay again or submit new details.", ja: "入金が確認できませんでした。再度支払うか説明を更新してください。" },
      pendingHint: { zh: "请按说明完成支付后提交订单。", en: "Pay as described, then submit the order.", ja: "手順に従って支払い、注文を送信してください。" },
      confirmationNumber: { zh: "请使用订单号作为转账备注。", en: "Use the order number as the transfer reference.", ja: "振込メモに注文番号をご記入ください。" },
    },
    errors: {
      auth: { zh: "请先登录", en: "Authentication is required", ja: "ログインしてください" },
      amount: { zh: "充值金额无效", en: "Invalid top-up amount", ja: "チャージ金額が無効です" },
      create: { zh: "无法创建充值订单", en: "Could not create top-up order", ja: "チャージ注文を作成できませんでした" },
      notify: { zh: "支付通知无效", en: "Invalid payment notification", ja: "決済通知が無効です" },
      order: { zh: "订单不存在", en: "Order not found", ja: "注文が見つかりません" },
      orderState: { zh: "订单当前状态不允许此操作", en: "The order state does not allow this action", ja: "注文の状態ではこの操作はできません" },
      method: { zh: "请选择有效的支付方式", en: "Choose a valid payment method", ja: "有効な支払い方法を選択してください" },
      admin: { zh: "需要站点管理员权限", en: "Site administrator permission is required", ja: "サイト管理者の権限が必要です" },
    },
    admin: {
      nav: { section: { zh: "站点管理", en: "Administration", ja: "サイト管理" }, orders: { zh: "充值确认", en: "Payments", ja: "入金確認" } },
      title: { zh: "充值确认", en: "Manual payment review", ja: "手動入金の確認" },
      description: { zh: "核对用户提交的转账并确认入账，驳回时订单会回到待支付。", en: "Verify transfers submitted by users. Rejecting returns the order to pending.", ja: "ユーザーが送信した振込を確認します。却下すると注文は支払い待ちに戻ります。" },
      awaitingOnly: { zh: "仅待确认", en: "Awaiting only", ja: "確認待ちのみ" },
      user: { zh: "用户", en: "User", ja: "ユーザー" },
      method: { zh: "方式", en: "Method", ja: "方法" },
      amount: { zh: "金额", en: "Amount", ja: "金額" },
      submittedAt: { zh: "提交时间", en: "Submitted", ja: "送信日時" },
      note: { zh: "用户备注", en: "User note", ja: "ユーザーメモ" },
      confirm: { zh: "确认到账", en: "Confirm payment", ja: "入金を確認" },
      reject: { zh: "驳回", en: "Reject", ja: "却下" },
      working: { zh: "处理中…", en: "Working…", ja: "処理中…" },
      empty: { zh: "没有待确认的订单", en: "No payments are waiting for review", ja: "確認待ちの入金はありません" },
      noOrders: { zh: "还没有充值订单", en: "No top-up orders yet", ja: "チャージ注文はありません" },
      tradeNo: { zh: "交易凭证号（可选）", en: "Transaction reference (optional)", ja: "取引番号（任意）" },
      confirmed: { zh: "已确认入账", en: "Payment confirmed", ja: "入金を確認しました" },
      rejected: { zh: "已驳回", en: "Payment rejected", ja: "却下しました" },
      errors: { load: { zh: "无法加载订单", en: "Could not load orders", ja: "注文を読み込めませんでした" }, act: { zh: "操作失败", en: "The action failed", ja: "操作に失敗しました" } },
    },
  } } });

  const db = ctx.component.database;
  const users = ctx.component.user;
  const auth = ctx.component.auth as AuthService;
  const notifyPath = "/api/billing/epay/notify";
  const returnPath = "/api/billing/epay/return";
  auth.registerPublicPath(notifyPath);
  auth.registerPublicPath(returnPath);
  await db.extend("billing_orders", {
    id: { type: "integer", autoIncrement: true }, order_id: { type: "string", nullable: false }, user_id: { type: "integer", nullable: false },
    amount_cents: { type: "integer", nullable: false }, status: { type: "string", initial: "pending", nullable: false },
    payment_method: { type: "string", nullable: false }, adapter_id: { type: "string", initial: "", nullable: false },
    trade_no: { type: "string", initial: "", nullable: false }, note: { type: "text", initial: "", nullable: false },
    created_at: { type: "timestamp", nullable: false }, submitted_at: { type: "timestamp", initial: "", nullable: false },
    paid_at: { type: "timestamp", initial: "", nullable: false },
  }, { unique: ["order_id"] });
  await db.extend("billing_ledger", {
    id: { type: "integer", autoIncrement: true }, user_id: { type: "integer", nullable: false }, amount_cents: { type: "integer", nullable: false },
    entry_type: { type: "string", nullable: false }, reference: { type: "string", nullable: false }, description: { type: "string", nullable: false }, created_at: { type: "timestamp", nullable: false },
  }, { unique: ["reference"] });
  const debitTails = new Map<number, Promise<void>>();
  async function withUserDebitLock<T>(userId: number, operation: () => Promise<T>): Promise<T> {
    const previous = debitTails.get(userId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    debitTails.set(userId, current);
    await previous;
    try { return await operation(); }
    finally {
      release();
      if (debitTails.get(userId) === current) debitTails.delete(userId);
    }
  }
  const adapters = new Map<string, BillingPaymentAdapter>();
  const billing: BillingService = {
    balance: async (userId) => (await db.select("billing_ledger", { user_id: userId }) as BillingLedgerEntry[]).reduce((sum, item) => sum + item.amount_cents, 0),
    ledger: async (userId, limit = 100) => (await db.select("billing_ledger", { user_id: userId }) as BillingLedgerEntry[]).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, Math.max(1, Math.min(limit, 200))),
    async debit(userId, amountCents, reference, description) {
      if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || !reference.trim()) throw new Error("Invalid billing debit");
      return withUserDebitLock(userId, async () => {
        const prior = await db.selectOne("billing_ledger", { user_id: userId, reference });
        if (prior) return true;
        if (await billing.balance(userId) < amountCents) return false;
        await db.create("billing_ledger", { user_id: userId, amount_cents: -amountCents, entry_type: "purchase", reference, description, created_at: new Date().toISOString() });
        return true;
      });
    },
    async credit(userId, amountCents, reference, description, entryType = "refund") {
      if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || !reference.trim()) throw new Error("Invalid billing credit");
      const prior = await db.selectOne("billing_ledger", { user_id: userId, reference });
      if (prior) return;
      await db.create("billing_ledger", { user_id: userId, amount_cents: amountCents, entry_type: entryType, reference, description, created_at: new Date().toISOString() });
    },
    async settleOrder(order, tradeNo, description) {
      const reference = `${order.adapter_id || "manual"}:${order.order_id}`;
      const prior = await db.selectOne("billing_ledger", { reference, user_id: order.user_id });
      if (prior) return false;
      await db.create("billing_ledger", {
        user_id: order.user_id, amount_cents: order.amount_cents, entry_type: "top_up", reference,
        description: description ?? ctx.getCore().i18n.get("cloud.billing.topUpDescription", ["zh"]), created_at: new Date().toISOString(),
      });
      if (order.status !== "paid") {
        await db.update("billing_orders", { id: order.id }, { status: "paid", trade_no: tradeNo ?? order.trade_no, paid_at: new Date().toISOString() });
      }
      return true;
    },
    registerAdapter(adapter) {
      const id = String(adapter?.id ?? "").trim();
      if (!/^[a-z][a-z0-9_-]{1,39}$/.test(id)) throw new Error(`Invalid billing adapter id: ${adapter?.id}`);
      adapters.set(id, adapter);
      const remove = () => { if (adapters.get(id) === adapter) adapters.delete(id); };
      ctx.affect(remove);
      return remove;
    },
  };
  ctx.registerComponent("billing", billing);
  const epayEnabled = () => Boolean(pluginConfig.epay.enabled && pluginConfig.epay.gatewayUrl.startsWith("https://") && pluginConfig.epay.pid && pluginConfig.epay.key);
  const manualConfigured = () => Boolean(pluginConfig.manual?.enabled && (pluginConfig.manual.methods ?? []).some((method) => method.id));
  const epayRoutesAlwaysRegistered = true;
  void epayRoutesAlwaysRegistered;

  /** Every method offered by every enabled adapter. */
  const methodCatalog = () => {
    const catalog: Array<PaymentMethod & { adapter: string }> = [];
    for (const adapter of adapters.values()) {
      let methods: PaymentMethod[] = [];
      try { methods = adapter.methods(); } catch { methods = []; }
      for (const method of methods) {
        if (!method?.id || catalog.some((entry) => entry.id === method.id)) continue;
        catalog.push({ ...method, adapter: adapter.id });
      }
    }
    return catalog;
  };
  function orderView(order: BillingOrder) { return { ...order }; }
  function fail(session: Session, status: number, key: string) { session.status = status; session.respond({ error: session.text(key) }, "json"); }

  const epay: BillingPaymentAdapter = {
    id: "epay",
    methods: () => [
      { id: "alipay", label: ctx.getCore().i18n.get("cloud.billing.alipay", ["zh"]) },
      { id: "wxpay", label: ctx.getCore().i18n.get("cloud.billing.wechat", ["zh"]) },
    ],
    async createPayment(order, method, title) {
      if (!epayEnabled()) throw new Error("Payment adapter is unavailable");
      const base = pluginConfig.publicBaseUrl.replace(/\/+$/, "");
      const fields: Record<string, string> = {
        pid: pluginConfig.epay.pid, type: method, out_trade_no: order.order_id,
        notify_url: `${base}${notifyPath}`, return_url: `${base}${returnPath}`,
        name: title, money: (order.amount_cents / 100).toFixed(2),
      };
      fields.sign = paySign(fields, pluginConfig.epay.key);
      fields.sign_type = "MD5";
      const url = new URL(pluginConfig.epay.gatewayUrl);
      for (const [key, value] of Object.entries(fields)) url.searchParams.set(key, value);
      return { paymentUrl: url.toString() };
    },
    verifyNotification: (params) => Boolean(epayEnabled() && validSign(params, pluginConfig.epay.key) && params.pid === pluginConfig.epay.pid),
  };

  /**
   * Manual payments: the user transfers the money out of band, confirms it in the
   * dashboard, and a site administrator confirms the receipt. Only the
   * administrator's confirmation credits the balance.
   */
  const manual: BillingPaymentAdapter = {
    id: "manual",
    methods: () => (pluginConfig.manual?.methods ?? [])
      .filter((method) => method.id && method.label)
      .map((method) => ({ id: method.id, label: method.label, description: method.description || undefined, imageUrl: method.imageUrl || undefined })),
    async createPayment(order, method) {
      if (!manualConfigured()) throw new Error("Payment adapter is unavailable");
      const config = (pluginConfig.manual.methods ?? []).find((entry) => entry.id === method);
      if (!config) throw new Error("Payment adapter is unavailable");
      return {
        view: {
          adapter: "manual", method, kind: "manual",
          instructions: (pluginConfig.manual.instructions ?? "")
            .replaceAll("{amount}", (order.amount_cents / 100).toFixed(2))
            .replaceAll("{orderId}", order.order_id),
          imageUrl: config.imageUrl || undefined,
          amount: (order.amount_cents / 100).toFixed(2),
          reference: order.order_id,
        },
      };
    },
    async submitPayment(order, input) {
      if (!["pending", "rejected", "awaiting_confirm"].includes(order.status)) throw new Error("billing_order_state");
      await db.update("billing_orders", { id: order.id }, {
        status: "awaiting_confirm",
        note: String(input.note ?? "").slice(0, 500),
        submitted_at: new Date().toISOString(),
      });
    },
  };

  billing.registerAdapter(epay);
  if (manualConfigured()) billing.registerAdapter(manual);

  async function requireAdmin(session: Session) {
    const user = await users.requireAdmin(session);
    return user;
  }

  async function findOrder(userId: number | undefined, orderId: string, admin: boolean) {
    const order = await db.selectOne("billing_orders", { order_id: orderId }) as BillingOrder | undefined;
    if (!order) return undefined;
    if (!admin && order.user_id !== userId) return undefined;
    return order;
  }

  ctx.route("/api/billing/summary").methods("GET").action(async (session) => {
    const user = await users.current(session);
    if (!user?.id) return fail(session, 401, "cloud.billing.errors.auth");
    const [balanceCents, ledger, orders, admin] = await Promise.all([
      billing.balance(user.id), billing.ledger(user.id), db.select("billing_orders", { user_id: user.id }) as Promise<BillingOrder[]>, users.isAdmin(user),
    ]);
    session.respond({
      balanceCents, ledger, orders: orders.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 50).map(orderView),
      methods: methodCatalog(), minimumTopUpCents: pluginConfig.minimumTopUpCents, isAdmin: Boolean(admin),
    }, "json");
  });

  ctx.route("/api/billing/top-up").methods("POST").action(async (session) => {
    const user = await users.current(session);
    if (!user?.id) return fail(session, 401, "cloud.billing.errors.auth");
    const body = object(await session.parseRequestBody());
    const amountCents = Number(body.amountCents);
    const methodId = String(body.method ?? "");
    const method = methodCatalog().find((entry) => entry.id === methodId);
    if (!method) return fail(session, 400, "cloud.billing.errors.method");
    if (!Number.isSafeInteger(amountCents) || amountCents < Math.max(1, pluginConfig.minimumTopUpCents) || amountCents > pluginConfig.maximumTopUpCents) {
      return fail(session, 400, "cloud.billing.errors.amount");
    }
    const adapter = adapters.get(method.adapter);
    if (!adapter) return fail(session, 503, "cloud.billing.unavailable");
    const orderId = orderNumber();
    const now = new Date().toISOString();
    const order = await db.create("billing_orders", {
      order_id: orderId, user_id: user.id, amount_cents: amountCents, status: "pending", payment_method: method.id, adapter_id: adapter.id,
      trade_no: "", note: "", created_at: now, submitted_at: "", paid_at: "",
    }) as BillingOrder;
    try {
      const result = await adapter.createPayment(order, method.id, session.text("cloud.billing.topUpDescription"));
      if ("paymentUrl" in result) {
        session.respond({ orderId: order.order_id, status: order.status, paymentUrl: result.paymentUrl }, "json");
        return;
      }
      session.respond({ orderId: order.order_id, status: order.status, payment: result.view }, "json");
    } catch {
      await db.update("billing_orders", { id: order.id, status: "pending" }, { status: "cancelled" });
      fail(session, 503, "cloud.billing.unavailable");
    }
  });

  /** The payer states that the transfer is done; the order waits for an administrator. */
  ctx.route("/api/billing/orders/:orderId/submit").methods("POST").action(async (session, _query, orderId) => {
    const user = await users.current(session);
    if (!user?.id) return fail(session, 401, "cloud.billing.errors.auth");
    const order = await findOrder(user.id, orderId, false);
    if (!order) return fail(session, 404, "cloud.billing.errors.order");
    const adapter = adapters.get(order.adapter_id);
    if (!adapter?.submitPayment) return fail(session, 400, "cloud.billing.errors.orderState");
    const body = object(await session.parseRequestBody());
    try {
      await adapter.submitPayment(order, { note: String(body.note ?? "") });
      const updated = await db.selectOne("billing_orders", { id: order.id }) as BillingOrder;
      session.respond({ order: orderView(updated) }, "json");
    } catch {
      fail(session, 409, "cloud.billing.errors.orderState");
    }
  });

  ctx.route("/api/billing/orders/:orderId/cancel").methods("POST").action(async (session, _query, orderId) => {
    const user = await users.current(session);
    if (!user?.id) return fail(session, 401, "cloud.billing.errors.auth");
    const order = await findOrder(user.id, orderId, false);
    if (!order) return fail(session, 404, "cloud.billing.errors.order");
    if (!["pending", "rejected"].includes(order.status)) return fail(session, 409, "cloud.billing.errors.orderState");
    await db.update("billing_orders", { id: order.id }, { status: "cancelled" });
    session.respond({ order: orderView({ ...order, status: "cancelled" }) }, "json");
  });

  ctx.route("/api/billing/admin/orders").methods("GET").action(async (session) => {
    if (!await requireAdmin(session)) return;
    const orders = (await db.select("billing_orders", {}) as BillingOrder[]).sort((a, b) => (b.submitted_at || b.created_at).localeCompare(a.submitted_at || a.created_at));
    const enriched = [];
    for (const order of orders) {
      const user = await db.selectOne("users", { id: order.user_id }) as { username?: string; email?: string } | undefined;
      enriched.push({ ...orderView(order), username: user?.username ?? "", email: user?.email ?? "" });
    }
    session.respond({ orders: enriched }, "json");
  });

  ctx.route("/api/billing/admin/orders/:orderId/confirm").methods("POST").action(async (session, _query, orderId) => {
    const admin = await requireAdmin(session);
    if (!admin) return;
    const order = await findOrder(undefined, orderId, true);
    if (!order) return fail(session, 404, "cloud.billing.errors.order");
    if (!["pending", "awaiting_confirm", "rejected"].includes(order.status)) return fail(session, 409, "cloud.billing.errors.orderState");
    const body = object(await session.parseRequestBody());
    const tradeNo = String(body.tradeNo ?? "").slice(0, 120);
    await billing.settleOrder(order, tradeNo, session.text("cloud.billing.topUpDescription"));
    const updated = await db.selectOne("billing_orders", { id: order.id }) as BillingOrder;
    session.respond({ order: orderView(updated) }, "json");
  });

  ctx.route("/api/billing/admin/orders/:orderId/reject").methods("POST").action(async (session, _query, orderId) => {
    if (!await requireAdmin(session)) return;
    const order = await findOrder(undefined, orderId, true);
    if (!order) return fail(session, 404, "cloud.billing.errors.order");
    if (order.status !== "awaiting_confirm") return fail(session, 409, "cloud.billing.errors.orderState");
    await db.update("billing_orders", { id: order.id }, { status: "rejected" });
    session.respond({ order: orderView({ ...order, status: "rejected" }) }, "json");
  });

  ctx.route(notifyPath).methods("GET", "POST").action(async (session, query) => {
    if (!epayEnabled()) { session.status = 503; session.respond("fail", "plain"); return; }
    let params: Record<string, string> = Object.fromEntries(query.entries());
    if ((session.client.req?.method ?? "GET").toUpperCase() === "POST") {
      try {
        const body = object(await session.parseRequestBody());
        params = { ...params, ...Object.fromEntries(Object.entries(body).map(([key, value]) => [key, String(value)])) };
      } catch { /* GET parameters remain available for gateways using query callbacks. */ }
    }
    const adapter = adapters.get("epay");
    if (!adapter?.verifyNotification?.(params) || params.trade_status !== "TRADE_SUCCESS") { session.status = 400; session.respond("fail", "plain"); return; }
    const order = await db.selectOne("billing_orders", { order_id: params.out_trade_no }) as BillingOrder | undefined;
    const paidAmount = Math.round(Number(params.money) * 100);
    if (!order || order.adapter_id !== "epay" || !["pending", "paid"].includes(order.status) || order.payment_method !== params.type || order.amount_cents !== paidAmount) {
      session.status = 400; session.respond("fail", "plain"); return;
    }
    await billing.settleOrder(order, params.trade_no ?? "");
    session.respond("success", "plain");
  });
  ctx.route("/api/billing/epay/return").methods("GET").action((session, query) => {
    const params = Object.fromEntries(query.entries());
    const ok = adapters.get("epay")?.verifyNotification?.(params) ?? false;
    session.status = 302;
    session.head.location = `/account/billing?payment=${ok ? "returned" : "unverified"}`;
    session.respond("", "plain");
  });

  ctx.component.dashboard.addEntry({ id: "billing", dev: fileURLToPath(new URL("../frontend/index.tsx", import.meta.url)), prod: fileURLToPath(new URL("../dist/frontend/billing.js", import.meta.url)), plugin: "billing" });
}

export default apply;
