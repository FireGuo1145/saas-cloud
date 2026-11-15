import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge, Button, Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, LinkButton, api, useI18n } from "@mirelia/dashboard/frontend";
import { AlertCircle, Check, ChevronDown, CreditCard, LoaderCircle, Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import type { ProjectOption } from "./StoreCatalogPage";
import { formatMoney } from "./StoreCatalogPage";

interface CartLine {
  id: number; key: string; productId: string; productKey: string; productName: string; provider: string; summary: string; category: string;
  projectId: number; projectName: string; quantity: number; minQuantity: number; maxQuantity: number; unitPriceCents: number; totalCents: number;
  period: string; selections: Array<{ key: string; label: string; value: string; valueLabel: string }>; available: boolean; problem: string;
}
interface Quote { lines: CartLine[]; subtotalCents: number; balanceCents: number; currency: string; options: { canCheckout: boolean; problems: string[] } }
interface CartPayload { items: Array<{ id: number }>; quote: Quote; projects: ProjectOption[] }
interface CheckoutResult { order: { order_id: string; status: string; total_cents: number }; items: Array<{ product_name: string; status: string; failure_reason: string }> }

export default function StoreCartPage() {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const [data, setData] = useState<CartPayload>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number>();
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CheckoutResult>();
  const idempotencyKey = useRef(typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
  const money = (cents: number) => formatMoney(language, data?.quote.currency ?? "CNY", cents);
  const apply = (payload: { items: unknown[]; quote: Quote }) => {
    setData((current) => ({ quote: payload.quote, projects: current?.projects ?? [], items: payload.items as CartPayload["items"] }));
    window.dispatchEvent(new Event("store:cart-changed"));
  };
  const load = useCallback(async () => {
    setError("");
    try { const { data: payload } = await api.get<CartPayload>("/store/cart"); setData(payload); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("cloud.store.error")); }
    finally { setLoading(false); }
  }, [t]);
  useEffect(() => { void load(); }, [load]);
  async function update(line: CartLine, changes: { quantity?: number; projectId?: number }) {
    setBusy(line.id); setError("");
    try { const { data: payload } = await api.put<{ items: unknown[]; quote: Quote }>(`/store/cart/${line.id}`, changes); apply(payload); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("cloud.store.errors.invalidQuantity")); }
    finally { setBusy(undefined); }
  }
  async function remove(line: CartLine) {
    setBusy(line.id); setError("");
    try { const { data: payload } = await api.delete<{ items: unknown[]; quote: Quote }>(`/store/cart/${line.id}`); apply(payload); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("cloud.store.errors.cartItemNotFound")); }
    finally { setBusy(undefined); }
  }
  async function checkout() {
    setCheckingOut(true); setError("");
    try {
      const { data: payload } = await api.post<CheckoutResult>("/store/checkout", { idempotencyKey: idempotencyKey.current });
      setResult(payload);
      window.dispatchEvent(new Event("store:cart-changed"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("cloud.store.errors.checkout")); }
    finally { setCheckingOut(false); }
  }
  const quote = data?.quote;
  const insufficient = quote?.options.problems.includes("STORE_INSUFFICIENT_BALANCE");
  const unavailable = quote?.lines.some((line) => !line.available);
  return <div className="mx-auto w-full max-w-5xl p-5 sm:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
      <div><p className="mb-1 text-sm text-muted-foreground"><Link to="/store" className="hover:underline">{t("cloud.store.nav.catalog")}</Link></p><h1 className="text-2xl font-semibold">{t("cloud.store.cart.title")}</h1><p className="mt-1 text-sm text-muted-foreground">{t("cloud.store.cart.description")}</p></div>
      <LinkButton variant="outline" href="/store/orders">{t("cloud.store.cart.viewOrders")}</LinkButton>
    </div>
    {error && <p role="alert" className="mt-4 flex items-center gap-2 text-sm text-destructive"><AlertCircle className="size-4" />{error}</p>}
    {loading ? <p role="status" className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{t("cloud.common.loading")}</p>
      : !quote?.lines.length ? <div className="mt-6 flex min-h-48 flex-col items-center justify-center gap-3 border-y border-border text-center"><ShoppingCart className="size-7 text-muted-foreground" /><p className="text-sm text-muted-foreground">{t("cloud.store.cart.empty")}</p><LinkButton size="sm" href="/store">{t("cloud.store.nav.section")}</LinkButton></div>
        : <>
          <p className="mt-4 text-xs text-muted-foreground">{quote.lines.length} {t("cloud.store.cart.items")}</p>
          <div className="mt-2 divide-y divide-border border-y border-border">
            {quote.lines.map((line) => <article key={line.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><h2 className="font-medium">{line.productName}</h2><Badge variant="outline">{line.provider}</Badge>{!line.available && <Badge variant="destructive">{t("cloud.store.unavailable")}</Badge>}</div>
                {line.selections.length > 0 && <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">{line.selections.map((selection) => <span key={selection.key}>{selection.label}: {selection.valueLabel}</span>)}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <DropdownMenuTrigger>
                    <Button variant="ghost" size="sm" isDisabled={busy === line.id}>{line.projectName || t("cloud.store.selectProject")}<ChevronDown /></Button>
                    <DropdownMenu><DropdownMenuLabel>{t("cloud.store.cart.changeProject")}</DropdownMenuLabel>{(data?.projects ?? []).map((project) => <DropdownMenuItem key={project.id} onAction={() => void update(line, { projectId: project.id })}>{project.name}{project.id === line.projectId && <Check className="ml-auto size-4" />}</DropdownMenuItem>)}</DropdownMenu>
                  </DropdownMenuTrigger>
                  <div className="inline-flex items-center rounded-2xl border border-border">
                    <Button variant="ghost" size="icon-sm" aria-label={t("cloud.store.cart.quantityLabel")} isDisabled={busy === line.id || line.quantity <= line.minQuantity} onPress={() => void update(line, { quantity: line.quantity - 1 })}><Minus /></Button>
                    <span className="min-w-6 text-center text-sm tabular-nums">{line.quantity}</span>
                    <Button variant="ghost" size="icon-sm" aria-label={t("cloud.store.cart.quantityLabel")} isDisabled={busy === line.id || line.quantity >= line.maxQuantity} onPress={() => void update(line, { quantity: line.quantity + 1 })}><Plus /></Button>
                  </div>
                  <Button variant="ghost" size="sm" isDisabled={busy === line.id} onPress={() => void remove(line)}><Trash2 />{t("cloud.store.cart.remove")}</Button>
                </div>
                {!line.available && <p className="mt-1 text-xs text-destructive">{line.problem === "STORE_ALREADY_OWNED" ? t("cloud.store.errors.alreadyOwned") : t("cloud.store.cart.unavailableLine")}</p>}
              </div>
              <div className="text-right"><p className="text-base font-semibold tabular-nums">{money(line.totalCents)}</p><p className="text-xs text-muted-foreground">{line.unitPriceCents !== line.totalCents ? `${money(line.unitPriceCents)} × ${line.quantity}` : ""}</p></div>
            </article>)}
          </div>
          <section className="mt-6 grid gap-4 sm:grid-cols-[minmax(0,1fr)_20rem] sm:items-start">
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">{t("cloud.store.purchaseNotice")}</p>
              <p className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"><span className="text-muted-foreground">{t("cloud.store.cart.balance")}</span><span className="font-medium tabular-nums">{money(quote.balanceCents)}</span></p>
              {insufficient && <p className="flex flex-wrap items-center gap-2 text-xs text-destructive">{t("cloud.store.cart.insufficientBalance")}<Link to="/account/billing" className="underline">{t("cloud.store.cart.addFunds")}</Link></p>}
              {unavailable && <p className="text-xs text-destructive">{t("cloud.store.cart.unavailableLine")}</p>}
            </div>
            <div className="space-y-3 rounded-md border border-border p-4">
              <p className="flex items-baseline justify-between"><span className="text-sm text-muted-foreground">{t("cloud.store.total")}</span><span className="text-xl font-semibold tabular-nums">{money(quote.subtotalCents)}</span></p>
              <Button className="w-full" isDisabled={!quote.options.canCheckout || checkingOut} onPress={() => void checkout()}>{checkingOut ? <LoaderCircle className="animate-spin" /> : <CreditCard />}{checkingOut ? t("cloud.store.cart.checkingOut") : t("cloud.store.cart.checkout")}</Button>
            </div>
          </section>
        </>}
    <Dialog isOpen={Boolean(result)} onOpenChange={(open) => { if (!open) setResult(undefined); }}>
      <DialogHeader><DialogTitle>{result?.order.status === "fulfilled" ? t("cloud.store.orders.statuses.fulfilled") : t("cloud.store.cart.checkoutDone")}</DialogTitle><DialogDescription>{result?.order.order_id}</DialogDescription></DialogHeader>
      <ul className="space-y-2">{result?.items.map((item, index) => <li key={index} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"><span className="min-w-0 truncate">{item.product_name}</span><Badge variant={item.status === "fulfilled" ? "secondary" : "destructive"}>{t(`cloud.store.orders.statuses.${item.status}`)}{item.failure_reason ? ` · ${item.failure_reason}` : ""}</Badge></li>)}</ul>
      <DialogFooter><Button variant="outline" onPress={() => setResult(undefined)}>{t("cloud.store.nav.section")}</Button><Button onPress={() => { setResult(undefined); navigate("/store/orders"); }}>{t("cloud.store.cart.viewOrders")}</Button></DialogFooter>
    </Dialog>
  </div>;
}
