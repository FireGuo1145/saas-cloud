import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Context, Schema, Session } from "yumeri";
import type { User } from "@mirelia/user";
import type { AuthService } from "@mirelia/auth";
import "@mirelia/auth";
import "@mirelia/dashboard";
import "@mirelia/user";

export const depend = ["auth", "dashboard", "user"];
export const provide = ["billing"];

export interface BillingConfig { publicBaseUrl: string; minimumTopUpCents: number; maximumTopUpCents: number; epay: { enabled: boolean; gatewayUrl: string; pid: string; key: string } }
export interface BillingOrder { id?: number; order_id: string; user_id: number; amount_cents: number; status: "pending" | "paid" | "cancelled"; payment_method: string; trade_no: string; created_at: string; paid_at: string }
export interface BillingLedgerEntry { id?: number; user_id: number; amount_cents: number; entry_type: string; reference: string; description: string; created_at: string }
export interface BillingPaymentAdapter {
  id: string;
  createPayment(order: BillingOrder, method: string, title: string): Promise<string>;
  verifyNotification(params: Record<string, string>): boolean;
}
export interface BillingService {
  balance(userId: number): Promise<number>;
  ledger(userId: number, limit?: number): Promise<BillingLedgerEntry[]>;
  debit(userId: number, amountCents: number, reference: string, description: string): Promise<boolean>;
  credit(userId: number, amountCents: number, reference: string, description: string, entryType?: string): Promise<void>;
  registerAdapter(adapter: BillingPaymentAdapter): () => void;
}
declare module "@yumerijs/types" { interface Tables { billing_orders: BillingOrder; billing_ledger: BillingLedgerEntry } }
declare module "yumeri" { interface Components { billing: BillingService } }

