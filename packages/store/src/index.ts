import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Context, Schema, Session } from "yumeri";
import type { User } from "@mirelia/user";
import type { BillingService } from "@mirelia/billing";
import type { Project, ProjectService, ProjectProductEntry } from "@mirelia/project";
import type { Tenant, TenantService } from "@mirelia/tenant";
import "@mirelia/billing";
import "@mirelia/dashboard";
import "@mirelia/database-core";
import "@mirelia/project";
import "@mirelia/tenant";
import "@mirelia/user";

export const depend = ["billing", "dashboard", "database", "project", "tenant", "user"];
export const provide = ["store"];
export const config: Schema<StoreConfig> = Schema.object({
  currency: Schema.string("ISO 4217 currency code used by price displays").key("store.currency").default("CNY"),
  cartItemLimit: Schema.number("Maximum quantity of one line item in the cart").key("store.cartItemLimit").default(20),
  purchaseEnabled: Schema.boolean("Allow users to check out orders").key("store.purchaseEnabled").default(true),
});

export interface StoreConfig { currency: string; cartItemLimit: number; purchaseEnabled: boolean }

/**
 * A field the buyer must fill before buying, such as an operating system or region.
 * `options` may be static or resolved on every request so prices and stock stay current.
 */
export interface StoreFieldOption { value: string; label: string; description?: string; priceCents?: number; disabled?: boolean }
export interface StoreField {
  key: string;
  label: string;
  required?: boolean;
  multiple?: boolean;
  /** Free-form value instead of a choice; defaults to `select`. */
  type?: "select" | "text" | "number" | "boolean";
  /**
   * Static options, or a resolver that receives the selections already made for the
   * other fields so dependent fields can narrow their choices.
   */
  options?: StoreFieldOption[] | ((selections: StoreFieldValues) => Promise<StoreFieldOption[]>);
}

/**
 * A plugin that sells products registers them through `StoreService.registerProduct`
 * and handles delivery through `registerPurchaseHandler`.
 */
export interface StoreProductInput {
  /** Stable provider-side identifier. Changing it creates a different catalog line. */
  id: string;
  name: string;
  summary?: string;
  description?: string;
  provider: string;
  category?: string;
  /** Recurring price of one unit per period, in minor currency units. */
  priceCents: number;
  period?: "month" | "year" | "one-time";
  quantity?: "fixed" | "select";
  minQuantity?: number;
  maxQuantity?: number;
  highlights?: string[];
  fields?: StoreField[];
  popular?: boolean;
  sortOrder?: number;
  /** When false the store blocks buying the product twice before renewing it. */
  repeatable?: boolean;
  /** Whether the product can be bought right now. Disabled products stay visible. */
  available?: boolean;
  /**
   * Unit price per period for the current selections, in minor units. Used instead of
   * `priceCents` when a provider prices every configuration individually, for example
   * when each plan of a product has its own price.
   */
  price?: (selections: StoreFieldValues) => Promise<number> | number;
}

export interface StoreProduct extends Required<Omit<StoreProductInput, "description" | "summary" | "fields" | "highlights" | "category" | "sortOrder" | "repeatable" | "price">> {
  pluginId: string;
  summary: string;
  description: string;
  category: string;
  highlights: string[];
  fields: StoreField[];
  sortOrder: number;
  repeatable: boolean;
  price?: (selections: StoreFieldValues) => Promise<number> | number;
}

/** The catalog entry as exposed by the HTTP API. Prices and options are resolved. */
export interface StoreProductView {
  key: string;
  pluginId: string;
  id: string;
  name: string;
  summary: string;
  description: string;
  provider: string;
  category: string;
  priceCents: number;
  period: "month" | "year" | "one-time";
  quantity: "fixed" | "select";
  minQuantity: number;
  maxQuantity: number;
  highlights: string[];
  popular: boolean;
  available: boolean;
  repeatable: boolean;
  fields: Array<Omit<StoreField, "options"> & { options: StoreFieldOption[] }>;
}

export type StoreFieldValues = Record<string, string>;

export interface StorePurchaseRequest {
  user: User;
  tenant: Tenant;
  project: { id: number; name: string };
  /** Catalog line that was bought, e.g. `preset-12`. */
  productId: string;
  selections: StoreFieldValues;
  quantity: number;
  /** One-time identifier so a retried checkout never buys twice. */
  idempotencyKey: string;
}

export interface StorePurchaseResult {
  name: string;
  status?: string;
  attributes?: Record<string, unknown>;
  resourceId?: string;
}

export interface StoreCartItem {
  id?: number;
  user_id: number;
  plugin_id: string;
  product_id: string;
  project_id: number;
  quantity: number;
  selections_json: string;
  created_at: string;
  updated_at: string;
}

export type StoreOrderStatus = "pending" | "paid" | "processing" | "fulfilled" | "failed" | "cancelled" | "refunded";
export interface StoreOrder {
  id?: number;
  order_id: string;
  user_id: number;
  total_cents: number;
  status: StoreOrderStatus;
  idempotency_key: string;
  payment_reference: string;
  failure_reason: string;
  created_at: string;
  paid_at: string;
  updated_at: string;
}
export interface StoreOrderItem {
  id?: number;
  order_id: string;
  user_id: number;
  plugin_id: string;
  product_id: string;
  product_name: string;
  project_id: number;
  project_name: string;
  quantity: number;
  unit_price_cents: number;
  period: string;
  selections_json: string;
  status: StoreOrderStatus;
  product_reference: string;
  failure_reason: string;
  created_at: string;
  updated_at: string;
}

export interface StoreQuoteLine {
  pluginId: string;
  productId: string;
  projectId: number;
  quantity: number;
  selections: StoreFieldValues;
}

export interface StoreCartLineView {
  id: number;
  key: string;
  productId: string;
  productKey: string;
  productName: string;
  provider: string;
  summary: string;
  category: string;
  projectId: number;
  projectName: string;
  quantity: number;
  minQuantity: number;
  maxQuantity: number;
  unitPriceCents: number;
  totalCents: number;
  period: string;
  selections: Array<{ key: string; label: string; value: string; valueLabel: string }>;
  available: boolean;
  problem: string;
}

export interface StoreQuoteView {
  lines: StoreCartLineView[];
  subtotalCents: number;
  balanceCents: number;
  currency: string;
  options: { canCheckout: boolean; problems: string[] };
}

