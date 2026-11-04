import { Context, Schema, Session } from "yumeri";
import { fileURLToPath } from "node:url";
import "@mirelia/database-core";
import "@mirelia/dashboard";
import type { ProjectService } from "@mirelia/project";
import "@mirelia/project";

export const depend = ["database", "dashboard", "project"];
export const provide = ["rainyun"];

export interface RainyunConfig { apiBaseUrl: string; apiKey: string; timeoutMs: number }
export interface RainyunPlan { id: number; plan_name: string; chinese: string; region: string; machine: string; price: number; cpu: number; memory: number; disk: number; net_out: number; available_stock: number; is_selling: boolean; ip_prices: Record<string, number> }
export interface RainyunOS { id: number; name: string; chinese_name: string; os_type: string; region: string; is_available: boolean }
export interface RainyunService {
  plans(): Promise<RainyunPlan[]>;
  operatingSystems(): Promise<RainyunOS[]>;
  purchase(input: { planId: number; osId: number; duration: number }): Promise<Server>;
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
  } } });
  ctx.component.dashboard.addEntry({ id: "rainyun", dev: fileURLToPath(new URL("../frontend/index.tsx", import.meta.url)), prod: fileURLToPath(new URL("../dist/frontend/rainyun.js", import.meta.url)), plugin: "rainyun" });
  const db = ctx.component.database;
  const projects = ctx.component.project as ProjectService;
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
  };
  ctx.registerComponent("rainyun", rainyun);
  async function instanceList(): Promise<Server[]> {
    const data = await request("/product/rcs/");
    const items = Array.isArray(data) ? data : Array.isArray(object(data).data) ? object(data).data as unknown[] : Array.isArray(object(data).items) ? object(data).items as unknown[] : [];
    return items.map(server).filter((item): item is Server => Boolean(item));
  }
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
      const owned = await instanceList();
      const selected = owned.find((item) => item.instance_id === instanceId);
      if (!selected) return failure(session, 404, session.text("cloud.rainyun.errors.load"));
      const existing = await db.selectOne("rainyun_project_servers", { instance_id: instanceId }) as ProjectServer | undefined;
      if (existing) return failure(session, 409, session.text("cloud.rainyun.errors.load"));
      const now = new Date().toISOString();
      const created = await db.create("rainyun_project_servers", { ...selected, tenant_id: access.tenant.id!, project_id: access.project.id, added_by: access.user.id!, created_at: now });
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
    session.respond({ ok: true }, "json");
  });
}

export default apply;
