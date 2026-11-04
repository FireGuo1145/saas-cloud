import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Badge, Button, Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, api, useI18n } from "@mirelia/dashboard/frontend";
import { ArrowDownLeft, ArrowUpRight, CreditCard, LoaderCircle, Plus } from "lucide-react";

interface LedgerEntry { id: number; amount_cents: number; entry_type: string; description: string; created_at: string }
interface Order { id: number; order_id: string; amount_cents: number; status: "pending" | "paid" | "cancelled"; payment_method: string; created_at: string }
interface Summary { balanceCents: number; ledger: LedgerEntry[]; orders: Order[]; epayEnabled: boolean; minimumTopUpCents: number }

export default function BillingPage() {
  const { t, language } = useI18n();
  const [summary, setSummary] = useState<Summary>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("10");
  const [method, setMethod] = useState("alipay");
  const [error, setError] = useState("");
  const params = new URLSearchParams(window.location.search);
  const load = useCallback(async () => {
    try { const { data } = await api.get<Summary>("/billing/summary"); setSummary(data); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("cloud.billing.errors.create")); }
    finally { setLoading(false); }
  }, [t]);
  useEffect(() => { void load(); if (params.get("payment") === "returned") void load(); }, [load]);
  const money = (cents: number) => new Intl.NumberFormat(language === "zh" ? "zh-CN" : language === "ja" ? "ja-JP" : "en-US", { style: "currency", currency: "CNY" }).format(cents / 100);
  async function topUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const amountCents = Math.round(Number(amount) * 100);
      const { data } = await api.post<{ paymentUrl: string }>("/billing/top-up", { amountCents, method });
      window.location.assign(data.paymentUrl);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("cloud.billing.errors.create")); setBusy(false); }
  }
  return <div className="mx-auto w-full max-w-6xl p-5 sm:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
      <div><p className="mb-1 text-sm text-muted-foreground">{t("cloud.account.title")}</p><h1 className="text-2xl font-semibold">{t("cloud.billing.title")}</h1></div>
      <Button onPress={() => setOpen(true)} isDisabled={!summary?.epayEnabled}><Plus />{t("cloud.billing.recharge")}</Button>
    </div>
    {params.get("payment") === "returned" && <p role="status" className="mt-4 text-sm text-muted-foreground">{t("cloud.billing.returnSuccess")}</p>}
    {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    <section className="mt-6 border-b border-border pb-6">
      <p className="text-sm text-muted-foreground">{t("cloud.billing.balance")}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{loading ? "—" : money(summary?.balanceCents ?? 0)}</p>
      {summary && !summary.epayEnabled && <p className="mt-2 text-sm text-muted-foreground">{t("cloud.billing.unavailable")}</p>}
    </section>
    <section className="mt-7">
      <div className="mb-3 flex items-center gap-2"><CreditCard className="size-4 text-muted-foreground" /><h2 className="text-sm font-semibold">{t("cloud.billing.history")}</h2></div>
      {loading ? <p className="py-6 text-sm text-muted-foreground">{t("cloud.common.loading")}</p> : summary?.ledger.length ? <div className="divide-y divide-border border-y border-border">{summary.ledger.map((entry) => <div key={entry.id} className="grid grid-cols-[1fr_auto] items-center gap-3 py-3 sm:grid-cols-[1fr_12rem_10rem]"><span className="min-w-0 truncate text-sm">{entry.description}</span><time className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleString(language)}</time><span className={`flex items-center justify-end gap-1 text-sm font-medium tabular-nums ${entry.amount_cents < 0 ? "text-destructive" : "text-foreground"}`}>{entry.amount_cents < 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownLeft className="size-3.5" />}{money(entry.amount_cents)}</span></div>)}</div> : <p className="border-y border-border py-8 text-center text-sm text-muted-foreground">{t("cloud.billing.noHistory")}</p>}
    </section>
    {summary?.orders.length ? <section className="mt-7"><h2 className="mb-3 text-sm font-semibold">{t("cloud.billing.recharge")}</h2><div className="divide-y divide-border border-y border-border">{summary.orders.map((order) => <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-medium">{order.order_id}</p><time className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleString(language)}</time></div><div className="flex items-center gap-3"><span className="text-sm tabular-nums">{money(order.amount_cents)}</span><Badge variant={order.status === "paid" ? "secondary" : "outline"}>{t(`cloud.billing.${order.status}`)}</Badge></div></div>)}</div></section> : null}
    <Dialog isOpen={open} onOpenChange={setOpen}><DialogHeader><DialogTitle>{t("cloud.billing.recharge")}</DialogTitle><DialogDescription>{summary ? t("cloud.billing.minimum", { amount: money(summary.minimumTopUpCents) }) : ""}</DialogDescription></DialogHeader>
      <form className="space-y-5" onSubmit={(event) => void topUp(event)}>
        <div className="space-y-2"><Label htmlFor="billing-amount">{t("cloud.billing.amount")}</Label><Input id="billing-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required /></div>
        <div className="space-y-2"><Label>{t("cloud.billing.paymentMethod")}</Label><div className="flex gap-2"><Button type="button" variant={method === "alipay" ? "secondary" : "outline"} aria-pressed={method === "alipay"} onPress={() => setMethod("alipay")}>{t("cloud.billing.alipay")}</Button><Button type="button" variant={method === "wxpay" ? "secondary" : "outline"} aria-pressed={method === "wxpay"} onPress={() => setMethod("wxpay")}>{t("cloud.billing.wechat")}</Button></div></div>
        <DialogFooter><Button type="button" variant="outline" onPress={() => setOpen(false)}>{t("cloud.common.cancel")}</Button><Button type="submit" isDisabled={busy || !amount}>{busy && <LoaderCircle className="animate-spin" />}{busy ? t("cloud.billing.creating") : t("cloud.billing.continuePayment")}</Button></DialogFooter>
      </form>
    </Dialog>
  </div>;
}
