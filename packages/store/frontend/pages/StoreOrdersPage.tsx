import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Badge, Button, LinkButton, api, useI18n } from "@mirelia/dashboard/frontend";
import { LoaderCircle, PackageCheck, RefreshCw, ReceiptText, RotateCw } from "lucide-react";
import { formatMoney } from "./StoreCatalogPage";

interface OrderItem { id: number; product_name: string; project_id: number; project_name: string; quantity: number; unit_price_cents: number; period: string; status: string; failure_reason: string }
interface Order { order_id: string; total_cents: number; status: string; failure_reason: string; created_at: string; items: OrderItem[] }
interface Payload { orders: Order[]; currency: string }

export default function StoreOrdersPage() {
  const { t, language } = useI18n();
  const [params] = useSearchParams();
  const [payload, setPayload] = useState<Payload>({ orders: [], currency: "CNY" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState("");
  const money = (cents: number) => formatMoney(language, payload.currency, cents);
  const highlight = params.get("order");
  const load = useCallback(async () => {
    setError("");
    try {
      const { data } = await api.get<Payload>("/store/orders");
      const orders = await Promise.all(data.orders.map(async (order) => order.status === "paid" || order.status === "processing" || order.status === "failed"
        ? (await api.get<{ order: Order; items: OrderItem[] }>(`/store/orders/${order.order_id}`).then(({ data: fresh }) => ({ ...fresh.order, items: fresh.items })).catch(() => order))
        : order));
      setPayload({ ...data, orders });
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("cloud.store.errors.orderNotFound")); }
    finally { setLoading(false); }
  }, [t]);
  useEffect(() => { void load(); }, [load]);
  async function retry(order: Order) {
    setBusy(order.order_id); setError("");
    try {
      await api.get(`/store/orders/${order.order_id}`);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("cloud.store.errors.provider")); }
    finally { setBusy(undefined); }
  }
  return <div className="mx-auto w-full max-w-5xl p-5 sm:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
      <div><p className="mb-1 text-sm text-muted-foreground"><Link to="/store" className="hover:underline">{t("cloud.store.nav.catalog")}</Link></p><h1 className="text-2xl font-semibold">{t("cloud.store.orders.title")}</h1><p className="mt-1 text-sm text-muted-foreground">{t("cloud.store.orders.description")}</p></div>
      <Button variant="outline" onPress={() => { setLoading(true); void load(); }} isDisabled={loading} aria-label={t("cloud.store.refresh")}><RefreshCw /></Button>
    </div>
    {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    {loading ? <p role="status" className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{t("cloud.common.loading")}</p>
      : payload.orders.length ? <div className="mt-4 space-y-4">{payload.orders.map((order) => <section key={order.order_id} className={`rounded-md border p-4 ${order.order_id === highlight ? "border-foreground/30" : "border-border"}`}>
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
          <div className="min-w-0"><p className="flex flex-wrap items-center gap-2 text-sm font-medium"><ReceiptText className="size-4 text-muted-foreground" />{order.order_id}<Badge variant={order.status === "fulfilled" ? "secondary" : order.status === "failed" ? "destructive" : "outline"}>{t(`cloud.store.orders.statuses.${order.status}`)}</Badge></p><time className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleString(language)}</time></div>
          <div className="flex items-center gap-3"><span className="text-sm font-semibold tabular-nums">{money(order.total_cents)}</span>{(order.status === "paid" || order.status === "processing" || order.status === "failed") && <Button size="sm" variant="outline" isDisabled={busy === order.order_id} onPress={() => void retry(order)}>{busy === order.order_id ? <LoaderCircle className="animate-spin" /> : <RotateCw />}{busy === order.order_id ? t("cloud.store.orders.retrying") : t("cloud.store.orders.retry")}</Button>}</div>
        </header>
        <div className="divide-y divide-border">{order.items.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0"><p className="flex flex-wrap items-center gap-2 text-sm"><PackageCheck className="size-4 text-muted-foreground" />{item.product_name}<span className="text-xs text-muted-foreground">× {item.quantity}</span></p><p className="text-xs text-muted-foreground">{t("cloud.store.orders.project")}: {item.project_name || `#${item.project_id}`}</p>{item.failure_reason && <p className="text-xs text-destructive">{item.failure_reason}</p>}</div>
          <div className="flex items-center gap-3"><span className="text-sm tabular-nums">{money(item.unit_price_cents * item.quantity)}</span><Badge variant={item.status === "fulfilled" ? "secondary" : item.status === "failed" ? "destructive" : "outline"}>{t(`cloud.store.orders.statuses.${item.status}`)}</Badge><LinkButton size="sm" variant="ghost" href={`/projects/${item.project_id}/products`}>{t("cloud.store.orders.openProject")}</LinkButton></div>
        </div>)}</div>
      </section>)}</div>
        : <div className="mt-6 flex min-h-48 flex-col items-center justify-center gap-3 border-y border-border text-center"><ReceiptText className="size-7 text-muted-foreground" /><p className="text-sm text-muted-foreground">{t("cloud.store.orders.empty")}</p><LinkButton size="sm" href="/store">{t("cloud.store.nav.section")}</LinkButton></div>}
  </div>;
}