export interface StoreService {
  registerProduct(pluginId: string, product: StoreProductInput): () => void;
  /**
   * Register the delivery handler of a selling plugin. The handler runs once the
   * order is paid and must create the purchased resource; returning it lets the
   * store record the product inside the target project.
   */
  registerPurchaseHandler(pluginId: string, handler: (request: StorePurchaseRequest) => Promise<StorePurchaseResult>): () => void;
  listProducts(): StoreProductView[];
  /** Validate and price selection for one product without touching the cart. */
  quoteItem(pluginId: string, productId: string, selections: StoreFieldValues, quantity: number): Promise<{ unitPriceCents: number; quantity: number; selections: StoreFieldValues }>;
  addToCart(session: Session, user: User, input: { productKey: string; projectId: number; quantity?: number; selections?: StoreFieldValues }): Promise<StoreCartItem[]>;
  updateCartItem(session: Session, user: User, itemId: number, updates: { quantity?: number; selections?: StoreFieldValues; projectId?: number }): Promise<StoreCartItem[]>;
  removeCartItem(user: User, itemId: number): Promise<StoreCartItem[]>;
  cart(user: User): Promise<StoreCartItem[]>;
  /** Re-price the cart; the session decides which workspace's projects are usable. */
  quote(session: Session, user: User): Promise<StoreQuoteView>;
  checkout(session: Session, user: User, idempotencyKey: string): Promise<{ order: StoreOrder; items: StoreOrderItem[] }>;
  refreshOrder(session: Session, user: User, orderId: string): Promise<{ order: StoreOrder; items: StoreOrderItem[] }>;
}

declare module "@yumerijs/types" {
  interface Tables {
    store_cart_items: StoreCartItem;
    store_orders: StoreOrder;
    store_order_items: StoreOrderItem;
  }
}
declare module "yumeri" {
  interface Components { store: StoreService }
}

function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

export function productKey(pluginId: string, productId: string) { return `${pluginId}:${productId}`; }
export function storeOrderNumber() { return `SO${Date.now()}${randomUUID().slice(0, 8).toUpperCase()}`; }
export function totalCents(unitPriceCents: number, quantity: number) { return unitPriceCents * quantity; }

