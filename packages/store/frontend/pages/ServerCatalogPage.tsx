import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Input, api, useI18n } from "@mirelia/dashboard/frontend";
import { LoaderCircle, RefreshCw, Search, Server } from "lucide-react";

interface Plan { id: number; plan_name: string; chinese: string; region: string; machine: string; price: number; cpu: number; memory: number; disk: number; net_out: number; available_stock: number; ip_prices: Record<string, number> }
const regions: Record<string, string> = { cn_hk: "Hong Kong", cn_tj: "Tianjin", cn_yn: "Yunnan", us_ca: "US West", us_va: "US East", jp_tokyo: "Tokyo", sg: "Singapore" };

export default function ServerCatalogPage() {
  const { t, language } = useI18n();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const { data } = await api.get<{ plans: Plan[] }>('/store/server-plans'); setPlans(data.plans); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("cloud.store.error")); }
    finally { setLoading(false); }
  }, [t]);
  useEffect(() => { void load(); }, [load]);
  const regionOptions = useMemo(() => [...new Set(plans.map((plan) => plan.region).filter(Boolean))].sort(), [plans]);
  const visible = useMemo(() => plans.filter((plan) => (region === "all" || plan.region === region) && `${plan.chinese} ${plan.plan_name} ${plan.machine} ${plan.region}`.toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => a.price - b.price), [plans, region, search]);
  const money = (value: number) => new Intl.NumberFormat(language === "zh" ? "zh-CN" : language === "ja" ? "ja-JP" : "en-US", { style: "currency", currency: "CNY", maximumFractionDigits: 2 }).format(value);
  return <div className="mx-auto w-full max-w-6xl p-5 sm:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
      <div><p className="mb-1 text-sm text-muted-foreground">{t("cloud.store.nav.catalog")}</p><h1 className="text-2xl font-semibold">{t("cloud.store.title")}</h1><p className="mt-1 text-sm text-muted-foreground">{t("cloud.store.description")}</p></div>
      <Button variant="outline" onPress={() => void load()} isDisabled={loading}><RefreshCw />{t("cloud.store.refresh")}</Button>
    </div>
    <div className="flex flex-wrap items-center gap-3 border-b border-border py-4">
      <div className="relative min-w-56 flex-1 sm:max-w-sm"><Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("cloud.store.search")} aria-label={t("cloud.store.search")} className="pl-9" /></div>
      <div className="flex max-w-full flex-wrap gap-1" role="group" aria-label={t("cloud.store.region")}>
        <Button size="sm" variant={region === "all" ? "secondary" : "ghost"} onPress={() => setRegion("all")}>{t("cloud.store.allRegions")}</Button>
        {regionOptions.map((value) => <Button key={value} size="sm" variant={region === value ? "secondary" : "ghost"} onPress={() => setRegion(value)}>{regions[value] ?? value}</Button>)}
      </div>
      <span className="text-xs text-muted-foreground">{visible.length} {t("cloud.store.plans")}</span>
    </div>
    {error ? <div className="mt-6 flex flex-wrap items-center gap-3" role="alert"><p className="text-sm text-destructive">{error}</p><Button size="sm" variant="outline" onPress={() => void load()}>{t("cloud.common.retry")}</Button></div> : loading ? <p role="status" className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{t("cloud.store.loading")}</p> : visible.length ? <div className="mt-5 divide-y divide-border border-y border-border">{visible.map((plan) => <article key={plan.id} className="grid gap-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="flex min-w-0 items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-card"><Server className="size-4 text-muted-foreground" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-medium">{plan.chinese || plan.plan_name}</h2><Badge variant="outline">{regions[plan.region] ?? plan.region}</Badge>{plan.machine && <span className="text-xs text-muted-foreground">{plan.machine}</span>}</div><p className="mt-1 text-xs text-muted-foreground">{plan.cpu} {t("cloud.store.cpu")} · {plan.memory} MB {t("cloud.store.memory")} · {plan.disk} GB {t("cloud.store.disk")} · {plan.net_out} Mbps {t("cloud.store.outbound")}</p><p className="mt-1 text-xs text-muted-foreground">{t("cloud.store.stock")}: {plan.available_stock > 0 ? <span className="text-foreground">{t("cloud.store.inStock")} ({plan.available_stock})</span> : <span>{t("cloud.store.soldOut")}</span>}</p></div></div>
      <div className="flex items-baseline gap-1 sm:justify-end"><span className="text-lg font-semibold tabular-nums">{money(plan.price)}</span><span className="text-xs text-muted-foreground">/ {t("cloud.store.pricePerMonth")}</span></div>
    </article>)}</div> : <div className="mt-5 flex min-h-48 flex-col items-center justify-center border-y border-border text-center"><Server className="mb-3 size-7 text-muted-foreground" /><h2 className="text-sm font-medium">{t("cloud.store.noPlans")}</h2></div>}
  </div>;
}
