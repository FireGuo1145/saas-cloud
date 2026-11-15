import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, Input, api, useI18n } from "@mirelia/dashboard/frontend";
import { ArrowRight, Check, ChevronDown, LoaderCircle, RefreshCw, ShoppingCart, Sparkles, Store } from "lucide-react";

export interface StoreOption { value: string; label: string; description?: string; priceCents?: number; disabled?: boolean }
export interface StoreProductField { key: string; label: string; required?: boolean; options: StoreOption[] }
export interface StoreProduct {
  key: string; pluginId: string; id: string; name: string; summary: string; description: string; provider: string; category: string;
  priceCents: number; period: "month" | "year" | "one-time"; quantity: "fixed" | "select"; minQuantity: number; maxQuantity: number;
  highlights: string[]; popular: boolean; available: boolean; repeatable: boolean; fields: StoreProductField[];
}
export interface ProjectOption { id: number; name: string }
interface CatalogPayload { products: StoreProduct[]; projects: ProjectOption[]; currency: string; purchaseEnabled: boolean }

export function formatMoney(language: string, currency: string, cents: number) {
  return new Intl.NumberFormat(language === "zh" ? "zh-CN" : language === "ja" ? "ja-JP" : "en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(cents / 100);
}

export function useCartCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let active = true;
    const refresh = () => void api.get<{ items: unknown[] }>("/store/cart").then(({ data }) => { if (active) setCount(data.items.length); }).catch(() => undefined);
    refresh();
    window.addEventListener("store:cart-changed", refresh);
    return () => { active = false; window.removeEventListener("store:cart-changed", refresh); };
  }, []);
  return count;
}