export async function apply(ctx: Context, pluginConfig: StoreConfig = { currency: "CNY", cartItemLimit: 20, purchaseEnabled: true }) {
  ctx.i18n({ cloud: { store: {
    nav: { section: { zh: "商城", en: "Store", ja: "ストア" }, catalog: { zh: "全部商品", en: "All products", ja: "すべての製品" }, cart: { zh: "购物车", en: "Cart", ja: "カート" }, orders: { zh: "我的订单", en: "Orders", ja: "注文履歴" } },
    title: { zh: "云产品商城", en: "Cloud product store", ja: "クラウド製品ストア" },
    description: { zh: "选择云产品、加入购物车并结算，购买后会直接关联到所选项目。", en: "Pick cloud products, add them to your cart and check out. Purchases are linked to a project you choose.", ja: "クラウド製品を選び、カートに入れて購入すると、選択したプロジェクトに関連付けられます。" },
    products: { zh: "个商品", en: "products", ja: "製品" },
    allCategories: { zh: "全部", en: "All", ja: "すべて" },
    noProducts: { zh: "当前没有可购买的商品", en: "No products are for sale right now", ja: "現在販売中の製品はありません" },
    search: { zh: "搜索商品", en: "Search products", ja: "製品を検索" },
    categories: { cloud: { zh: "云计算", en: "Cloud", ja: "クラウド" }, server: { zh: "云服务器", en: "Cloud servers", ja: "クラウドサーバー" } },
    loading: { zh: "正在加载商品…", en: "Loading products…", ja: "製品を読み込み中…" },
    refresh: { zh: "刷新", en: "Refresh", ja: "更新" },
    error: { zh: "无法加载商品目录", en: "Could not load the catalog", ja: "商品カタログを読み込めませんでした" },
    popular: { zh: "热门", en: "Popular", ja: "人気" },
    unavailable: { zh: "暂不可售", en: "Unavailable", ja: "販売停止中" },
    perMonth: { zh: "/月", en: "/mo", ja: "/月" },
    perYear: { zh: "/年", en: "/yr", ja: "/年" },
    oneTime: { zh: "一次性", en: "one-time", ja: "買い切り" },
    from: { zh: "起", en: "from", ja: "から" },
    backToStore: { zh: "返回商城", en: "Back to store", ja: "ストアに戻る" },
    addToCart: { zh: "加入购物车", en: "Add to cart", ja: "カートに追加" },
    added: { zh: "已加入购物车", en: "Added to cart", ja: "カートに追加しました" },
    selectProject: { zh: "目标项目", en: "Project", ja: "プロジェクト" },
    noProjects: { zh: "请先创建一个具有管理云产品权限的项目。", en: "Create a project where you can manage cloud products first.", ja: "クラウド製品を管理できるプロジェクトを先に作成してください。" },
    quantity: { zh: "数量", en: "Quantity", ja: "数量" },
    total: { zh: "小计", en: "Subtotal", ja: "小計" },
    purchaseNotice: { zh: "商品价格从账户余额中扣款，购买成功后会作为产品出现在所选项目中。", en: "Prices are charged from your account balance. Purchased items appear as products inside the chosen project.", ja: "料金はアカウント残高から引き落とされ、購入した製品は選択したプロジェクトに追加されます。" },
    cart: {
      title: { zh: "购物车", en: "Shopping cart", ja: "ショッピングカート" },
      description: { zh: "确认数量与配置后一次性结算。", en: "Review quantities and options, then check out in one go.", ja: "数量と設定を確認して一度に購入手続きを行います。" },
      empty: { zh: "购物车是空的。", en: "Your cart is empty.", ja: "カートは空です。" },
      items: { zh: "项商品", en: "items", ja: "点" },
      balance: { zh: "账户余额", en: "Account balance", ja: "アカウント残高" },
      checkout: { zh: "去结算", en: "Check out", ja: "購入手続きへ" },
      checkingOut: { zh: "正在结算…", en: "Checking out…", ja: "手続き中…" },
      remove: { zh: "移除", en: "Remove", ja: "削除" },
      changeProject: { zh: "修改项目", en: "Change project", ja: "プロジェクトを変更" },
      quantityLabel: { zh: "数量", en: "Quantity", ja: "数量" },
      unavailableLine: { zh: "该商品当前不可购买，请移除后结算。", en: "This item cannot be purchased right now. Remove it to check out.", ja: "この商品は現在購入できません。削除してから購入手続きを行ってください。" },
      insufficientBalance: { zh: "账户余额不足，请先充值。", en: "Your balance is too low. Add funds first.", ja: "残高が不足しています。先にチャージしてください。" },
      checkoutDone: { zh: "订单已支付，正在为你创建产品。", en: "Order paid. Your products are being created.", ja: "注文を支払いました。製品を作成しています。" },
      viewOrders: { zh: "查看订单", en: "View orders", ja: "注文を見る" },
      addFunds: { zh: "充值", en: "Add funds", ja: "チャージ" },
    },
    orders: {
      title: { zh: "我的订单", en: "My orders", ja: "注文履歴" },
      description: { zh: "商城订单及其产品交付状态。", en: "Store orders and the delivery state of their products.", ja: "ストア注文と製品の提供状況です。" },
      empty: { zh: "还没有订单。", en: "No orders yet.", ja: "注文はまだありません。" },
      orderId: { zh: "订单号", en: "Order", ja: "注文番号" },
      created: { zh: "下单时间", en: "Placed", ja: "注文日時" },
      amount: { zh: "金额", en: "Amount", ja: "金額" },
      project: { zh: "项目", en: "Project", ja: "プロジェクト" },
      status: { zh: "状态", en: "Status", ja: "ステータス" },
      retry: { zh: "重试交付", en: "Retry delivery", ja: "提供を再試行" },
      retrying: { zh: "正在重试…", en: "Retrying…", ja: "再試行中…" },
      openProject: { zh: "查看产品", en: "Open products", ja: "製品を見る" },
      statuses: {
        pending: { zh: "待支付", en: "Pending", ja: "支払い待ち" },
        paid: { zh: "已支付", en: "Paid", ja: "支払い済み" },
        processing: { zh: "交付中", en: "Delivering", ja: "提供中" },
        fulfilled: { zh: "已完成", en: "Completed", ja: "完了" },
        failed: { zh: "交付失败", en: "Delivery failed", ja: "提供に失敗" },
        cancelled: { zh: "已取消", en: "Cancelled", ja: "キャンセル済み" },
        refunded: { zh: "已退款", en: "Refunded", ja: "返金済み" },
      },
    },
    errors: {
      authRequired: { zh: "请先登录", en: "Authentication is required", ja: "ログインしてください" },
      productNotFound: { zh: "商品不存在或已下架", en: "The product does not exist or is no longer listed", ja: "製品が存在しないか販売終了しました" },
      projectNotFound: { zh: "项目不存在，或你没有管理云产品的权限", en: "Project not found, or you cannot manage cloud products in it", ja: "プロジェクトが存在しないか、クラウド製品を管理する権限がありません" },
      invalidOption: { zh: "请选择有效的商品配置", en: "Choose a valid product configuration", ja: "有効な製品設定を選択してください" },
      invalidQuantity: { zh: "商品数量无效", en: "Invalid product quantity", ja: "製品の数量が無効です" },
      unavailable: { zh: "该商品当前不可购买", en: "This product cannot be purchased right now", ja: "この製品は現在購入できません" },
      cartItemNotFound: { zh: "购物车中没有该商品", en: "The cart does not contain this item", ja: "カートにこの商品はありません" },
      emptyCart: { zh: "购物车是空的", en: "Your cart is empty", ja: "カートは空です" },
      purchaseDisabled: { zh: "商城暂时停止销售", en: "Purchases are temporarily disabled", ja: "購入は一時的に停止しています" },
      insufficientBalance: { zh: "账户余额不足，请先充值。", en: "Insufficient balance. Add funds first.", ja: "残高が不足しています。先にチャージしてください。" },
      checkout: { zh: "结算失败，扣款已退回。", en: "Checkout failed; the debit was refunded.", ja: "購入手続きに失敗し、引き落としは返金されました。" },
      orderNotFound: { zh: "订单不存在", en: "Order not found", ja: "注文が見つかりません" },
      provider: { zh: "商品提供方暂时不可用", en: "The product provider is temporarily unavailable", ja: "製品の提供元が一時的に利用できません" },
      alreadyOwned: { zh: "你已经购买过该商品，可在订单页续费", en: "You already bought this product; renew it from the orders page", ja: "この製品は購入済みです。注文ページから更新できます" },
    },
  } } });

  const db = ctx.component.database;
  const userService = ctx.component.user;
  const billing = ctx.component.billing as BillingService;
  const projectService = ctx.component.project as ProjectService;
  const tenants = ctx.component.tenant as TenantService;
  const currency = pluginConfig.currency || "CNY";
  const cartItemLimit = Math.max(1, Math.min(pluginConfig.cartItemLimit || 20, 100));

  await db.extend("store_cart_items", {
    id: { type: "integer", autoIncrement: true }, user_id: { type: "integer", nullable: false }, plugin_id: { type: "string", nullable: false },
    product_id: { type: "string", nullable: false }, project_id: { type: "integer", nullable: false }, quantity: { type: "integer", initial: 1, nullable: false },
    selections_json: { type: "text", initial: "{}", nullable: false }, created_at: { type: "timestamp", nullable: false }, updated_at: { type: "timestamp", nullable: false },
  }, { unique: [["user_id", "plugin_id", "product_id", "project_id", "selections_json"]] });
  await db.extend("store_orders", {
    id: { type: "integer", autoIncrement: true }, order_id: { type: "string", nullable: false }, user_id: { type: "integer", nullable: false },
    total_cents: { type: "integer", nullable: false }, status: { type: "string", initial: "pending", nullable: false },
    idempotency_key: { type: "string", initial: "", nullable: false }, payment_reference: { type: "string", initial: "", nullable: false },
    failure_reason: { type: "string", initial: "", nullable: false }, created_at: { type: "timestamp", nullable: false },
    paid_at: { type: "timestamp", initial: "", nullable: false }, updated_at: { type: "timestamp", nullable: false },
  }, { unique: ["order_id"] });
  await db.extend("store_order_items", {
    id: { type: "integer", autoIncrement: true }, order_id: { type: "string", nullable: false }, user_id: { type: "integer", nullable: false },
    plugin_id: { type: "string", nullable: false }, product_id: { type: "string", nullable: false }, product_name: { type: "string", nullable: false },
    project_id: { type: "integer", nullable: false }, project_name: { type: "string", initial: "", nullable: false }, quantity: { type: "integer", nullable: false },
    unit_price_cents: { type: "integer", nullable: false }, period: { type: "string", initial: "month", nullable: false },
    selections_json: { type: "text", initial: "{}", nullable: false }, status: { type: "string", initial: "pending", nullable: false },
    product_reference: { type: "string", initial: "", nullable: false }, failure_reason: { type: "string", initial: "", nullable: false },
    created_at: { type: "timestamp", nullable: false }, updated_at: { type: "timestamp", nullable: false },
  }, { unique: [["user_id", "order_id", "plugin_id", "product_id"]] });

  const registrations = new Map<string, { pluginId: string; product: StoreProduct }>();
  const purchases = new Map<string, (request: StorePurchaseRequest) => Promise<StorePurchaseResult>>();
  const orderLocks = new Map<number, Promise<void>>();

  function normalizeField(pluginId: string, field: StoreField): StoreField {
    const key = String(field.key ?? "").trim();
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,62}$/.test(key)) throw new Error(`Invalid store field key for ${pluginId}: ${field.key}`);
    const label = String(field.label ?? "").trim().slice(0, 120);
    if (!label) throw new Error(`Store field ${key} of ${pluginId} needs a label`);
    if (field.options !== undefined && !Array.isArray(field.options) && typeof field.options !== "function") throw new Error(`Store field ${key} of ${pluginId} has invalid options`);
    if (Array.isArray(field.options)) {
      const values = new Set<string>();
      for (const option of field.options) {
        if (typeof option.value !== "string" || !option.value) throw new Error(`Store field ${key} of ${pluginId} has an option without a value`);
        if (values.has(option.value)) throw new Error(`Store field ${key} of ${pluginId} repeats option ${option.value}`);
        values.add(option.value);
      }
    }
    const type = field.type === "text" || field.type === "number" || field.type === "boolean" ? field.type : "select";
    return { ...field, key, label, type, required: field.required === true, multiple: field.multiple === true };
  }

  function normalizeProduct(pluginId: string, input: StoreProductInput): StoreProduct {
    const source = pluginId.trim();
    if (!/^[a-z][a-z0-9_.-]{1,99}$/i.test(source)) throw new Error(`Invalid store plugin id: ${pluginId}`);
    const id = String(input.id ?? "").trim().slice(0, 120);
    const name = String(input.name ?? "").trim().slice(0, 160);
    const priceCents = Number(input.priceCents);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}$/.test(id)) throw new Error(`Invalid store product id for ${source}: ${input.id}`);
    if (!name) throw new Error(`Store product ${source}:${id} needs a name`);
    if (!Number.isSafeInteger(priceCents) || priceCents < 0) throw new Error(`Store product ${source}:${id} needs an integer price in cents`);
    const quantity = input.quantity === "select" ? "select" : "fixed";
    const minQuantity = quantity === "select" ? Math.max(1, Math.min(Math.trunc(input.minQuantity ?? 1), 99)) : 1;
    const maxQuantity = quantity === "select" ? Math.max(minQuantity, Math.min(Math.trunc(input.maxQuantity ?? cartItemLimit), cartItemLimit)) : 1;
    const period = input.period === "year" || input.period === "one-time" ? input.period : "month";
    const fields = (input.fields ?? []).map((field) => normalizeField(source, field));
    if (new Set(fields.map((field) => field.key)).size !== fields.length) throw new Error(`Store product ${source}:${id} repeats field keys`);
    return {
      pluginId: source, id, name, provider: String(input.provider ?? source).trim().slice(0, 80) || source,
      summary: String(input.summary ?? "").trim().slice(0, 400), description: String(input.description ?? "").trim().slice(0, 4000),
      category: String(input.category ?? "cloud").trim().slice(0, 60) || "cloud", priceCents, period, quantity, minQuantity, maxQuantity,
      highlights: (input.highlights ?? []).map((item) => String(item).trim().slice(0, 120)).filter(Boolean).slice(0, 12),
      fields, popular: input.popular === true, sortOrder: Number.isFinite(input.sortOrder) ? Number(input.sortOrder) : 100, available: input.available !== false,
      repeatable: input.repeatable !== false, price: typeof input.price === "function" ? input.price : undefined,
    };
  }

  async function resolveOptions(field: StoreField, selections: StoreFieldValues = {}): Promise<StoreFieldOption[]> {
    if (!field.options) return [];
    const options = typeof field.options === "function" ? await field.options(selections) : field.options;
    return options.filter((option) => option && typeof option.value === "string").map((option) => ({
      value: option.value, label: String(option.label ?? option.value).slice(0, 200), description: option.description ? String(option.description).slice(0, 400) : undefined,
      priceCents: Number.isFinite(option.priceCents) ? Number(option.priceCents) : undefined, disabled: option.disabled === true,
    }));
  }

  function view(product: StoreProduct, resolved?: Map<string, StoreFieldOption[]>, priceCents = product.priceCents): StoreProductView {
    return {
      key: productKey(product.pluginId, product.id), pluginId: product.pluginId, id: product.id, name: product.name, summary: product.summary,
      description: product.description, provider: product.provider, category: product.category, priceCents, period: product.period,
      quantity: product.quantity, minQuantity: product.minQuantity, maxQuantity: product.maxQuantity, highlights: product.highlights,
      popular: product.popular, available: product.available, repeatable: product.repeatable,
      fields: product.fields.map((field) => ({ key: field.key, label: field.label, type: field.type ?? "select", required: field.required, multiple: field.multiple, options: resolved?.get(field.key) ?? [] })),
    };
  }

  function sorted() {
    return [...registrations.values()].sort((a, b) => a.product.sortOrder - b.product.sortOrder || a.product.name.localeCompare(b.product.name));
  }

  function parseSelections(value: string): StoreFieldValues {
    try {
      const parsed = JSON.parse(value || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    } catch { return {}; }
  }

  function stableSelections(values: StoreFieldValues) {
    return JSON.stringify(Object.fromEntries(Object.entries(values).sort(([a], [b]) => a.localeCompare(b))));
  }

  async function validateSelections(product: StoreProduct, input: StoreFieldValues) {
    const normalized: StoreFieldValues = {};
    const labels: Record<string, { label: string; option: string }> = {};
    let extraPriceCents = 0;
    for (const field of product.fields) {
      const raw = input[field.key];
      const value = typeof raw === "string" ? raw.trim() : "";
      if (!value) {
        if (field.required) throw fieldFailure("STORE_FIELD_REQUIRED", field.key);
        continue;
      }
      if (field.type === "text" || field.type === "number" || field.type === "boolean") {
        if (field.type === "number" && !Number.isFinite(Number(value))) throw fieldFailure("STORE_FIELD_INVALID", field.key);
        if (field.type === "boolean" && !["true", "false"].includes(value)) throw fieldFailure("STORE_FIELD_INVALID", field.key);
        const bounded = value.slice(0, 200);
        normalized[field.key] = bounded;
        labels[field.key] = { label: field.label, option: bounded };
        continue;
      }
      const options = await resolveOptions(field, normalized);
      const known = options.find((option) => option.value === value);
      if (!known || known.disabled) throw fieldFailure("STORE_FIELD_INVALID", field.key);
      normalized[field.key] = value;
      labels[field.key] = { label: field.label, option: known.label };
      if (known.priceCents) extraPriceCents += known.priceCents;
    }
    return { selections: normalized, labels, extraPriceCents };
  }

  async function quoteLine(pluginId: string, productId: string, selections: StoreFieldValues, quantity: number) {
    const registration = registrations.get(productKey(pluginId, productId));
    if (!registration) throw failure("STORE_PRODUCT_NOT_FOUND");
    const product = registration.product;
    if (!product.available) throw failure("STORE_UNAVAILABLE");
    const validated = await validateSelections(product, selections);
    const requested = Number.isFinite(quantity) ? Math.trunc(quantity) : product.minQuantity;
    const bounded = Math.max(product.minQuantity, Math.min(requested, product.maxQuantity));
    const base = product.price ? Math.round(Number(await product.price(validated.selections))) : product.priceCents;
    const unitPriceCents = base + validated.extraPriceCents;
    if (!Number.isSafeInteger(unitPriceCents) || unitPriceCents < 0) throw failure("STORE_PRICE_UNAVAILABLE");
    return { product, registration, selections: validated.selections, labels: validated.labels, quantity: bounded, unitPriceCents };
  }

  async function accessibleProjects(session: Session, user: User) {
    const result: Array<{ id: number; name: string }> = [];
    if (user.id === undefined) return result;
    const seen = new Set<number>();
    for (const tenant of await tenants.listForUser(user.id)) {
      if (!tenant.id || tenant.status !== "active") continue;
      for (const project of await projectService.list(tenant.id)) {
        if (!project.id || seen.has(project.id)) continue;
        if (!(await allowedProject(session, user, project.id))) continue;
        seen.add(project.id);
        result.push({ id: project.id, name: project.name });
      }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * `ProjectService.authorize` derives the tenant from the request session, which may
   * select a different workspace than the project belongs to. Plugin-side checks use
   * the project's own workspace instead.
   */
  async function projectAccess(session: Session, user: User, projectId: number) {
    if (user.id === undefined || !Number.isSafeInteger(projectId) || projectId < 1) return undefined;
    try {
      const project = await db.selectOne("projects", { id: projectId, status: "active" }) as Project | undefined;
      if (!project) return undefined;
      const tenant = await tenants.findById(project.tenant_id);
      if (!tenant?.id || tenant.status !== "active" || !(await tenants.canAccess(user.id, tenant.id))) return undefined;
      const previous = Object.getOwnPropertyDescriptor(session, "client");
      const headers = session.client?.req?.headers ?? {};
      Object.defineProperty(session, "client", { value: { ...session.client, req: { ...session.client?.req, headers: { ...headers, "x-tenant-id": String(tenant.id) } } }, configurable: true });
      try { return await projectService.authorize(session, projectId, "manage_products"); }
      finally { if (previous) Object.defineProperty(session, "client", previous); }
    } catch { return undefined; }
  }

  async function allowedProject(session: Session, user: User, projectId: number) {
    return Boolean(await projectAccess(session, user, projectId));
  }

  function failure(code: string, field?: string) {
    const error = new Error(code) as Error & { code: string; field?: string };
    error.code = code;
    if (field) error.field = field;
    return error;
  }
  function fieldFailure(code: string, field: string) { return failure(code, field); }

  const store: StoreService = {
    registerProduct(pluginId, input) {
      const product = normalizeProduct(pluginId, input);
      const key = productKey(product.pluginId, product.id);
      registrations.set(key, { pluginId: product.pluginId, product });
      const remove = () => { if (registrations.get(key)?.product === product) registrations.delete(key); };
      ctx.affect(remove);
      return remove;
    },
    registerPurchaseHandler(pluginId, handler) {
      const source = pluginId.trim();
      if (!source || typeof handler !== "function") throw new Error("Invalid store purchase handler");
      purchases.set(source, handler);
      const remove = () => { if (purchases.get(source) === handler) purchases.delete(source); };
      ctx.affect(remove);
      return remove;
    },
    listProducts() { return sorted().map(({ product }) => view(product)); },
    async quoteItem(pluginId, productId, selections, quantity) {
      const line = await quoteLine(pluginId, productId, selections, quantity);
      return { unitPriceCents: line.unitPriceCents, quantity: line.quantity, selections: line.selections };
    },
    async cart(user) {
      return (await db.select("store_cart_items", { user_id: user.id })).sort((a, b) => b.id! - a.id!) as StoreCartItem[];
    },
    async addToCart(session, user, input) {
      const [pluginId, ...rest] = String(input.productKey ?? "").split(":");
      const productId = rest.join(":");
      const registration = registrations.get(productKey(pluginId, productId));
      if (!registration) throw failure("STORE_PRODUCT_NOT_FOUND");
      const projectId = Number(input.projectId);
      if (!Number.isSafeInteger(projectId) || !(await allowedProject(session, user, projectId))) throw failure("STORE_PROJECT_NOT_FOUND");
      const line = await quoteLine(pluginId, productId, input.selections ?? {}, Number(input.quantity ?? registration.product.minQuantity));
      const selectionsJson = stableSelections(line.selections);
      const existing = await db.selectOne("store_cart_items", { user_id: user.id, plugin_id: pluginId, product_id: productId, project_id: projectId, selections_json: selectionsJson }) as StoreCartItem | undefined;
      const now = new Date().toISOString();
      if (existing) {
        const quantity = Math.max(line.product.minQuantity, Math.min(existing.quantity + line.quantity, line.product.maxQuantity));
        await db.update("store_cart_items", { id: existing.id }, { quantity, updated_at: now });
      } else {
        await db.create("store_cart_items", { user_id: user.id!, plugin_id: pluginId, product_id: productId, project_id: projectId, quantity: line.quantity, selections_json: selectionsJson, created_at: now, updated_at: now });
      }
      return store.cart(user);
    },
    async updateCartItem(session, user, itemId, updates) {
      const item = await db.selectOne("store_cart_items", { id: itemId, user_id: user.id }) as StoreCartItem | undefined;
      if (!item) throw failure("STORE_CART_ITEM_NOT_FOUND");
      const registration = registrations.get(productKey(item.plugin_id, item.product_id));
      const now = new Date().toISOString();
      const projectId = updates.projectId === undefined ? item.project_id : Number(updates.projectId);
      if (!Number.isSafeInteger(projectId) || !(await allowedProject(session, user, projectId))) throw failure("STORE_PROJECT_NOT_FOUND");
      const line = registration ? await quoteLine(item.plugin_id, item.product_id, updates.selections ?? parseSelections(item.selections_json), updates.quantity ?? item.quantity) : undefined;
      const quantity = line ? line.quantity : Math.max(1, Math.min(Math.trunc(updates.quantity ?? item.quantity), cartItemLimit));
      await db.update("store_cart_items", { id: item.id }, {
        quantity, project_id: projectId, selections_json: line ? stableSelections(line.selections) : item.selections_json, updated_at: now,
      });
      return store.cart(user);
    },
    async removeCartItem(user, itemId) {
      await db.remove("store_cart_items", { id: itemId, user_id: user.id });
      return store.cart(user);
    },
    async quote(session, user) {
      const [items, projects, balanceCents] = await Promise.all([store.cart(user), accessibleProjects(session, user), billing.balance(user.id!)]);
      const projectNames = new Map(projects.map((project) => [project.id, project.name]));
      const history = await db.select("store_order_items", { user_id: user.id }) as StoreOrderItem[];
      const purchased = new Set(history.filter((item) => item.status === "fulfilled").map((item) => productKey(item.plugin_id, item.product_id)));
      const lines: StoreCartLineView[] = [];
      let subtotalCents = 0;
      for (const item of items) {
        const registration = registrations.get(productKey(item.plugin_id, item.product_id));
        const selections = parseSelections(item.selections_json);
        const base = { id: item.id!, key: `${item.plugin_id}:${item.product_id}`, productId: item.product_id, productKey: productKey(item.plugin_id, item.product_id), projectId: item.project_id, projectName: projectNames.get(item.project_id) ?? "", quantity: item.quantity };
        const owned = purchased.has(base.key);
        if (!registration || !projectNames.has(item.project_id)) {
          lines.push({ ...base, productName: registration?.product.name ?? item.product_id, provider: registration?.product.provider ?? item.plugin_id, summary: "", category: "", minQuantity: 1, maxQuantity: cartItemLimit, unitPriceCents: 0, totalCents: 0, period: "month", selections: [], available: false, problem: registration ? "STORE_PROJECT_NOT_FOUND" : "STORE_PRODUCT_NOT_FOUND" });
          continue;
        }
        try {
          const line = await quoteLine(item.plugin_id, item.product_id, selections, item.quantity);
          const lineTotal = totalCents(line.unitPriceCents, line.quantity);
          subtotalCents += lineTotal;
          lines.push({
            ...base, productName: line.product.name, provider: line.product.provider, summary: line.product.summary, category: line.product.category,
            quantity: line.quantity, minQuantity: line.product.minQuantity, maxQuantity: line.product.maxQuantity, unitPriceCents: line.unitPriceCents,
            totalCents: lineTotal, period: line.product.period,
            selections: Object.entries(line.selections).map(([key, value]) => ({ key, label: line.labels[key]?.label ?? key, value, valueLabel: line.labels[key]?.option ?? value })),
            available: line.product.repeatable !== false || !owned,
            problem: line.product.repeatable === false && owned ? "STORE_ALREADY_OWNED" : line.quantity !== item.quantity ? "STORE_QUANTITY_ADJUSTED" : "",
          });
        } catch (error) {
          if (!owned) lines.push({ ...base, productName: registration.product.name, provider: registration.product.provider, summary: registration.product.summary, category: registration.product.category, minQuantity: registration.product.minQuantity, maxQuantity: registration.product.maxQuantity, unitPriceCents: 0, totalCents: 0, period: registration.product.period, selections: [], available: false, problem: error instanceof Error ? error.message : "STORE_UNAVAILABLE" });
        }
      }
      const problems: string[] = [];
      if (!lines.length) problems.push("STORE_EMPTY_CART");
      if (lines.some((line) => !line.available)) problems.push("STORE_UNAVAILABLE_LINE");
      if (subtotalCents > balanceCents) problems.push("STORE_INSUFFICIENT_BALANCE");
      if (!pluginConfig.purchaseEnabled) problems.push("STORE_PURCHASE_DISABLED");
      return { lines, subtotalCents, balanceCents, currency, options: { canCheckout: problems.length === 0, problems } };
    },
    async checkout(session, user, idempotencyKey) {
      if (!pluginConfig.purchaseEnabled) throw failure("STORE_PURCHASE_DISABLED");
      const key = String(idempotencyKey ?? "").trim().slice(0, 120);
      if (key) {
        const prior = await db.selectOne("store_orders", { user_id: user.id, idempotency_key: key }) as StoreOrder | undefined;
        if (prior) return { order: prior, items: await db.select("store_order_items", { order_id: prior.order_id }) as StoreOrderItem[] };
      }
      return withOrderLock(user.id!, async () => {
        if (key) {
          const prior = await db.selectOne("store_orders", { user_id: user.id, idempotency_key: key }) as StoreOrder | undefined;
          if (prior) return { order: prior, items: await db.select("store_order_items", { order_id: prior.order_id }) as StoreOrderItem[] };
        }
        const quote = await store.quote(session, user);
        if (!quote.lines.length) throw failure("STORE_EMPTY_CART");
        const unavailable = quote.lines.find((line) => !line.available);
        if (unavailable) throw failure(unavailable.problem || "STORE_UNAVAILABLE");
        const orderId = storeOrderNumber();
        const reference = `store-order:${orderId}`;
        const now = new Date().toISOString();
        const order = await db.create("store_orders", {
          order_id: orderId, user_id: user.id!, total_cents: quote.subtotalCents, status: "pending", idempotency_key: key,
          payment_reference: reference, failure_reason: "", created_at: now, paid_at: "", updated_at: now,
        }) as StoreOrder;
        const items: StoreOrderItem[] = [];
        for (const line of quote.lines) {
          items.push(await db.create("store_order_items", {
            order_id: orderId, user_id: user.id!, plugin_id: line.productKey.split(":")[0], product_id: line.productId, product_name: line.productName,
            project_id: line.projectId, project_name: line.projectName, quantity: line.quantity, unit_price_cents: line.unitPriceCents, period: line.period,
            selections_json: JSON.stringify(Object.fromEntries(line.selections.map((selection) => [selection.key, selection.value]))),
            status: "pending", product_reference: "", failure_reason: "", created_at: now, updated_at: now,
          }) as StoreOrderItem);
        }
        const debited = await billing.debit(user.id!, quote.subtotalCents, reference, `Store order ${orderId}`);
        if (!debited) {
          await db.update("store_orders", { id: order.id }, { status: "cancelled", updated_at: new Date().toISOString() });
          throw failure("STORE_INSUFFICIENT_BALANCE");
        }
        await db.update("store_orders", { id: order.id }, { status: "paid", paid_at: new Date().toISOString(), updated_at: new Date().toISOString() });
        for (const line of quote.lines) await db.remove("store_cart_items", { id: line.id, user_id: user.id });
        const delivered = await deliver(session, user, { ...order, status: "paid", paid_at: now });
        return { order: delivered.order, items: delivered.items };
      });
    },
    async refreshOrder(session, user, orderId) {
      const order = await db.selectOne("store_orders", { order_id: orderId, user_id: user.id }) as StoreOrder | undefined;
      if (!order) throw failure("STORE_ORDER_NOT_FOUND");
      if (order.status !== "paid" && order.status !== "processing" && order.status !== "failed") return { order, items: await db.select("store_order_items", { order_id: order.order_id }) as StoreOrderItem[] };
      return withOrderLock(user.id!, () => deliver(session, user, order));
    },
  };
  ctx.registerComponent("store", store);

  /** Hand a paid order to the plugins that own its products. */
  async function deliver(session: Session, user: User, order: StoreOrder) {
    const items = await db.select("store_order_items", { order_id: order.order_id }) as StoreOrderItem[];
    const pending = items.filter((item) => item.status !== "fulfilled");
    if (!pending.length) {
      if (order.status !== "fulfilled") await db.update("store_orders", { id: order.id }, { status: "fulfilled", updated_at: new Date().toISOString() });
      return { order: { ...order, status: "fulfilled" as StoreOrderStatus }, items };
    }
    await db.update("store_orders", { id: order.id }, { status: "processing", updated_at: new Date().toISOString() });
    let refundCents = 0;
    let failure = "";
    for (const item of pending) {
      const registration = registrations.get(productKey(item.plugin_id, item.product_id));
      const purchase = purchases.get(item.plugin_id);
      const now = new Date().toISOString();
      if (!registration || !purchase) {
        await db.update("store_order_items", { id: item.id }, { status: "failed", failure_reason: "STORE_PRODUCT_NOT_FOUND", updated_at: now });
        refundCents += totalCents(item.unit_price_cents, item.quantity);
        failure = failure || "STORE_PRODUCT_NOT_FOUND";
        continue;
      }
      const access = await projectAccess(session, user, item.project_id);
      if (!access?.project.id || !access.tenant.id) {
        await db.update("store_order_items", { id: item.id }, { status: "failed", failure_reason: "STORE_PROJECT_NOT_FOUND", updated_at: now });
        refundCents += totalCents(item.unit_price_cents, item.quantity);
        failure = failure || "STORE_PROJECT_NOT_FOUND";
        continue;
      }
      try {
        const result = await purchase({
          user, tenant: access.tenant, project: { id: access.project.id, name: access.project.name },
          productId: item.product_id,
          selections: parseSelections(item.selections_json), quantity: item.quantity, idempotencyKey: `${order.order_id}:${item.plugin_id}:${item.product_id}`,
        });
        const product: ProjectProductEntry = await projectService.addProduct(item.plugin_id, {
          tenantId: access.tenant.id, projectId: access.project.id, userId: user.id!, type: registration.product.category === "server" ? "server" : "service",
          resourceId: String(result.resourceId ?? `${order.order_id}:${item.plugin_id}:${item.product_id}`), name: result.name || registration.product.name,
          status: result.status ?? "active", attributes: { ...result.attributes, orderId: order.order_id, productId: item.product_id, provider: registration.product.provider, quantity: item.quantity },
          orderId: order.order_id,
        });
        await db.update("store_order_items", { id: item.id }, { status: "fulfilled", product_reference: String(product.id ?? product.resource_id), failure_reason: "", updated_at: now });
      } catch (error) {
        await db.update("store_order_items", { id: item.id }, { status: "failed", failure_reason: error instanceof Error ? error.message.slice(0, 300) : "STORE_PROVIDER_ERROR", updated_at: now });
        refundCents += totalCents(item.unit_price_cents, item.quantity);
        failure = failure || "STORE_PROVIDER_ERROR";
      }
    }
    if (refundCents > 0) {
      await billing.credit(user.id!, refundCents, `refund:${order.payment_reference}:${randomUUID().slice(0, 8)}`, `Store order ${order.order_id} refund`, "refund");
    }
    const delivered = await db.select("store_order_items", { order_id: order.order_id }) as StoreOrderItem[];
    const status: StoreOrderStatus = delivered.every((item) => item.status === "fulfilled") ? "fulfilled" : delivered.every((item) => item.status === "failed") ? "failed" : "fulfilled";
    await db.update("store_orders", { id: order.id }, { status, failure_reason: failure, updated_at: new Date().toISOString() });
    return { order: { ...order, status, failure_reason: failure }, items: delivered };
  }

  async function withOrderLock<T>(userId: number, operation: () => Promise<T>): Promise<T> {
    const previous = orderLocks.get(userId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    orderLocks.set(userId, current);
    await previous;
    try { return await operation(); }
    finally {
      release();
      if (orderLocks.get(userId) === current) orderLocks.delete(userId);
    }
  }

  function requireUser(session: Session) {
    return userService.current(session);
  }
  function fail(session: Session, status: number, key: string, extra: Record<string, unknown> = {}) {
    session.status = status;
    session.respond({ error: session.text(key), code: key, ...extra }, "json");
  }
  function reportError(session: Session, error: unknown, fallback = "cloud.store.errors.checkout") {
    const code = error instanceof Error ? error.message : "";
    const known = code.startsWith("STORE_") && ctx.getCore().i18n.isRegistered(`cloud.store.errors.${codeMap(code)}`);
    const field = (error as Error & { field?: string }).field;
    if (!known) { fail(session, 502, fallback, { detail: code.slice(0, 200) }); return; }
    fail(session, statusOf(code), `cloud.store.errors.${codeMap(code)}`, field ? { field } : {});
  }
  function codeMap(code: string) {
    const base = code.split(":")[0];
    return ({
      STORE_PRODUCT_NOT_FOUND: "productNotFound", STORE_PROJECT_NOT_FOUND: "projectNotFound", STORE_FIELD_REQUIRED: "invalidOption",
      STORE_FIELD_INVALID: "invalidOption", STORE_QUANTITY_INVALID: "invalidQuantity", STORE_UNAVAILABLE: "unavailable",
      STORE_CART_ITEM_NOT_FOUND: "cartItemNotFound", STORE_EMPTY_CART: "emptyCart", STORE_PURCHASE_DISABLED: "purchaseDisabled",
      STORE_INSUFFICIENT_BALANCE: "insufficientBalance", STORE_ORDER_NOT_FOUND: "orderNotFound", STORE_UNAVAILABLE_LINE: "unavailable",
      STORE_PROVIDER_ERROR: "provider", STORE_QUANTITY_ADJUSTED: "invalidQuantity", STORE_ALREADY_OWNED: "alreadyOwned", STORE_PRICE_UNAVAILABLE: "provider",
    } as Record<string, string>)[base] ?? "checkout";
  }
  function statusOf(code: string) {
    const base = code.split(":")[0];
    if (base === "STORE_INSUFFICIENT_BALANCE") return 402;
    if (base === "STORE_PURCHASE_DISABLED" || base === "STORE_PROVIDER_ERROR") return 503;
    if (base === "STORE_PRODUCT_NOT_FOUND" || base === "STORE_PROJECT_NOT_FOUND" || base === "STORE_ORDER_NOT_FOUND" || base === "STORE_CART_ITEM_NOT_FOUND") return 404;
    return 400;
  }

  ctx.route("/api/store/products").methods("GET").action(async (session) => {
    const user = await requireUser(session);
    if (!user?.id) return fail(session, 401, "cloud.store.errors.authRequired");
    const products: StoreProductView[] = [];
    for (const { product } of sorted()) {
      const resolved = new Map<string, StoreFieldOption[]>();
      for (const field of product.fields) {
        try { resolved.set(field.key, await resolveOptions(field, {})); }
        catch { resolved.set(field.key, []); }
      }
      let priceCents = product.priceCents;
      if (product.price) {
        try { priceCents = Math.round(Number(await product.price({}))) || 0; }
        catch { priceCents = 0; }
      }
      products.push(view(product, resolved, priceCents));
    }
    session.respond({ products, projects: await accessibleProjects(session, user), currency, purchaseEnabled: pluginConfig.purchaseEnabled !== false }, "json");
  });

  ctx.route("/api/store/cart").methods("GET").action(async (session) => {
    const user = await requireUser(session);
    if (!user?.id) return fail(session, 401, "cloud.store.errors.authRequired");
    const [items, quote, projects] = await Promise.all([store.cart(user), store.quote(session, user), accessibleProjects(session, user)]);
    session.respond({ items, quote, projects }, "json");
  });
  ctx.route("/api/store/cart").methods("POST").action(async (session) => {
    const user = await requireUser(session);
    if (!user?.id) return fail(session, 401, "cloud.store.errors.authRequired");
    const body = object(await session.parseRequestBody());
    try {
      const items = await store.addToCart(session, user, { productKey: String(body.productKey ?? ""), projectId: Number(body.projectId), quantity: Number(body.quantity ?? 1), selections: Object.fromEntries(Object.entries(object(body.selections)).map(([key, value]) => [key, String(value)])) });
      const quote = await store.quote(session, user);
      session.status = 201;
      session.respond({ items, quote }, "json");
    } catch (error) { reportError(session, error, "cloud.store.errors.invalidOption"); }
  });
  ctx.route("/api/store/cart/:id").methods("PUT").action(async (session, _query, id) => {
    const user = await requireUser(session);
    if (!user?.id) return fail(session, 401, "cloud.store.errors.authRequired");
    const body = object(await session.parseRequestBody());
    try {
      const items = await store.updateCartItem(session, user, Number(id), {
        quantity: body.quantity === undefined ? undefined : Number(body.quantity),
        projectId: body.projectId === undefined ? undefined : Number(body.projectId),
        selections: body.selections === undefined ? undefined : Object.fromEntries(Object.entries(object(body.selections)).map(([key, value]) => [key, String(value)])),
      });
      session.respond({ items, quote: await store.quote(session, user) }, "json");
    } catch (error) { reportError(session, error, "cloud.store.errors.invalidOption"); }
  });
  ctx.route("/api/store/cart/:id").methods("DELETE").action(async (session, _query, id) => {
    const user = await requireUser(session);
    if (!user?.id) return fail(session, 401, "cloud.store.errors.authRequired");
    const items = await store.removeCartItem(user, Number(id));
    session.respond({ items, quote: await store.quote(session, user) }, "json");
  });

  ctx.route("/api/store/checkout").methods("POST").action(async (session) => {
    const user = await requireUser(session);
    if (!user?.id) return fail(session, 401, "cloud.store.errors.authRequired");
    const body = object(await session.parseRequestBody());
    try {
      const result = await store.checkout(session, user, String(body.idempotencyKey ?? ""));
      session.status = 201;
      session.respond(result, "json");
    } catch (error) { reportError(session, error); }
  });

  ctx.route("/api/store/orders").methods("GET").action(async (session) => {
    const user = await requireUser(session);
    if (!user?.id) return fail(session, 401, "cloud.store.errors.authRequired");
    const orders = (await db.select("store_orders", { user_id: user.id }) as StoreOrder[]).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 50);
    const items = await db.select("store_order_items", { user_id: user.id }) as StoreOrderItem[];
    session.respond({ orders: orders.map((order) => ({ ...order, items: items.filter((item) => item.order_id === order.order_id) })), currency }, "json");
  });
  ctx.route("/api/store/orders/:orderId").methods("GET").action(async (session, _query, orderId) => {
    const user = await requireUser(session);
    if (!user?.id) return fail(session, 401, "cloud.store.errors.authRequired");
    try { session.respond(await store.refreshOrder(session, user, orderId), "json"); }
    catch (error) { reportError(session, error, "cloud.store.errors.orderNotFound"); }
  });

  ctx.component.dashboard.addEntry({ id: "store", dev: fileURLToPath(new URL("../frontend/index.tsx", import.meta.url)), prod: fileURLToPath(new URL("../dist/frontend/store.js", import.meta.url)), plugin: "store" });
}

export default apply;
