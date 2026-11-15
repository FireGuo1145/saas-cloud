import { Context, Schema, Session } from "yumeri";
import { fileURLToPath } from "node:url";
import "@mirelia/billing";
import "@mirelia/database-core";
import "@mirelia/dashboard";
import type { BillingService } from "@mirelia/billing";
import type { ProjectService } from "@mirelia/project";
import "@mirelia/project";
import type { StoreFieldOption, StoreProductInput, StoreService } from "@mirelia/store";
import "@mirelia/store";

export const depend = ["billing", "dashboard", "database", "project", "store"];
export const provide = ["rainyun"];

export interface RainyunConfig { apiBaseUrl: string; apiKey: string; timeoutMs: number }
export interface RainyunPlan { id: number; plan_name: string; chinese: string; region: string; machine: string; price: number; cpu: number; memory: number; disk: number; net_out: number; available_stock: number; is_selling: boolean; ip_prices: Record<string, number> }
export interface RainyunOS { id: number; name: string; chinese_name: string; os_type: string; region: string; is_available: boolean }
export interface RainyunRenewalPrice { instanceId: number; hostname: string; currentExpiresAt: string; days: number; priceCents: number; available: boolean; reason?: string }
export interface RainyunService {
  plans(): Promise<RainyunPlan[]>;
  operatingSystems(): Promise<RainyunOS[]>;
  purchase(input: { planId: number; osId: number; duration: number }): Promise<Server>;
  instances(): Promise<Server[]>;
  /** Ask Rainyun for the price of extending a server. */
  renewalPrice(instanceId: number, days: number): Promise<RainyunRenewalPrice>;
  renew(instanceId: number, days: number): Promise<Server>;
}
export interface ProjectServer { id?: number; tenant_id: number; project_id: number; instance_id: number; hostname: string; ipv4: string; status: string; node: string; cpu: number | null; memory: number | null; disk: number | null; expires_at: string; added_by: number; created_at: string }
declare module "@yumerijs/types" { interface Tables { rainyun_project_servers: ProjectServer } }
declare module "yumeri" { interface Components { rainyun: RainyunService } }
export const config: Schema<RainyunConfig> = Schema.object({
  apiBaseUrl: Schema.string("Rainyun API base URL").key("rainyun.apiBaseUrl").default("https://api.v2.rainyun.com"),
  apiKey: Schema.string("Rainyun API key; stored only in server configuration").key("rainyun.apiKey").default(""),
  timeoutMs: Schema.number("Rainyun API timeout in milliseconds").key("rainyun.timeoutMs").default(12000),
});

