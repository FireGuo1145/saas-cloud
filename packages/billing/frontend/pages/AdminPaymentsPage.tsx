import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Input, api, useI18n } from "@mirelia/dashboard/frontend";
import { Check, LoaderCircle, ReceiptText, RefreshCw, ShieldCheck, X } from "lucide-react";

type Status = "pending" | "awaiting_confirm" | "paid" | "cancelled" | "rejected";
interface AdminOrder { order_id: string; user_id: number; username: string; email: string; amount_cents: number; status: Status; payment_method: string; adapter_id: string; trade_no: string; note: string; created_at: string; submitted_at: string; paid_at: string }

export default function AdminPaymentsPage() {
  const { t, language } = useI18n();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState("");
  const [awaitingOnly, setAwaitingOnly] = useState(true);
  const [tradeNo, setTradeNo] = useState<Record<string, string>>({});
  const money = (cents: number) => new Intl.NumberFormat(language === "zh" ? "zh-CN" : language === "ja" ? "ja-JP" : "en-US", { style: "currency", currency: "CNY" }).format(cents / 100);
  const load = useCallback(async () => {
    setError(""); setLoading(true);
    try { const { data } = await api.get<{ orders: AdminOrder[] }>("/billing/admin/orders"); setOrders(data.orders); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("cloud.billing.admin.errors.load")); }
    finally { setLoading(false); }
  }, [t]);
  useEffect(() => { void load(); }, [load]);
  const visible = useMemo(() => orders.filter((order) => !awaitingOnly || order.status === "awaiting_confirm"), [orders, awaitingOnly]);
  async function act(order: AdminOrder, action: "confirm" | "reject") {
    setBusy(order.order_id); setError("");
    try { await api.post(`/billing/admin/orders/${order.order_id}/${action}`, action === "confirm" ? { tradeNo: tradeNo[order.order_id] ?? "" } : {}); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("cloud.billing.admin.errors.act")); }
    finally { setBusy(undefined); }
  }
  const statusLabel = (status: Status) => t(`cloud.billing.${status === "awaiting_confirm" ? "awaitingConfirm" : status === "cancelled" ? "cancelled" : status === "rejected" ? "rejected" : status}`);
  return <div className="mx-auto w-full max-w-5xl p-5 sm:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
      <div><p className="mb-1 flex items-center gap-1.5 text-sm text-muted-foreground"><ShieldCheck className="size-3.5" />{t("cloud.billing.admin.nav.section")}</p><h1 className="text-2xl font-semibold">{t("cloud.billing.admin.title")}</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("cloud.billing.admin.description")}</p></div>
      <div className="flex gap-2"><Button variant="outline" onPress={() => void load()} isDisabled={loading} aria-label={t("cloud.common.retry")}><RefreshCw /></Button></div>
    </div>
    <div className="flex flex-wrap items-center gap-3 border-b border-border py-4">
      <Button size="sm" variant={awaitingOnly ? "secondary" : "ghost"} aria-pressed={awaitingOnly} onPress={() => setAwaitingOnly((value) => !value)}><ReceiptText />{t("cloud.billing.admin.awaitingOnly")}</Button>
      <span className="text-xs text-muted-foreground">{visible.length}</span>
    </div>
    {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    {loading ? <p role="status" className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{t("cloud.common.loading")}</p>
      : visible.length ? <div className="mt-2 divide-y divide-border border-y border-border">{visible.map((order) => <article key={order.order_id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium"><span className="truncate tabular-nums">{order.order_id}</span><Badge variant={order.status === "paid" ? "secondary" : order.status === "rejected" ? "destructive" : "outline"}>{statusLabel(order.status)}</Badge><Badge variant="ghost">{order.payment_method}</Badge></p>
          <p className="text-xs text-muted-foreground">{t("cloud.billing.admin.user")}: {order.username} &lt;{order.email}&gt;</p>
          <p className="text-xs text-muted-foreground">{order.submitted_at ? `${t("cloud.billing.admin.submittedAt")} ${new Date(order.submitted_at).toLocaleString(language)}` : `${t("cloud.billing.date")} ${new Date(order.created_at).toLocaleString(language)}`}</p>
          {order.note && <p className="rounded-md bg-muted/40 px-2 py-1 text-xs text-muted-foreground">{t("cloud.billing.admin.note")}: {order.note}</p>}
          {order.trade_no && <p className="text-xs text-muted-foreground">{t("cloud.billing.admin.tradeNo")}: {order.trade_no}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <span className="mr-2 text-sm font-semibold tabular-nums">{money(order.amount_cents)}</span>
          {order.status === "awaiting_confirm" && <Input value={tradeNo[order.order_id] ?? ""} onChange={(event) => setTradeNo((current) => ({ ...current, [order.order_id]: event.target.value }))} placeholder={t("cloud.billing.admin.tradeNo")} aria-label={t("cloud.billing.admin.tradeNo")} className="w-40" />}
          {(order.status === "awaiting_confirm" || order.status === "pending" || order.status === "rejected") && <>
            {order.status === "awaiting_confirm" && <Button size="sm" variant="outline" isDisabled={busy === order.order_id} onPress={() => void act(order, "reject")}><X />{t("cloud.billing.admin.reject")}</Button>}
            <Button size="sm" isDisabled={busy === order.order_id} onPress={() => void act(order, "confirm")}>{busy === order.order_id ? <LoaderCircle className="animate-spin" /> : <Check />}{busy === order.order_id ? t("cloud.billing.admin.working") : t("cloud.billing.admin.confirm")}</Button>
          </>}
        </div>
      </article>)}</div>
        : <div className="mt-6 flex min-h-40 flex-col items-center justify-center gap-3 border-y border-border text-center"><ReceiptText className="size-7 text-muted-foreground" /><p className="text-sm text-muted-foreground">{awaitingOnly ? t("cloud.billing.admin.empty") : t("cloud.billing.admin.noOrders")}</p></div>}
  </div>;
}