export const config: Schema<BillingConfig> = Schema.object({
  publicBaseUrl: Schema.string("Public base URL used by payment callbacks").key("billing.publicBaseUrl").default("http://localhost:3001"),
  minimumTopUpCents: Schema.number("Minimum top-up amount in cents").key("billing.minimumTopUpCents").default(100),
  maximumTopUpCents: Schema.number("Maximum top-up amount in cents").key("billing.maximumTopUpCents").default(500000),
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
    paid: { zh: "已完成", en: "Paid", ja: "支払い済み" },
    date: { zh: "时间", en: "Date", ja: "日時" },
    description: { zh: "说明", en: "Description", ja: "説明" },
    change: { zh: "变动金额", en: "Change", ja: "変動額" },
    status: { zh: "状态", en: "Status", ja: "状態" },
    topUpDescription: { zh: "余额充值", en: "Balance top-up", ja: "残高チャージ" },
    unavailable: { zh: "易支付暂未配置或不可用。", en: "YiPay is not configured or unavailable.", ja: "YiPay が未設定または利用できません。" },
    returnSuccess: { zh: "已返回支付页面，到账状态以支付通知为准。", en: "Returned from payment. Balance updates after the verified notification.", ja: "決済から戻りました。残高は通知検証後に反映されます。" },
    errors: {
      auth: { zh: "请先登录", en: "Authentication is required", ja: "ログインしてください" },
      amount: { zh: "充值金额无效", en: "Invalid top-up amount", ja: "チャージ金額が無効です" },
      create: { zh: "无法创建充值订单", en: "Could not create top-up order", ja: "チャージ注文を作成できませんでした" },
      notify: { zh: "支付通知无效", en: "Invalid payment notification", ja: "決済通知が無効です" },
    },
  } } });
  ctx.component.dashboard.addEntry({ id: "billing", dev: fileURLToPath(new URL("../frontend/index.tsx", import.meta.url)), prod: fileURLToPath(new URL("../dist/frontend/billing.js", import.meta.url)), plugin: "billing" });
  const db = ctx.component.database;
  const users = ctx.component.user as { current(session: Session): Promise<User | undefined> };
  const auth = ctx.component.auth as AuthService;
  const notifyPath = "/api/billing/epay/notify";
  const returnPath = "/api/billing/epay/return";
  auth.registerPublicPath(notifyPath);
  auth.registerPublicPath(returnPath);
  await db.extend("billing_orders", {
    id: { type: "integer", autoIncrement: true }, order_id: { type: "string", nullable: false }, user_id: { type: "integer", nullable: false },
    amount_cents: { type: "integer", nullable: false }, status: { type: "string", initial: "pending", nullable: false },
    payment_method: { type: "string", nullable: false }, trade_no: { type: "string", initial: "", nullable: false },
    created_at: { type: "timestamp", nullable: false }, paid_at: { type: "timestamp", initial: "", nullable: false },
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
    registerAdapter(adapter) {
      adapters.set(adapter.id, adapter);
      const remove = () => { adapters.delete(adapter.id); };
      ctx.affect(remove);
      return remove;
    },
  };
  const adapters = new Map<string, BillingPaymentAdapter>();
  const epay: BillingPaymentAdapter = {
    id: "epay",
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
      return url.toString();
    },
    verifyNotification: (params) => Boolean(epayEnabled() && validSign(params, pluginConfig.epay.key) && params.pid === pluginConfig.epay.pid),
  };
  billing.registerAdapter(epay);
  ctx.registerComponent("billing", billing);
  const epayEnabled = () => pluginConfig.epay.enabled && pluginConfig.epay.gatewayUrl.startsWith("https://") && pluginConfig.epay.pid && pluginConfig.epay.key;

  ctx.route("/api/billing/summary").methods("GET").action(async (session) => {
    const user = await users.current(session);
    if (!user?.id) { session.status = 401; session.respond({ error: session.text("cloud.billing.errors.auth") }, "json"); return; }
    const [balanceCents, ledger, orders] = await Promise.all([
      billing.balance(user.id), billing.ledger(user.id), db.select("billing_orders", { user_id: user.id }) as Promise<BillingOrder[]>,
    ]);
    session.respond({ balanceCents, ledger, orders: orders.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 50), epayEnabled: Boolean(epayEnabled()), minimumTopUpCents: pluginConfig.minimumTopUpCents }, "json");
  });
  ctx.route("/api/billing/top-up").methods("POST").action(async (session) => {
    const user = await users.current(session);
    if (!user?.id) { session.status = 401; session.respond({ error: session.text("cloud.billing.errors.auth") }, "json"); return; }
    if (!epayEnabled()) { session.status = 503; session.respond({ error: session.text("cloud.billing.unavailable") }, "json"); return; }
    const body = object(await session.parseRequestBody());
    const amountCents = Number(body.amountCents);
    const method = body.method === "wxpay" ? "wxpay" : "alipay";
    if (!Number.isSafeInteger(amountCents) || amountCents < Math.max(1, pluginConfig.minimumTopUpCents) || amountCents > pluginConfig.maximumTopUpCents) {
      session.status = 400; session.respond({ error: session.text("cloud.billing.errors.amount") }, "json"); return;
    }
    const orderId = orderNumber();
    const now = new Date().toISOString();
    const order = await db.create("billing_orders", { order_id: orderId, user_id: user.id, amount_cents: amountCents, status: "pending", payment_method: method, trade_no: "", created_at: now, paid_at: "" }) as BillingOrder;
    try {
      const adapter = adapters.get("epay");
      if (!adapter) throw new Error("Payment adapter is unavailable");
      session.respond({ orderId: order.order_id, paymentUrl: await adapter.createPayment(order, method, session.text("cloud.billing.topUpDescription")) }, "json");
    } catch {
      await db.update("billing_orders", { id: order.id, status: "pending" }, { status: "cancelled" });
      session.status = 503;
      session.respond({ error: session.text("cloud.billing.unavailable") }, "json");
    }
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
    if (!adapter?.verifyNotification(params) || params.trade_status !== "TRADE_SUCCESS") { session.status = 400; session.respond("fail", "plain"); return; }
    const order = await db.selectOne("billing_orders", { order_id: params.out_trade_no }) as BillingOrder | undefined;
    const paidAmount = Math.round(Number(params.money) * 100);
    if (!order || !["pending", "paid"].includes(order.status) || order.payment_method !== params.type || order.amount_cents !== paidAmount) { session.status = 400; session.respond("fail", "plain"); return; }
    try {
      await db.create("billing_ledger", { user_id: order.user_id, amount_cents: order.amount_cents, entry_type: "top_up", reference: `epay:${order.order_id}`, description: session.text("cloud.billing.topUpDescription"), created_at: new Date().toISOString() });
    } catch {
      const credited = await db.selectOne("billing_ledger", { reference: `epay:${order.order_id}`, user_id: order.user_id });
      if (!credited) { session.status = 500; session.respond("fail", "plain"); return; }
    }
    if (order.status !== "paid") await db.update("billing_orders", { id: order.id, status: "pending" }, { status: "paid", trade_no: params.trade_no ?? "", paid_at: new Date().toISOString() });
    session.respond("success", "plain");
  });
  ctx.route("/api/billing/epay/return").methods("GET").action((session, query) => {
    const params = Object.fromEntries(query.entries());
    const ok = adapters.get("epay")?.verifyNotification(params) ?? false;
    session.status = 302;
    session.head.location = `/account/billing?payment=${ok ? "returned" : "unverified"}`;
    session.respond("", "plain");
  });
}

export default apply;
