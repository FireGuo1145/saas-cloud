import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, LinkButton, api, useI18n } from "@mirelia/dashboard/frontend";
import { ArrowRight, CreditCard, FolderKanban, ReceiptText, Server, ShieldCheck, ShoppingBag, Wallet } from "lucide-react";

interface Profile { id: number; username: string; is_admin: boolean; created_at: string }
interface DashboardData {
  profile?: Profile;
  balanceCents?: number;
  projects?: number;
  instances?: number;
  orders?: number;
}

/**
 * Landing page. Sections link to their own pages instead of the project list,
 * which lives at /projects.
 */
export default function HomePage() {
  const { t, language } = useI18n();
  const [data, setData] = useState<DashboardData>({});
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const results: Record<string, unknown> = {};
      /** Resolve after a short budget so one slow endpoint never leaves the page blank. */
      const within = <T,>(promise: Promise<T>, ms = 4000) => Promise.race([promise, new Promise<undefined>((resolve) => setTimeout(resolve, ms))]);
      await Promise.all([
        within(api.get<Profile>("/user/me")).then((response) => { if (response) results.profile = response.data; }).catch(() => undefined),
        within(api.get<{ balanceCents: number }>("/billing/summary")).then((response) => { if (response) results.balanceCents = response.data.balanceCents; }).catch(() => undefined),
        within(api.get<{ projects: unknown[] }>("/projects")).then((response) => { if (response) results.projects = response.data.projects.length; }).catch(() => undefined),
        within(api.get<{ instances: unknown[] }>("/instances")).then((response) => { if (response) results.instances = response.data.instances.length; }).catch(() => undefined),
      ]);
      if (active) { setData(results as DashboardData); setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, []);
  const money = (cents?: number) => cents === undefined ? "—" : new Intl.NumberFormat(language === "zh" ? "zh-CN" : language === "ja" ? "ja-JP" : "en-US", { style: "currency", currency: "CNY" }).format(cents / 100);
  const cards = [
    { id: "projects", href: "/projects", icon: FolderKanban, title: t("cloud.home.projects"), description: t("cloud.home.projectsHint"), value: data.projects },
    { id: "instances", href: "/instances", icon: Server, title: t("cloud.home.instances"), description: t("cloud.home.instancesHint"), value: data.instances },
    { id: "store", href: "/store", icon: ShoppingBag, title: t("cloud.home.store"), description: t("cloud.home.storeHint") },
    { id: "orders", href: "/store/orders", icon: ReceiptText, title: t("cloud.home.orders"), description: t("cloud.home.ordersHint") },
  ].filter((card) => card.id !== "instances" || data.instances !== undefined);
  return <div className="mx-auto w-full max-w-6xl p-5 sm:p-8">
    <div className="border-b border-border pb-5">
      <p className="mb-1 text-sm text-muted-foreground">{t("cloud.nav.home")}</p>
      <h1 className="text-2xl font-semibold">{loading && !data.profile ? t("cloud.common.loading") : t("cloud.home.greeting", { username: data.profile?.username ?? "" })}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("cloud.home.subtitle")}</p>
    </div>
    <section className="mt-6 grid gap-4 sm:grid-cols-2">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3"><Wallet className="size-5 text-muted-foreground" /><div><CardTitle>{t("cloud.home.balance")}</CardTitle><CardDescription>{t("cloud.home.balanceHint")}</CardDescription></div></div>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end justify-between gap-3">
          <p className="text-2xl font-semibold tabular-nums">{money(data.balanceCents)}</p>
          <LinkButton variant="outline" href="/account/billing"><CreditCard />{t("cloud.home.topUp")}</LinkButton>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3"><FolderKanban className="size-5 text-muted-foreground" /><div><CardTitle>{t("cloud.home.projects")}</CardTitle><CardDescription>{t("cloud.home.projectsHint")}</CardDescription></div></div>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end justify-between gap-3">
          <p className="text-2xl font-semibold tabular-nums">{loading ? "—" : data.projects ?? 0}</p>
          <LinkButton href="/projects">{t("cloud.home.openProjects")}<ArrowRight /></LinkButton>
        </CardContent>
      </Card>
    </section>
    <section className="mt-6">
      <h2 className="mb-3 text-sm font-semibold">{t("cloud.home.quickLinks")}</h2>
      <div className="divide-y divide-border border-y border-border">
        {cards.map(({ id, href, icon: Icon, title, description, value }) => <Link key={id} to={href} className="flex items-center gap-3 py-3 text-sm transition-colors hover:text-foreground">
          <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-card"><Icon className="size-4 text-muted-foreground" /></span>
          <span className="min-w-0 flex-1"><span className="block font-medium">{title}</span><span className="block text-xs text-muted-foreground">{description}</span></span>
          {value !== undefined && <Badge variant="secondary">{value}</Badge>}
          <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>)}
        {data.profile?.is_admin && <Link to="/admin/users" className="flex items-center gap-3 py-3 text-sm transition-colors hover:text-foreground">
          <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-card"><ShieldCheck className="size-4 text-muted-foreground" /></span>
          <span className="min-w-0 flex-1"><span className="block font-medium">{t("cloud.home.administration")}</span><span className="block text-xs text-muted-foreground">{t("cloud.home.administrationHint")}</span></span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>}
      </div>
    </section>
    {data.profile?.created_at && <p className="mt-6 text-xs text-muted-foreground">{t("cloud.home.memberSince")} {new Date(data.profile.created_at).toLocaleDateString(language)}</p>}
  </div>;
}