export type Server = Omit<ProjectServer, "id" | "tenant_id" | "project_id" | "added_by" | "created_at">;
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" ? value as Record<string, unknown> : {}; }
function unwrap(value: unknown): unknown {
  const root = object(value);
  const data = root.data ?? root.Data ?? value;
  const nested = object(data);
  return nested.Data ?? nested.data ?? data;
}
function text(value: unknown, fallback = "") { return typeof value === "string" || typeof value === "number" ? String(value) : fallback; }
function addDays(value: string, days: number) {
  const base = value ? new Date(value) : new Date();
  const start = Number.isNaN(base.getTime()) ? new Date() : base;
  return new Date(start.getTime() + days * 86400000).toISOString();
}
function numberOrNull(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function server(value: unknown): Server | undefined {
  const item = object(value);
  const instanceId = numberOrNull(item.ID ?? item.id ?? item.InstanceID);
  if (!instanceId || instanceId < 1) return undefined;
  return {
    instance_id: instanceId,
    hostname: text(item.HostName ?? item.hostname, `RCS-${instanceId}`).slice(0, 160),
    ipv4: text(item.MainIPv4 ?? item.IPv4 ?? item.ipv4).slice(0, 64),
    status: text(item.Status ?? item.status, "unknown").slice(0, 64),
    node: text(item.Node ?? item.node).slice(0, 120),
    cpu: numberOrNull(item.CPU ?? item.cpu), memory: numberOrNull(item.Memory ?? item.memory),
    disk: numberOrNull(item.Disk ?? item.disk), expires_at: text(item.ExpDate ?? item.expire_at).slice(0, 80),
  };
}

export async function apply(ctx: Context, pluginConfig: RainyunConfig = { apiBaseUrl: "https://api.v2.rainyun.com", apiKey: "", timeoutMs: 12000 }) {
  ctx.i18n({ cloud: { rainyun: {
    nav: { servers: { zh: "雨云服务器", en: "Rainyun servers", ja: "雨雲サーバー" } },
    title: { zh: "雨云云服务器", en: "Rainyun cloud servers", ja: "雨雲クラウドサーバー" },
    description: { zh: "管理关联到此项目的雨云云服务器。", en: "Manage Rainyun cloud servers linked to this project.", ja: "このプロジェクトに関連付けられた雨雲クラウドサーバーを管理します。" },
    linked: { zh: "项目服务器", en: "Project servers", ja: "プロジェクトのサーバー" },
    available: { zh: "可添加服务器", en: "Available servers", ja: "追加可能なサーバー" },
    add: { zh: "添加到项目", en: "Add to project", ja: "プロジェクトに追加" },
    remove: { zh: "取消关联", en: "Unlink", ja: "関連付けを解除" },
    refresh: { zh: "刷新", en: "Refresh", ja: "更新" },
    empty: { zh: "此项目尚未关联服务器", en: "No servers are linked to this project", ja: "このプロジェクトに関連付けられたサーバーはありません" },
    noAvailable: { zh: "没有可关联的雨云服务器", en: "No unlinked Rainyun servers are available", ja: "関連付け可能な雨雲サーバーはありません" },
    permission: { zh: "你没有管理项目云产品的权限。", en: "You do not have permission to manage project products.", ja: "プロジェクト製品を管理する権限がありません。" },
    configMissing: { zh: "请先在服务端配置 Rainyun API Key。", en: "Configure the Rainyun API key on the server first.", ja: "サーバーで Rainyun API キーを設定してください。" },
    loading: { zh: "正在加载服务器…", en: "Loading servers…", ja: "サーバーを読み込み中…" },
    errors: { request: { zh: "Rainyun 请求失败", en: "Rainyun request failed", ja: "Rainyun リクエストに失敗しました" }, load: { zh: "无法加载雨云服务器", en: "Could not load Rainyun servers", ja: "雨雲サーバーを読み込めませんでした" } },
    store: {
      provider: { zh: "雨云 Rainyun", en: "Rainyun", ja: "Rainyun" },
      category: { zh: "云服务器", en: "Cloud servers", ja: "クラウドサーバー" },
      plan: { zh: "套餐", en: "Plan", ja: "プラン" },
      os: { zh: "操作系统", en: "Operating system", ja: "オペレーティングシステム" },
      noOs: { zh: "该地域暂无可用系统", en: "No operating systems in this region", ja: "この地域で利用可能な OS はありません" },
      soldOut: { zh: "售罄", en: "Sold out", ja: "在庫切れ" },
      ipv4: { zh: "公网 IPv4", en: "Public IPv4", ja: "パブリック IPv4" },
      machine: { zh: "机型", en: "Machine", ja: "マシン" },
      region: { zh: "地域", en: "Region", ja: "リージョン" },
      regions: {
        cn_hk: { zh: "香港", en: "Hong Kong", ja: "香港" }, cn_tj: { zh: "天津", en: "Tianjin", ja: "天津" }, cn_yn: { zh: "云南", en: "Yunnan", ja: "雲南" },
        us_ca: { zh: "美国西部", en: "US West", ja: "米国西部" }, us_va: { zh: "美国东部", en: "US East", ja: "米国東部" },
        jp_tokyo: { zh: "东京", en: "Tokyo", ja: "東京" }, sg: { zh: "新加坡", en: "Singapore", ja: "シンガポール" },
      },
      purchaseSummary: { zh: "雨云云服务器 {plan}，购买 {duration} 个月", en: "Rainyun server {plan} for {duration} months", ja: "雨雲サーバー {plan} を {duration} か月" },
      renew: { zh: "续费", en: "Renew", ja: "更新" },
      renewTitle: { zh: "服务器续费", en: "Server renewal", ja: "サーバーの更新" },
      renewDescription: { zh: "为项目中的雨云服务器延长使用时间。", en: "Extend the runtime of a Rainyun server in your project.", ja: "プロジェクト内の雨雲サーバーの利用期間を延長します。" },
      renewServer: { zh: "选择服务器", en: "Server", ja: "サーバー" },
      renewDays: { zh: "续费天数", en: "Days", ja: "日数" },
      renewUntil: { zh: "新到期时间", en: "New expiry", ja: "新しい有効期限" },
      renewPrice: { zh: "续费金额", en: "Renewal price", ja: "更新料金" },
      renewNoServers: { zh: "项目中暂无可续费的雨云服务器", en: "No renewable Rainyun servers in this project", ja: "このプロジェクトに更新可能な雨雲サーバーはありません" },
      renewLoading: { zh: "正在获取价格…", en: "Loading price…", ja: "料金を取得中…" },
      renewUnavailable: { zh: "暂无法获取续费价格，请稍后再试。", en: "The renewal price is unavailable. Try again later.", ja: "更新料金を取得できません。後でもう一度お試しください。" },
      renewNoConfig: { zh: "请先在服务端配置 Rainyun API Key 以使用续费。", en: "Configure the Rainyun API key on the server to renew servers.", ja: "サーバーの更新には Rainyun API キーの設定が必要です。" },
      renewFail: { zh: "续费失败，请稍后再试。", en: "Renewal failed. Try again later.", ja: "更新に失敗しました。後でもう一度お試しください。" },
      renewNoBalance: { zh: "账户余额不足，请先充值。", en: "Insufficient balance. Add funds first.", ja: "残高が不足しています。先にチャージしてください。" },
    },
  } } });
  ctx.component.dashboard.addEntry({ id: "rainyun", dev: fileURLToPath(new URL("../frontend/index.tsx", import.meta.url)), prod: fileURLToPath(new URL("../dist/frontend/rainyun.js", import.meta.url)), plugin: "rainyun" });
  const db = ctx.component.database;
  const projects = ctx.component.project as ProjectService;
  const store = ctx.component.store as StoreService;
  await db.extend("rainyun_project_servers", {
    id: { type: "integer", autoIncrement: true }, tenant_id: { type: "integer", nullable: false }, project_id: { type: "integer", nullable: false },
    instance_id: { type: "integer", nullable: false }, hostname: { type: "string", nullable: false }, ipv4: { type: "string", initial: "", nullable: false },
    status: { type: "string", initial: "unknown", nullable: false }, node: { type: "string", initial: "", nullable: false },
    cpu: { type: "integer", nullable: true }, memory: { type: "integer", nullable: true }, disk: { type: "integer", nullable: true },
    expires_at: { type: "string", initial: "", nullable: false }, added_by: { type: "integer", nullable: false }, created_at: { type: "timestamp", nullable: false },
  }, { unique: ["instance_id"] });

  async function request(path: string, method = "GET", requestBody?: unknown) {
    if (!pluginConfig.apiKey.trim()) throw new Error("RAINYUN_API_KEY_MISSING");
    const base = (pluginConfig.apiBaseUrl || "https://api.v2.rainyun.com").replace(/\/+$/, "");
    const response = await fetch(`${base}${path}`, { method, headers: { "x-api-key": pluginConfig.apiKey, Accept: "application/json", ...(requestBody === undefined ? {} : { "content-type": "application/json" }) }, body: requestBody === undefined ? undefined : JSON.stringify(requestBody), signal: AbortSignal.timeout(Math.max(1000, Math.min(pluginConfig.timeoutMs || 12000, 60000))) });
    if (!response.ok) throw new Error(`Rainyun HTTP ${response.status}`);
    const body: unknown = await response.json();
    const root = object(body);
    const responseCode = root.Code ?? root.code;
    if (typeof responseCode === "number" && responseCode !== 200 && responseCode !== 0) throw new Error("Rainyun rejected the request");
    return unwrap(body);
  }
  async function projectRecord(input: { tenantId: number; projectId: number; userId: number }, owned: Server, status: string) {
    await projects.addProduct("rainyun", {
      tenantId: input.tenantId, projectId: input.projectId, userId: input.userId, type: "server", resourceId: String(owned.instance_id),
      name: owned.hostname || `RCS-${owned.instance_id}`, status,
      attributes: { ipv4: owned.ipv4, node: owned.node, cpu: owned.cpu, memory: owned.memory, disk: owned.disk, expiresAt: owned.expires_at, provider: "Rainyun", origin: status },
    });
  }
  /** Bind an existing Rainyun server to a project once. */
  async function linkServer(input: { tenantId: number; projectId: number; userId: number }, instanceId: number) {
    const owned = (await instanceList()).find((item) => item.instance_id === instanceId);
    if (!owned) throw new Error("RAINYUN_SERVER_NOT_FOUND");
    const existing = await db.selectOne("rainyun_project_servers", { instance_id: instanceId }) as ProjectServer | undefined;
    if (existing && (existing.project_id !== input.projectId || existing.tenant_id !== input.tenantId)) throw new Error("RAINYUN_SERVER_LINKED");
    const now = new Date().toISOString();
    if (existing) return existing;
    const created = await db.create("rainyun_project_servers", {
      ...owned, tenant_id: input.tenantId, project_id: input.projectId, added_by: input.userId, created_at: now,
    }) as ProjectServer;
    await projectRecord(input, owned, "linked");
    return created;
  }
  const rainyun: RainyunService = {
    plans: async () => {
      const data = await request("/product/rcs/plans");
      const items = Array.isArray(data) ? data : Array.isArray(object(data).data) ? object(data).data as unknown[] : [];
      return items.map((raw) => {
        const item = object(raw);
        return {
          id: Number(item.id), plan_name: text(item.plan_name), chinese: text(item.chinese), region: text(item.region), machine: text(item.machine),
          price: Number(item.price), cpu: Number(item.cpu), memory: Number(item.memory), disk: Number(item.disk), net_out: Number(item.net_out),
          available_stock: Number(item.available_stock), is_selling: item.is_selling === true,
          ip_prices: Object.fromEntries(Object.entries(object(item.ip_prices)).map(([key, value]) => [key, Number(value)])),
        };
      }).filter((plan) => Number.isSafeInteger(plan.id) && Number.isFinite(plan.price));
    },
    operatingSystems: async () => {
      const data = await request("/product/rcs/os-templates");
      const items = Array.isArray(data) ? data : Array.isArray(object(data).data) ? object(data).data as unknown[] : [];
      return items.map((raw) => {
        const item = object(raw);
        return { id: Number(item.id), name: text(item.name), chinese_name: text(item.chinese_name), os_type: text(item.os_type), region: text(item.region), is_available: item.is_available === true };
      }).filter((item) => Number.isSafeInteger(item.id));
    },
    purchase: async ({ planId, osId, duration }) => {
      const result = await request("/product/rcs/", "POST", { plan_id: planId, os_id: osId, duration, with_eip_num: 1, with_eip_type: "eipv4" });
      const created = server(result);
      if (!created) throw new Error("Rainyun did not return a server instance");
      return created;
    },
    instances: () => instanceList(),
    renewalPrice: async (instanceId, days) => {
      const owned = (await instanceList()).find((item) => item.instance_id === instanceId);
      if (!owned) throw new Error("Rainyun server not found");
      const query = new URLSearchParams({ day: String(days) });
      let priceCents = 0;
      let available = true;
      let reason: string | undefined;
      try {
        const data = await request(`/product/rcs/${instanceId}/renew/price?${query.toString()}`);
        const root = object(Array.isArray(data) ? data[0] : data);
        const price = Number(root.price ?? root.Price ?? root.total ?? NaN);
        if (Number.isFinite(price) && price >= 0) priceCents = Math.round(price * 100);
        else { available = false; reason = "RAINYUN_PRICE_UNAVAILABLE"; }
      } catch (error) {
        available = false;
        reason = error instanceof Error ? error.message : "RAINYUN_PRICE_UNAVAILABLE";
      }
      return { instanceId, hostname: owned.hostname, currentExpiresAt: owned.expires_at, days, priceCents, available, reason };
    },
    renew: async (instanceId, days) => {
      await request(`/product/rcs/${instanceId}/renew`, "POST", { day: days });
      return server({ ID: instanceId })!;
    },
  };
  ctx.registerComponent("rainyun", rainyun);
  async function instanceList(): Promise<Server[]> {
    const data = await request("/product/rcs/");
    const items = Array.isArray(data) ? data : Array.isArray(object(data).data) ? object(data).data as unknown[] : Array.isArray(object(data).items) ? object(data).items as unknown[] : [];
    return items.map(server).filter((item): item is Server => Boolean(item));
  }

  // ---- Store integration: sell Rainyun servers through the shared store ----

  const regionNames: Record<string, string> = { cn_hk: "Hong Kong", cn_tj: "Tianjin", cn_yn: "Yunnan", us_ca: "US West", us_va: "US East", jp_tokyo: "Tokyo", sg: "Singapore" };
  const regionName = (region: string) => regionNames[region] ?? region;
  const storeLabels = { plan: "Plan", os: "Operating system", duration: "Duration (months)", noOs: "No operating systems available", soldOut: "Sold out" };
  const durationOptions: StoreFieldOption[] = Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1), label: String(index + 1) }));

  async function planOptions(selections: Record<string, string | undefined>): Promise<StoreFieldOption[]> {
    let plans: RainyunPlan[] = [];
    try { plans = await rainyun.plans(); } catch { return []; }
    const selected = Number(selections.plan);
    return plans.filter((plan) => plan.is_selling && (plan.available_stock > 0 || plan.id === selected)).sort((a, b) => a.price - b.price).map((plan) => ({
      value: String(plan.id),
      label: `${plan.chinese || plan.plan_name} · ${regionName(plan.region)}`,
      description: `${plan.cpu} vCPU · ${plan.memory} MB · ${plan.disk} GB · ${plan.net_out} Mbps${plan.available_stock > 0 ? "" : ` · ${storeLabels.soldOut}`}`,
      disabled: plan.available_stock <= 0,
    }));
  }

  async function osOptions(selections: Record<string, string | undefined>): Promise<StoreFieldOption[]> {
    const planId = Number(selections.plan);
    if (!Number.isSafeInteger(planId)) return [];
    let plans: RainyunPlan[] = [], templates: RainyunOS[] = [];
    try { [plans, templates] = await Promise.all([rainyun.plans(), rainyun.operatingSystems()]); } catch { return []; }
    const plan = plans.find((item) => item.id === planId);
    if (!plan) return [];
    const options = templates.filter((os) => os.is_available && (!os.region || os.region === plan.region)).map((os) => ({ value: String(os.id), label: os.chinese_name || os.name, description: os.os_type || undefined }));
    return options.length ? options : [{ value: "", label: storeLabels.noOs, disabled: true }].filter((option) => option.value !== "");
  }

  async function planPriceCents(selections: Record<string, string | undefined>) {
    const planId = Number(selections.plan);
    if (!Number.isSafeInteger(planId)) return 0;
    try {
      const plan = (await rainyun.plans()).find((item) => item.id === planId);
      return plan ? Math.round((plan.price + (plan.ip_prices.eipv4 ?? 0)) * 100) : 0;
    } catch { return 0; }
  }

  function registerStoreOffer() {
    const product = store.registerProduct("rainyun", {
      id: "rcs-server", name: "Rainyun cloud server", provider: "rainyun", category: "server",
      summary: "Cloud servers billed monthly; pick the plan, operating system and months in checkout.",
      priceCents: 0, period: "month", quantity: "fixed", sortOrder: 10, repeatable: true,
      price: (selections) => planPriceCents(selections),
      highlights: ["Public IPv4 included", "Multiple regions", "Billed monthly"],
      fields: [
        { key: "plan", label: storeLabels.plan, required: true, options: planOptions },
        { key: "os", label: storeLabels.os, required: true, options: osOptions },
        { key: "duration", label: storeLabels.duration, required: true, options: durationOptions },
      ],
    });
    const handler = store.registerPurchaseHandler("rainyun", async (request) => {
      const planId = Number(request.selections.plan), osId = Number(request.selections.os), duration = Number(request.selections.duration);
      if (!Number.isSafeInteger(planId) || !Number.isSafeInteger(osId) || !Number.isSafeInteger(duration) || duration < 1 || duration > 12) throw new Error("RAINYUN_SELECTION_INVALID");
      const [plans, templates] = await Promise.all([rainyun.plans(), rainyun.operatingSystems()]);
      const plan = plans.find((item) => item.id === planId && item.is_selling && item.available_stock > 0);
      const os = templates.find((item) => item.id === osId && item.is_available && (!item.region || item.region === plan?.region));
      if (!plan || !os) throw new Error("RAINYUN_SELECTION_INVALID");
      const purchased = await rainyun.purchase({ planId, osId, duration });
      try {
        await db.create("rainyun_project_servers", {
          ...purchased, tenant_id: request.tenant.id!, project_id: request.project.id, added_by: request.user.id!, created_at: new Date().toISOString(),
        });
      } catch { /* The project product record is authoritative; a duplicate link row is not fatal. */ }
      return {
        name: purchased.hostname || `RCS-${purchased.instance_id}`, resourceId: String(purchased.instance_id), status: purchased.status || "active",
        attributes: { ipv4: purchased.ipv4, node: purchased.node, cpu: purchased.cpu, memory: purchased.memory, disk: purchased.disk, expiresAt: purchased.expires_at, provider: "Rainyun", planId, osId, duration, origin: "purchase" },
      };
    });
    return () => { product(); handler(); };
  }

  const offer = registerStoreOffer();
  ctx.affect(() => offer());

  // Renewal hits Rainyun on every price lookup, so results are cached per server and day count for a short while.
  ctx.route("/api/projects/:id/rainyun/renewal-options").methods("GET").action(async (session, _query, id) => {
    const access = await projects.authorize(session, id, "manage_products");
    if (!access?.project.id) return failure(session, 404, session.text("cloud.project.errors.notFound"));
    const linked = await db.select("rainyun_project_servers", { tenant_id: access.tenant.id, project_id: access.project.id }) as ProjectServer[];
    let available = true;
    try { const owned = new Set((await instanceList()).map((item) => item.instance_id)); for (const item of linked) if (!owned.has(item.instance_id)) item.status = "deleted"; }
    catch (error) {
      available = false;
      if (error instanceof Error && error.message === "RAINYUN_API_KEY_MISSING") return failure(session, 503, session.text("cloud.rainyun.store.renewNoConfig"));
    }
    const servers = [];
    for (const server of linked) {
      let expiresAt = server.expires_at;
      if (available) {
        try { expiresAt = (await rainyun.instances()).find((item) => item.instance_id === server.instance_id)?.expires_at || expiresAt; }
        catch { /* Keep the cached expiry when Rainyun is unreachable. */ }
      }
      const expiring = /^\d{4}-\d{2}-\d{2}/.test(expiresAt) && new Date(expiresAt).getTime() - Date.now() < 7 * 86400000;
      servers.push({ instanceId: server.instance_id, hostname: server.hostname, expiresAt, expiring, cpu: server.cpu, memory: server.memory, disk: server.disk, status: server.status });
    }
    session.respond({ servers, available }, "json");
  });
  ctx.route("/api/projects/:id/rainyun/renewal-quote").methods("GET").action(async (session, query, id) => {
    const access = await projects.authorize(session, id, "manage_products");
    if (!access?.project.id) return failure(session, 404, session.text("cloud.project.errors.notFound"));
    const instanceId = Number(query.get("instanceId")), days = Number(query.get("days"));
    if (!Number.isSafeInteger(instanceId) || !Number.isSafeInteger(days) || days < 1 || days > 365) return failure(session, 400, session.text("cloud.rainyun.store.renewFail"));
    try {
      const quote = await rainyun.renewalPrice(instanceId, days);
      session.respond(quote, "json");
    } catch (error) {
      return failure(session, 503, error instanceof Error && error.message === "RAINYUN_API_KEY_MISSING" ? session.text("cloud.rainyun.store.renewNoConfig") : session.text("cloud.rainyun.store.renewUnavailable"));
    }
  });
  ctx.route("/api/projects/:id/rainyun/renewals").methods("POST").action(async (session, _query, id) => {
    const access = await projects.authorize(session, id, "manage_products");
    if (!access?.project.id) return failure(session, 404, session.text("cloud.project.errors.notFound"));
    const body = object(await session.parseRequestBody());
    const instanceId = Number(body.instanceId), days = Number(body.days);
    if (!Number.isSafeInteger(instanceId) || !Number.isSafeInteger(days) || days < 1 || days > 365) return failure(session, 400, session.text("cloud.rainyun.store.renewFail"));
    const linked = await db.selectOne("rainyun_project_servers", { tenant_id: access.tenant.id, project_id: access.project.id, instance_id: instanceId }) as ProjectServer | undefined;
    if (!linked) return failure(session, 404, session.text("cloud.rainyun.errors.load"));
    try {
      const quote = await rainyun.renewalPrice(instanceId, days);
      if (!quote.available) return failure(session, 503, session.text("cloud.rainyun.store.renewUnavailable"));
      const billing = ctx.component.billing as BillingService;
      const reference = `rainyun-renew:${instanceId}:${Date.now()}`;
      if (quote.priceCents > 0 && !await billing.debit(access.user.id!, quote.priceCents, reference, session.text("cloud.rainyun.store.renewTitle"))) return failure(session, 402, session.text("cloud.rainyun.store.renewNoBalance"));
      try {
        await rainyun.renew(instanceId, days);
      } catch (error) {
        if (quote.priceCents > 0) await billing.credit(access.user.id!, quote.priceCents, `refund:${reference}`, session.text("cloud.rainyun.store.renewTitle"), "refund");
        throw error;
      }
      await db.update("rainyun_project_servers", { id: linked.id }, { expires_at: addDays(linked.expires_at, days) });
      session.respond({ ok: true, chargedCents: quote.priceCents, expiresAt: addDays(linked.expires_at, days) }, "json");
    } catch (error) {
      return failure(session, 503, error instanceof Error && error.message === "RAINYUN_API_KEY_MISSING" ? session.text("cloud.rainyun.store.renewNoConfig") : session.text("cloud.rainyun.store.renewFail"));
    }
  });
  function failure(session: Session, status: number, message: string) { session.status = status; session.respond({ error: message }, "json"); }
  ctx.route("/api/projects/:id/rainyun/servers").methods("GET").action(async (session, _query, id) => {
    const access = await projects.authorize(session, id, "view");
    if (!access?.project.id) return failure(session, 404, session.text("cloud.project.errors.notFound"));
    const linked = await db.select("rainyun_project_servers", { tenant_id: access.tenant.id, project_id: access.project.id }) as ProjectServer[];
    const canManage = access.permissions.includes("manage_products");
    if (!canManage) { session.respond({ linked, available: [], canManage }, "json"); return; }
    try {
      const all = await instanceList();
      const bound = new Set((await db.select("rainyun_project_servers", {}) as ProjectServer[]).map((item) => item.instance_id));
      session.respond({ linked, available: all.filter((item) => !bound.has(item.instance_id)), canManage }, "json");
    } catch (error) {
      const status = error instanceof Error && error.message === "RAINYUN_API_KEY_MISSING" ? 503 : 502;
      session.status = status;
      session.respond({ error: status === 503 ? session.text("cloud.rainyun.configMissing") : session.text("cloud.rainyun.errors.load") }, "json");
    }
  });
  ctx.route("/api/projects/:id/rainyun/servers").methods("POST").action(async (session, _query, id) => {
    const access = await projects.authorize(session, id, "manage_products");
    if (!access?.project.id) return failure(session, 404, session.text("cloud.project.errors.notFound"));
    const body = object(await session.parseRequestBody());
    const instanceId = Number(body.instanceId);
    if (!Number.isSafeInteger(instanceId) || instanceId < 1) return failure(session, 400, session.text("cloud.rainyun.errors.load"));
    try {
      const existing = await db.selectOne("rainyun_project_servers", { instance_id: instanceId }) as ProjectServer | undefined;
      if (existing) return failure(session, 409, session.text("cloud.rainyun.errors.load"));
      const created = await linkServer({ tenantId: access.tenant.id!, projectId: access.project.id!, userId: access.user.id! }, instanceId);
      session.status = 201;
      session.respond({ server: created }, "json");
    } catch (error) {
      const status = error instanceof Error && error.message === "RAINYUN_API_KEY_MISSING" ? 503 : 502;
      return failure(session, status, status === 503 ? session.text("cloud.rainyun.configMissing") : session.text("cloud.rainyun.errors.request"));
    }
  });
  ctx.route("/api/projects/:id/rainyun/servers/:instanceId").methods("DELETE").action(async (session, _query, id, instanceId) => {
    const access = await projects.authorize(session, id, "manage_products");
    if (!access?.project.id) return failure(session, 404, session.text("cloud.project.errors.notFound"));
    const serverId = Number(instanceId);
    const existing = await db.selectOne("rainyun_project_servers", { tenant_id: access.tenant.id, project_id: access.project.id, instance_id: serverId }) as ProjectServer | undefined;
    if (!existing) return failure(session, 404, session.text("cloud.rainyun.errors.load"));
    await db.remove("rainyun_project_servers", { id: existing.id });
    const record = await projects.findProduct("rainyun", access.project.id!, "server", String(serverId));
    if (record?.id) await projects.removeProduct("rainyun", access.project.id!, record.id);
    session.respond({ ok: true }, "json");
  });
}

export default apply;
