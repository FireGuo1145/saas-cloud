import { Context, Schema, Session } from "yumeri";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { User } from "@mirelia/user";
import type { BillingService } from "@mirelia/billing";
import type { ProjectService } from "@mirelia/project";
import type { RainyunService, ProjectServer } from "@mirelia/rainyun";
import type { TenantService } from "@mirelia/tenant";
import "@mirelia/billing";
import "@mirelia/dashboard";
import "@mirelia/project";
import "@mirelia/rainyun";
import "@mirelia/tenant";
import "@mirelia/user";

export const depend = ["billing", "dashboard", "project", "rainyun", "tenant", "user"];
export const provide = ["store"];
export const config: Schema<Record<string, never>> = Schema.object({});

function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

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
    buy: { zh: "购买服务器", en: "Buy server", ja: "サーバーを購入" },
    selectProject: { zh: "选择项目", en: "Select project", ja: "プロジェクトを選択" },
    selectOs: { zh: "操作系统", en: "Operating system", ja: "オペレーティングシステム" },
    duration: { zh: "购买时长（月）", en: "Duration (months)", ja: "期間（月）" },
    total: { zh: "应付金额", en: "Total due", ja: "お支払い金額" },
    purchaseConfirm: { zh: "确认购买", en: "Confirm purchase", ja: "購入を確定" },
    purchasing: { zh: "正在下单…", en: "Placing order…", ja: "注文中…" },
    purchaseSuccess: { zh: "服务器已购买并关联到项目。", en: "Server purchased and linked to the project.", ja: "サーバーを購入し、プロジェクトに関連付けました。" },
    purchaseCost: { zh: "套餐价格按月计费，公网 IPv4 费用将计入总价。", en: "The plan is billed monthly; public IPv4 is included in the total.", ja: "プランは月額で、パブリック IPv4 料金を合計に含みます。" },
    noProjects: { zh: "请先创建一个有管理云产品权限的项目。", en: "Create a project where you can manage cloud products first.", ja: "先にクラウド製品を管理できるプロジェクトを作成してください。" },
    errors: { balance: { zh: "账户余额不足，请先充值。", en: "Insufficient balance. Add funds first.", ja: "残高が不足しています。先にチャージしてください。" }, purchase: { zh: "服务器购买失败，已退回扣款。", en: "Server purchase failed; the debit was refunded.", ja: "サーバー購入に失敗し、引き落としは返金されました。" }, noOs: { zh: "当前套餐没有可用操作系统。", en: "No operating systems are available for this plan.", ja: "このプランで利用可能な OS がありません。" } },
  } } });
  ctx.component.dashboard.addEntry({ id: "store", dev: fileURLToPath(new URL("../frontend/index.tsx", import.meta.url)), prod: fileURLToPath(new URL("../dist/frontend/store.js", import.meta.url)), plugin: "store" });
  const userService = ctx.component.user as { current(session: Session): Promise<User | undefined> };
  const rainyun = ctx.component.rainyun as RainyunService;
  const billing = ctx.component.billing as BillingService;
  const projectService = ctx.component.project as ProjectService;
  const tenants = ctx.component.tenant as TenantService;
  ctx.route("/api/store/server-plans").methods("GET").action(async (session) => {
    const user = await userService.current(session);
    if (!user?.id) { session.status = 401; session.respond({ error: session.text("cloud.auth.errors.authRequired") }, "json"); return; }
    try {
      const plans = await rainyun.plans();
      const operatingSystems = await rainyun.operatingSystems();
      const tenantList = await tenants.listForUser(user.id!);
      const projects = [];
      for (const tenant of tenantList) {
        if (!tenant.id) continue;
        for (const project of await projectService.list(tenant.id)) {
          const access = await projectService.authorize(session, project.id!, "manage_products");
          if (access?.project.id) projects.push({ id: project.id, name: project.name });
        }
      }
      session.respond({
        plans: plans.filter((plan) => plan.is_selling).map(({ id, plan_name, chinese, region, machine, price, cpu, memory, disk, net_out, available_stock, ip_prices }) => ({ id, plan_name, chinese, region, machine, price, cpu, memory, disk, net_out, available_stock, ip_prices })),
        operatingSystems: operatingSystems.filter((os) => os.is_available).map(({ id, name, chinese_name, os_type, region }) => ({ id, name, chinese_name, os_type, region })),
        projects,
      }, "json");
    } catch (error) {
      session.status = 502;
      const key = error instanceof Error && error.message === "RAINYUN_API_KEY_MISSING" ? "cloud.store.configure" : "cloud.store.error";
      session.respond({ error: session.text(key) }, "json");
    }
  });
  ctx.route("/api/store/server-purchase").methods("POST").action(async (session) => {
    const user = await userService.current(session);
    if (!user?.id) { session.status = 401; session.respond({ error: session.text("cloud.auth.errors.authRequired") }, "json"); return; }
    const body = object(await session.parseRequestBody());
    const projectId = Number(body.projectId), planId = Number(body.planId), osId = Number(body.osId), duration = Number(body.duration);
    if (![projectId, planId, osId].every((value) => Number.isSafeInteger(value) && value > 0) || !Number.isSafeInteger(duration) || duration < 1 || duration > 12) {
      session.status = 400; session.respond({ error: session.text("cloud.store.errors.purchase") }, "json"); return;
    }
    const access = await projectService.authorize(session, projectId, "manage_products");
    if (!access?.project.id) { session.status = 404; session.respond({ error: session.text("cloud.project.errors.notFound") }, "json"); return; }
    try {
      const [plans, operatingSystems] = await Promise.all([rainyun.plans(), rainyun.operatingSystems()]);
      const plan = plans.find((item) => item.id === planId && item.is_selling && item.available_stock > 0);
      const os = operatingSystems.find((item) => item.id === osId && item.is_available && (!item.region || item.region === plan?.region));
      if (!plan || !os) { session.status = 400; session.respond({ error: session.text("cloud.store.errors.purchase") }, "json"); return; }
      const unitPrice = plan.price + (plan.ip_prices.eipv4 ?? 0);
      const totalCents = Math.round(unitPrice * duration * 100);
      const reference = `server-purchase:${user.id}:${randomUUID()}`;
      if (await billing.balance(user.id) < totalCents) { session.status = 402; session.respond({ error: session.text("cloud.store.errors.balance") }, "json"); return; }
      const debited = await billing.debit(user.id, totalCents, reference, `${plan.chinese || plan.plan_name} × ${duration}`);
      if (!debited) { session.status = 402; session.respond({ error: session.text("cloud.store.errors.balance") }, "json"); return; }
      try {
        const purchased = await rainyun.purchase({ planId, osId, duration });
        const record = await ctx.component.database.create("rainyun_project_servers", {
          ...purchased, tenant_id: access.tenant.id!, project_id: access.project.id!, added_by: user.id!, created_at: new Date().toISOString(),
        }) as ProjectServer;
        session.status = 201;
        session.respond({ server: record, chargedCents: totalCents }, "json");
      } catch (error) {
        await billing.credit(user.id, totalCents, `refund:${reference}`, `${plan.chinese || plan.plan_name} × ${duration}`, "refund");
        throw error;
      }
    } catch (error) {
      session.status = 502;
      session.respond({ error: error instanceof Error && error.message === "RAINYUN_API_KEY_MISSING" ? session.text("cloud.store.configure") : session.text("cloud.store.errors.purchase") }, "json");
    }
  });
}

export default apply;
