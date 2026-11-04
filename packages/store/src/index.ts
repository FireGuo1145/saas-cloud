import { Context, Schema, Session } from "yumeri";
import { fileURLToPath } from "node:url";
import type { User } from "@mirelia/user";
import type { RainyunService } from "@mirelia/rainyun";
import "@mirelia/dashboard";
import "@mirelia/rainyun";
import "@mirelia/user";

export const depend = ["dashboard", "rainyun", "user"];
export const provide = ["store"];
export const config: Schema<Record<string, never>> = Schema.object({});

export async function apply(ctx: Context) {
  ctx.i18n({ cloud: { store: {
    nav: { catalog: { zh: "服务器商城", en: "Server store", ja: "サーバーストア" } },
    title: { zh: "云服务器商城", en: "Cloud server store", ja: "クラウドサーバーストア" },
    description: { zh: "浏览雨云在售云服务器套餐与当前价格。", en: "Browse Rainyun cloud server plans and current prices.", ja: "雨雲のクラウドサーバープランと現在の価格を確認できます。" },
    pricePerMonth: { zh: "每月", en: "per month", ja: "月額" },
    region: { zh: "地域", en: "Region", ja: "リージョン" },
    allRegions: { zh: "全部地域", en: "All regions", ja: "すべてのリージョン" },
    series: { zh: "系列", en: "Series", ja: "シリーズ" },
    cpu: { zh: "核 CPU", en: "vCPU", ja: "vCPU" },
    memory: { zh: "内存", en: "Memory", ja: "メモリ" },
    disk: { zh: "磁盘", en: "磁気ディスク", ja: "ディスク" },
    outbound: { zh: "出站带宽", en: "Outbound bandwidth", ja: "送信帯域幅" },
    stock: { zh: "库存", en: "Stock", ja: "在庫" },
    inStock: { zh: "有货", en: "In stock", ja: "在庫あり" },
    soldOut: { zh: "暂时售罄", en: "Sold out", ja: "在庫切れ" },
    plans: { zh: "个套餐", en: "plans", ja: "プラン" },
    noPlans: { zh: "当前没有在售服务器套餐", en: "No server plans are currently for sale", ja: "現在販売中のサーバープランはありません" },
    search: { zh: "搜索套餐", en: "Search plans", ja: "プランを検索" },
    refresh: { zh: "刷新价格", en: "Refresh prices", ja: "価格を更新" },
    loading: { zh: "正在加载套餐…", en: "Loading plans…", ja: "プランを読み込み中…" },
    error: { zh: "无法加载服务器商品和价格", en: "Could not load server products and prices", ja: "サーバー商品と価格を読み込めませんでした" },
    configure: { zh: "请先在服务端配置 Rainyun API Key。", en: "Configure the Rainyun API key on the server first.", ja: "サーバーで Rainyun API キーを設定してください。" },
  } } });
  ctx.component.dashboard.addEntry({ id: "store", dev: fileURLToPath(new URL("../frontend/index.tsx", import.meta.url)), prod: fileURLToPath(new URL("../dist/frontend/store.js", import.meta.url)), plugin: "store" });
  const userService = ctx.component.user as { current(session: Session): Promise<User | undefined> };
  const rainyun = ctx.component.rainyun as RainyunService;
  ctx.route("/api/store/server-plans").methods("GET").action(async (session) => {
    if (!await userService.current(session)) { session.status = 401; session.respond({ error: session.text("cloud.auth.errors.authRequired") }, "json"); return; }
    try {
      const plans = await rainyun.plans();
      session.respond({ plans: plans.filter((plan) => plan.is_selling).map(({ id, plan_name, chinese, region, machine, price, cpu, memory, disk, net_out, available_stock, ip_prices }) => ({ id, plan_name, chinese, region, machine, price, cpu, memory, disk, net_out, available_stock, ip_prices })) }, "json");
    } catch (error) {
      session.status = 502;
      const key = error instanceof Error && error.message === "RAINYUN_API_KEY_MISSING" ? "cloud.store.configure" : "cloud.store.error";
      session.respond({ error: session.text(key) }, "json");
    }
  });
}

export default apply;
