import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Badge, Button, Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, Input, api, useI18n } from "@mirelia/dashboard/frontend";
import { Check, ChevronDown, LoaderCircle, RefreshCw, Search, Server } from "lucide-react";

interface Plan { id: number; plan_name: string; chinese: string; region: string; machine: string; price: number; cpu: number; memory: number; disk: number; net_out: number; available_stock: number; ip_prices: Record<string, number> }
interface OperatingSystem { id: number; name: string; chinese_name: string; os_type: string; region: string }
interface ProjectOption { id: number; name: string }
const regions: Record<string, string> = { cn_hk: "Hong Kong", cn_tj: "Tianjin", cn_yn: "Yunnan", us_ca: "US West", us_va: "US East", jp_tokyo: "Tokyo", sg: "Singapore" };

export default function ServerCatalogPage() {
  const { t, language } = useI18n();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [operatingSystems, setOperatingSystems] = useState<OperatingSystem[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan>();
  const [projectId, setProjectId] = useState<number>();
  const [osId, setOsId] = useState<number>();
  const [duration, setDuration] = useState(1);
  const [buying, setBuying] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const { data } = await api.get<{ plans: Plan[]; operatingSystems: OperatingSystem[]; projects: ProjectOption[] }>('/store/server-plans'); setPlans(data.plans); setOperatingSystems(data.operatingSystems); setProjects(data.projects); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("cloud.store.error")); }
    finally { setLoading(false); }
  }, [t]);
  useEffect(() => { void load(); }, [load]);
  const regionOptions = useMemo(() => [...new Set(plans.map((plan) => plan.region).filter(Boolean))].sort(), [plans]);
  const visible = useMemo(() => plans.filter((plan) => (region === "all" || plan.region === region) && `${plan.chinese} ${plan.plan_name} ${plan.machine} ${plan.region}`.toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => a.price - b.price), [plans, region, search]);
  const money = (value: number) => new Intl.NumberFormat(language === "zh" ? "zh-CN" : language === "ja" ? "ja-JP" : "en-US", { style: "currency", currency: "CNY", maximumFractionDigits: 2 }).format(value);
  const compatibleOS = operatingSystems.filter((os) => !os.region || os.region === selectedPlan?.region);
  const selectedOS = compatibleOS.find((os) => os.id === osId);
  async function purchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPlan || !projectId || !osId) return;
    setBuying(true); setError(""); setMessage("");
    try {
      await api.post("/store/server-purchase", { projectId, planId: selectedPlan.id, osId, duration });
      setSelectedPlan(undefined); setMessage(t("cloud.store.purchaseSuccess"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("cloud.store.errors.purchase")); }
    finally { setBuying(false); }
  }
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
    {message && <p role="status" className="mt-4 text-sm text-foreground">{message}</p>}
    {error ? <div className="mt-6 flex flex-wrap items-center gap-3" role="alert"><p className="text-sm text-destructive">{error}</p><Button size="sm" variant="outline" onPress={() => void load()}>{t("cloud.common.retry")}</Button></div> : loading ? <p role="status" className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{t("cloud.store.loading")}</p> : visible.length ? <div className="mt-5 divide-y divide-border border-y border-border">{visible.map((plan) => <article key={plan.id} className="grid gap-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="flex min-w-0 items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-card"><Server className="size-4 text-muted-foreground" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-medium">{plan.chinese || plan.plan_name}</h2><Badge variant="outline">{regions[plan.region] ?? plan.region}</Badge>{plan.machine && <span className="text-xs text-muted-foreground">{plan.machine}</span>}</div><p className="mt-1 text-xs text-muted-foreground">{plan.cpu} {t("cloud.store.cpu")} · {plan.memory} MB {t("cloud.store.memory")} · {plan.disk} GB {t("cloud.store.disk")} · {plan.net_out} Mbps {t("cloud.store.outbound")}</p><p className="mt-1 text-xs text-muted-foreground">{t("cloud.store.stock")}: {plan.available_stock > 0 ? <span className="text-foreground">{t("cloud.store.inStock")} ({plan.available_stock})</span> : <span>{t("cloud.store.soldOut")}</span>}</p></div></div>
      <div className="flex items-center justify-between gap-4 sm:justify-end"><div className="flex items-baseline gap-1"><span className="text-lg font-semibold tabular-nums">{money(plan.price)}</span><span className="text-xs text-muted-foreground">/ {t("cloud.store.pricePerMonth")}</span></div><Button size="sm" isDisabled={plan.available_stock <= 0 || projects.length === 0} onPress={() => { setSelectedPlan(plan); setProjectId(projects[0]?.id); setOsId(operatingSystems.find((os) => !os.region || os.region === plan.region)?.id); setDuration(1); setError(""); }}>{t("cloud.store.buy")}</Button></div>
    </article>)}</div> : <div className="mt-5 flex min-h-48 flex-col items-center justify-center border-y border-border text-center"><Server className="mb-3 size-7 text-muted-foreground" /><h2 className="text-sm font-medium">{t("cloud.store.noPlans")}</h2></div>}
    <Dialog isOpen={Boolean(selectedPlan)} onOpenChange={(open) => { if (!open && !buying) setSelectedPlan(undefined); }}>
      <DialogHeader><DialogTitle>{t("cloud.store.buy")} · {selectedPlan?.chinese || selectedPlan?.plan_name}</DialogTitle><DialogDescription>{t("cloud.store.purchaseCost")}</DialogDescription></DialogHeader>
      <form className="space-y-5" onSubmit={(event) => void purchase(event)}>
        <div className="space-y-2"><p className="text-sm font-medium">{t("cloud.store.selectProject")}</p><DropdownMenuTrigger>
          <Button type="button" variant="outline" className="w-full justify-between" isDisabled={!projects.length}>{projects.find((project) => project.id === projectId)?.name ?? (projects.length ? t("cloud.store.selectProject") : t("cloud.store.noProjects"))}<ChevronDown /></Button>
          <DropdownMenu><DropdownMenuLabel>{t("cloud.project.nav.projects")}</DropdownMenuLabel>{projects.map((project) => <DropdownMenuItem key={project.id} onAction={() => setProjectId(project.id)}>{project.name}{project.id === projectId && <Check className="ml-auto size-4" />}</DropdownMenuItem>)}</DropdownMenu>
        </DropdownMenuTrigger></div>
        <div className="space-y-2"><p className="text-sm font-medium">{t("cloud.store.selectOs")}</p><DropdownMenuTrigger>
          <Button type="button" variant="outline" className="w-full justify-between" isDisabled={!compatibleOS.length}>{selectedOS?.chinese_name || selectedOS?.name || t("cloud.store.selectOs")}<ChevronDown /></Button>
          <DropdownMenu><DropdownMenuLabel>{t("cloud.store.selectOs")}</DropdownMenuLabel>{compatibleOS.map((os) => <DropdownMenuItem key={os.id} onAction={() => setOsId(os.id)}>{os.chinese_name || os.name}{os.id === osId && <Check className="ml-auto size-4" />}</DropdownMenuItem>)}</DropdownMenu>
        </DropdownMenuTrigger></div>
        <div className="space-y-2"><p className="text-sm font-medium">{t("cloud.store.duration")}</p><div className="flex flex-wrap gap-2">{[1, 3, 6, 12].map((months) => <Button type="button" key={months} variant={duration === months ? "secondary" : "outline"} aria-pressed={duration === months} onPress={() => setDuration(months)}>{months}</Button>)}</div></div>
        <div className="flex items-baseline justify-between border-t border-border pt-4"><span className="text-sm text-muted-foreground">{t("cloud.store.total")}</span><span className="text-xl font-semibold tabular-nums">{selectedPlan ? money((selectedPlan.price + (selectedPlan.ip_prices.eipv4 ?? 0)) * duration) : "—"}</span></div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" onPress={() => setSelectedPlan(undefined)} isDisabled={buying}>{t("cloud.common.cancel")}</Button><Button type="submit" isDisabled={buying || !projectId || !osId}>{buying && <LoaderCircle className="animate-spin" />}{buying ? t("cloud.store.purchasing") : t("cloud.store.purchaseConfirm")}</Button></DialogFooter>
      </form>
    </Dialog>
  </div>;
}
