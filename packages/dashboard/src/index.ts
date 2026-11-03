import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Context, Schema, Session } from "yumeri";

export const depend: string[] = [];
export const provide = ["dashboard"];
export const config: Schema<Record<string, never>> = Schema.object({});

export interface DashboardEntry {
  id: string;
  dev?: string;
  prod: string;
  plugin?: string;
}
export interface DashboardService {
  addEntry(entry: DashboardEntry): { remove(): void };
}
declare module "yumeri" { interface Components { dashboard: DashboardService } }

function mime(file: string) {
  const ext = path.extname(file).toLowerCase();
  return ({ ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" } as Record<string, string>)[ext] ?? "application/octet-stream";
}

export async function apply(ctx: Context) {
  ctx.i18n({ cloud: {
    common: {
      language: { zh: "语言", en: "Language", ja: "言語" },
      loading: { zh: "加载中…", en: "Loading…", ja: "読み込み中…" },
      save: { zh: "保存", en: "Save", ja: "保存" },
      saving: { zh: "保存中…", en: "Saving…", ja: "保存中…" },
      cancel: { zh: "取消", en: "Cancel", ja: "キャンセル" },
      create: { zh: "创建", en: "Create", ja: "作成" },
      creating: { zh: "创建中…", en: "Creating…", ja: "作成中…" },
      retry: { zh: "重试", en: "Retry", ja: "再試行" },
    },
    theme: {
      switch: { zh: "切换主题", en: "Switch theme", ja: "テーマを切り替え" },
      light: { zh: "浅色", en: "Light", ja: "ライト" },
      dark: { zh: "暗色", en: "Dark", ja: "ダーク" },
      system: { zh: "跟随系统", en: "System", ja: "システムに従う" },
    },
    nav: {
      workspace: { zh: "工作区", en: "Workspace", ja: "ワークスペース" },
      project: { zh: "项目", en: "Project", ja: "プロジェクト" },
      mainNavigation: { zh: "主导航", en: "Main navigation", ja: "メインナビゲーション" },
    },
  } });
  const entries = new Map<string, DashboardEntry>();
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const resolveAsset = (entry: DashboardEntry) => path.resolve(root, entry.prod);
  const dashboard: DashboardService = {
    addEntry(entry) {
      entries.set(entry.id, entry);
      const handle = { remove: () => { entries.delete(entry.id); } };
      ctx.affect(handle.remove);
      return handle;
    },
  };
  ctx.registerComponent("dashboard", dashboard);
  ctx.route("/api/dashboard/manifest").methods("GET").action((session: Session) => {
    session.respond({ revision: String(entries.size), entries: [...entries.values()].map((entry) => ({ id: entry.id, plugin: entry.plugin, files: [{ id: entry.id, mime: "application/javascript; charset=utf-8", url: `/api/static/plugin?file=${encodeURIComponent(entry.id)}` }] })), i18n: ctx.getCore().i18n.all() }, "json");
  });
  ctx.route("/api/static/plugin").methods("GET").action((session: Session, query: URLSearchParams) => {
    const entry = entries.get(query.get("file") ?? "");
    const file = entry && resolveAsset(entry);
    if (!file || !existsSync(file)) { session.status = 404; session.respond({ error: "Plugin asset not found" }, "json"); return; }
    session.setMime(mime(file));
    session.sendFile(file);
  });
  ctx.route("/dashboard-client.js").methods("GET").action((session: Session) => {
    const file = path.resolve(root, "dist/web/dashboard-client.js");
    if (!existsSync(file)) { session.status = 503; session.respond("Dashboard runtime is not built", "plain"); return; }
    session.setMime(mime(file));
    session.sendFile(file);
  });
  ctx.route("root").methods("GET").action((session: Session) => {
    const webRoot = path.resolve(root, "dist/web");
    const requested = session.pathname === "/" ? "index.html" : session.pathname.replace(/^\/+/, "");
    const safe = requested.includes("..") ? "index.html" : requested;
    const candidate = path.resolve(webRoot, safe);
    const file = existsSync(candidate) ? candidate : path.resolve(webRoot, "index.html");
    if (!existsSync(file)) { session.status = 503; session.respond("Dashboard is not built", "plain"); return; }
    session.setMime(mime(file));
    session.sendFile(file);
  });
  ctx.i18n({ dashboard: { config: {} } });
}

export default apply;