export function StoreCartLink() {
  const { t } = useI18n();
  const count = useCartCount();
  return <Link to="/store/cart" className="relative grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label={t("cloud.store.cart.title")} title={t("cloud.store.cart.title")}>
    <ShoppingCart className="size-4" />
    {count > 0 && <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-4 font-medium text-primary-foreground">{count}</span>}
  </Link>;
}

function periodLabel(t: (key: string) => string, period: StoreProduct["period"]) {
  return period === "month" ? t("cloud.store.perMonth") : period === "year" ? t("cloud.store.perYear") : t("cloud.store.oneTime");
}

function defaultSelections(product: StoreProduct) {
  return Object.fromEntries(product.fields.map((field) => [field.key, field.options.find((option) => !option.disabled)?.value ?? ""]));
}

export default function StoreCatalogPage() {
  const { t, language } = useI18n();
  const [data, setData] = useState<CatalogPayload>({ products: [], projects: [], currency: "CNY", purchaseEnabled: true });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState<StoreProduct>();
  const [projectId, setProjectId] = useState<number>();
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const load = async () => {
    setLoading(true); setError("");
    try {
      const { data: payload } = await api.get<CatalogPayload>("/store/products");
      setData(payload);
      setProjectId((current) => current ?? payload.projects[0]?.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("cloud.store.error")); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const money = (cents: number) => formatMoney(language, data.currency, cents);
  const categories = [...new Set(data.products.map((product) => product.category))];
  const query = search.trim().toLowerCase();
  const visible = data.products.filter((product) => (category === "all" || product.category === category) && `${product.name} ${product.summary} ${product.provider} ${product.highlights.join(" ")}`.toLowerCase().includes(query));
  const optionPrice = (product: StoreProduct) => product.fields.reduce((sum, field) => sum + (field.options.find((option) => option.value === selections[field.key])?.priceCents ?? 0), product.priceCents);
  function openProduct(product: StoreProduct) {
    setSelected(product);
    setSelections(defaultSelections(product));
    setQuantity(product.minQuantity);
    setDialogError("");
    setMessage("");
  }
  async function addToCart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !projectId) return;
    setAdding(true); setDialogError("");
    try {
      await api.post("/store/cart", { productKey: selected.key, projectId, quantity, selections });
      window.dispatchEvent(new Event("store:cart-changed"));
      setMessage(t("cloud.store.added"));
      setSelected(undefined);
    } catch (cause) { setDialogError(cause instanceof Error ? cause.message : t("cloud.store.errors.invalidOption")); }
    finally { setAdding(false); }
  }
  return <div className="mx-auto w-full max-w-6xl p-5 sm:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
      <div className="min-w-0"><p className="mb-1 flex items-center gap-1.5 text-sm text-muted-foreground"><Store className="size-3.5" />{t("cloud.store.nav.catalog")}</p><h1 className="text-2xl font-semibold">{t("cloud.store.title")}</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("cloud.store.description")}</p></div>
      <div className="flex gap-2"><Link to="/store/cart" className="inline-flex h-8 items-center gap-1.5 rounded-2xl border border-border px-3 text-sm">{t("cloud.store.nav.cart")}<ArrowRight className="size-4" /></Link><Button variant="outline" onPress={() => void load()} isDisabled={loading} aria-label={t("cloud.store.refresh")}><RefreshCw /></Button></div>
    </div>
    <div className="flex flex-wrap items-center gap-3 border-b border-border py-4">
      <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("cloud.store.search")} aria-label={t("cloud.store.search")} className="min-w-48 flex-1 sm:max-w-sm" />
      <div className="flex max-w-full flex-wrap gap-1" role="group" aria-label={t("cloud.store.allCategories")}>
        <Button size="sm" variant={category === "all" ? "secondary" : "ghost"} onPress={() => setCategory("all")}>{t("cloud.store.allCategories")}</Button>
        {categories.map((value) => <Button key={value} size="sm" variant={category === value ? "secondary" : "ghost"} onPress={() => setCategory(value)}>{t(`cloud.store.categories.${value}`)}</Button>)}
      </div>
      <span className="text-xs text-muted-foreground">{visible.length} {t("cloud.store.products")}</span>
    </div>
    {message && <p role="status" className="mt-4 text-sm text-foreground">{message}</p>}
    {error ? <div className="mt-6 flex flex-wrap items-center gap-3" role="alert"><p className="text-sm text-destructive">{error}</p><Button size="sm" variant="outline" onPress={() => void load()}>{t("cloud.common.retry")}</Button></div>
      : loading ? <p role="status" className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{t("cloud.store.loading")}</p>
        : visible.length ? <div className="mt-5 divide-y divide-border border-y border-border">{visible.map((product) => <article key={product.key} className="grid gap-4 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-card"><Store className="size-4 text-muted-foreground" /></span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><h2 className="font-medium">{product.name}</h2><Badge variant="outline">{t(`cloud.store.categories.${product.category}`)}</Badge><Badge variant="ghost">{product.provider}</Badge>{product.popular && <Badge variant="secondary"><Sparkles />{t("cloud.store.popular")}</Badge>}{!product.available && <Badge variant="outline">{t("cloud.store.unavailable")}</Badge>}</div>
              <p className="mt-1 text-sm text-muted-foreground">{product.summary}</p>
              <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">{product.highlights.map((item) => <span key={item}>{item}</span>)}</p>
              
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 sm:justify-end">
            <div className="text-right"><span className="text-lg font-semibold tabular-nums">{product.fields.some((field) => field.options.some((option) => option.priceCents)) ? `${t("cloud.store.from")} ` : ""}{money(product.priceCents)}</span><span className="ml-1 text-xs text-muted-foreground">{periodLabel(t, product.period)}</span></div>
            <Button size="sm" isDisabled={!product.available || data.projects.length === 0 || !data.purchaseEnabled} onPress={() => openProduct(product)}>{t("cloud.store.addToCart")}</Button>
          </div>
        </article>)}</div>
          : <div className="mt-5 flex min-h-48 flex-col items-center justify-center border-y border-border text-center"><Store className="mb-3 size-7 text-muted-foreground" /><h2 className="text-sm font-medium">{t("cloud.store.noProducts")}</h2></div>}
    {data.projects.length === 0 && !loading && <p className="mt-4 text-sm text-muted-foreground">{t("cloud.store.noProjects")}</p>}
    <Dialog isOpen={Boolean(selected)} onOpenChange={(open) => { if (!open && !adding) setSelected(undefined); }}>
      <DialogHeader><DialogTitle>{selected?.name}</DialogTitle><DialogDescription>{selected?.summary}</DialogDescription></DialogHeader>
      <form className="space-y-5" onSubmit={(event) => void addToCart(event)}>
        <div className="space-y-2"><p className="text-sm font-medium">{t("cloud.store.selectProject")}</p>
          <DropdownMenuTrigger>
            <Button type="button" variant="outline" className="w-full justify-between" isDisabled={!data.projects.length}>{data.projects.find((project) => project.id === projectId)?.name ?? t("cloud.store.selectProject")}<ChevronDown /></Button>
            <DropdownMenu><DropdownMenuLabel>{t("cloud.project.nav.projects")}</DropdownMenuLabel>{data.projects.map((project) => <DropdownMenuItem key={project.id} onAction={() => setProjectId(project.id)}>{project.name}{project.id === projectId && <Check className="ml-auto size-4" />}</DropdownMenuItem>)}</DropdownMenu>
          </DropdownMenuTrigger>
        </div>
        {selected?.fields.map((field) => <div key={field.key} className="space-y-2"><p className="text-sm font-medium">{field.label}</p>
          <DropdownMenuTrigger>
            <Button type="button" variant="outline" className="w-full justify-between" isDisabled={!field.options.length}>
              <span className="truncate">{field.options.find((option) => option.value === selections[field.key])?.label ?? field.label}</span><ChevronDown />
            </Button>
            <DropdownMenu><DropdownMenuLabel>{field.label}</DropdownMenuLabel>{field.options.map((option) => <DropdownMenuItem key={option.value} isDisabled={option.disabled} onAction={() => setSelections((current) => ({ ...current, [field.key]: option.value }))}>
              <span className="flex min-w-0 flex-col"><span>{option.label}</span>{option.description && <span className="text-xs text-muted-foreground">{option.description}</span>}</span>{option.value === selections[field.key] && <Check className="ml-auto size-4" />}
            </DropdownMenuItem>)}</DropdownMenu>
          </DropdownMenuTrigger>
        </div>)}
        {selected?.quantity === "select" && <div className="space-y-2"><p className="text-sm font-medium">{t("cloud.store.quantity")}</p><div className="flex flex-wrap gap-2">{Array.from({ length: selected.maxQuantity - selected.minQuantity + 1 }, (_, index) => selected.minQuantity + index).map((value) => <Button key={value} type="button" variant={quantity === value ? "secondary" : "outline"} aria-pressed={quantity === value} onPress={() => setQuantity(value)}>{value}</Button>)}</div></div>}
        <div className="flex items-baseline justify-between border-t border-border pt-4"><span className="text-sm text-muted-foreground">{t("cloud.store.total")}</span><span className="text-xl font-semibold tabular-nums">{selected ? money(optionPrice(selected) * quantity) : "—"}<span className="ml-1 text-xs font-normal text-muted-foreground">{selected ? periodLabel(t, selected.period) : ""}</span></span></div>
        <p className="text-xs text-muted-foreground">{t("cloud.store.purchaseNotice")}</p>
        {dialogError && <p role="alert" className="text-sm text-destructive">{dialogError}</p>}
        <DialogFooter><Button type="button" variant="outline" onPress={() => setSelected(undefined)} isDisabled={adding}>{t("cloud.common.cancel")}</Button><Button type="submit" isDisabled={adding || !projectId}>{adding && <LoaderCircle className="animate-spin" />}<ShoppingCart />{t("cloud.store.addToCart")}</Button></DialogFooter>
      </form>
    </Dialog>
  </div>;
}
