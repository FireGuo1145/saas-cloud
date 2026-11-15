import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Badge, Button, Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, api, useI18n } from "@mirelia/dashboard/frontend";
import { ArrowDownLeft, ArrowUpRight, Check, Copy, CreditCard, ImageIcon, LoaderCircle, Plus } from "lucide-react";

interface LedgerEntry { id: number; amount_cents: number; entry_type: string; description: string; created_at: string }
interface Order { id: number; order_id: string; amount_cents: number; status: "pending" | "awaiting_confirm" | "paid" | "cancelled" | "rejected"; payment_method: string; adapter_id: string; note: string; created_at: string; submitted_at: string; paid_at: string }
interface PaymentMethod { id: string; label: string; description?: string; imageUrl?: string; adapter: string }
interface ManualPayment { adapter: string; method: string; kind: "manual"; instructions: string; imageUrl?: string; amount: string; reference: string }
interface Summary { balanceCents: number; ledger: LedgerEntry[]; orders: Order[]; methods: PaymentMethod[]; minimumTopUpCents: number; isAdmin: boolean }

export default function BillingPage() {
  const { t, language } = useI18n();
  const [summary, setSummary] = useState<Summary>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("10");
  const [method, setMethod] = useState<string>();
  const [error, setError] = useState("");
  const [payment, setPayment] = useState<ManualPayment>();
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState("");
  const params = new URLSearchParams(window.location.search);
  const load = useCallback(async () => {
    try {
      const { data } = await api.get<Summary>("/billing/summary");
      setSummary(data);
      setMethod((current) => current ?? data.methods[0]?.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("cloud.billing.errors.create")); }
    finally { setLoading(false); }
  }, [t]);
  useEffect(() => { void load(); if (params.get("payment") === "returned") void load(); }, [load]);
  const money = (cents: number) => new Intl.NumberFormat(language === "zh" ? "zh-CN" : language === "ja" ? "ja-JP" : "en-US", { style: "currency", currency: "CNY" }).format(cents / 100);
  const statusLabel = (status: Order["status"]) => t(`cloud.billing.${status === "awaiting_confirm" ? "awaitingConfirm" : status === "cancelled" ? "cancelled" : status === "rejected" ? "rejected" : status}`);
  const selected = summary?.methods.find((entry) => entry.id === method);
  const order = payment ? summary?.orders.find((entry) => entry.order_id === payment.reference) : undefined;
  async function topUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!method) return;
    setBusy(true); setError("");
    try {
      const amountCents = Math.round(Number(amount) * 100);
      const { data } = await api.post<{ orderId: string; paymentUrl?: string; payment?: ManualPayment }>("/billing/top-up", { amountCents, method });
      if (data.paymentUrl) { window.location.assign(data.paymentUrl); return; }
      if (data.payment) { setPayment(data.payment); setNote(""); await load(); return; }
      setError(t("cloud.billing.unavailable"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("cloud.billing.errors.create")); }
    finally { setBusy(false); }
  }
  async function submitPayment() {
    if (!payment) return;
    setSubmitting(true); setError("");
    try {
      await api.post(`/billing/orders/${payment.reference}/submit`, { note });
      setMessage(t("cloud.billing.manual.submitted"));
      setPayment(undefined); setOpen(false);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("cloud.billing.errors.orderState")); }
    finally { setSubmitting(false); }
  }
  function closeDialog(open: boolean) {
    if (busy || submitting) return;
    setOpen(open);
    if (!open) { setPayment(undefined); setError(""); }
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(text); setTimeout(() => setCopied(""), 2000); } catch { /* Clipboard access can be denied. */ }
  }
  const canSubmitAgain = order && ["pending", "rejected", "awaiting_confirm"].includes(order.status);
  return <div className="mx-auto w-full max-w-6xl p-5 sm:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
      <div><p className="mb-1 text-sm text-muted-foreground">{t("cloud.account.title")}</p><h1 className="text-2xl font-semibold">{t("cloud.billing.title")}</h1></div>
      <Button onPress={() => { setPayment(undefined); setError(""); setOpen(true); }} isDisabled={!summary?.methods.length}><Plus />{t("cloud.billing.recharge")}</Button>
    </div>
    {params.get("payment") === "returned" && <p role="status" className="mt-4 text-sm text-muted-foreground">{t("cloud.billing.returnSuccess")}</p>}
    {message && <p role="status" className="mt-4 text-sm text-muted-foreground">{message}</p>}
    {error && !open && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    <section className="mt-6 border-b border-border pb-6">
      <p className="text-sm text-muted-foreground">{t("cloud.billing.balance")}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{loading ? "—" : money(summary?.balanceCents ?? 0)}</p>
      {summary && !summary.methods.length && <p className="mt-2 text-sm text-muted-foreground">{t("cloud.billing.noPaymentMethod")}</p>}
    </section>
    <section className="mt-7">
      <div className="mb-3 flex items-center gap-2"><CreditCard className="size-4 text-muted-foreground" /><h2 className="text-sm font-semibold">{t("cloud.billing.history")}</h2></div>
      {loading ? <p className="py-6 text-sm text-muted-foreground">{t("cloud.common.loading")}</p> : summary?.ledger.length ? <div className="divide-y divide-border border-y border-border">{summary.ledger.map((entry) => <div key={entry.id} className="grid grid-cols-[1fr_auto] items-center gap-3 py-3 sm:grid-cols-[1fr_12rem_10rem]"><span className="min-w-0 truncate text-sm">{entry.description}</span><time className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleString(language)}</time><span className={`flex items-center justify-end gap-1 text-sm font-medium tabular-nums ${entry.amount_cents < 0 ? "text-destructive" : "text-foreground"}`}>{entry.amount_cents < 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownLeft className="size-3.5" />}{money(entry.amount_cents)}</span></div>)}</div> : <p className="border-y border-border py-8 text-center text-sm text-muted-foreground">{t("cloud.billing.noHistory")}</p>}
    </section>
    <section className="mt-7">
      <h2 className="mb-3 text-sm font-semibold">{t("cloud.billing.orders")}</h2>
      {summary?.orders.length ? <div className="divide-y divide-border border-y border-border">{summary.orders.map((entry) => <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="min-w-0"><p className="truncate text-sm font-medium">{entry.order_id}</p><time className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleString(language)}</time>{entry.status === "rejected" && <p className="text-xs text-destructive">{t("cloud.billing.manual.rejectedHint")}</p>}</div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground">{summary.methods.find((item) => item.id === entry.payment_method)?.label ?? entry.payment_method}</span>
          <span className="text-sm tabular-nums">{money(entry.amount_cents)}</span>
          <Badge variant={entry.status === "paid" ? "secondary" : entry.status === "rejected" ? "destructive" : "outline"}>{statusLabel(entry.status)}</Badge>
          {entry.status === "pending" && entry.adapter_id === "manual" && <Button size="sm" variant="ghost" onPress={() => { setPayment({ adapter: "manual", method: entry.payment_method, kind: "manual", instructions: "", amount: (entry.amount_cents / 100).toFixed(2), reference: entry.order_id }); setNote(entry.note ?? ""); setOpen(true); void load(); }}>{t("cloud.billing.manual.submit")}</Button>}
        </div>
      </div>)}</div> : <p className="border-y border-border py-8 text-center text-sm text-muted-foreground">{t("cloud.billing.noOrders")}</p>}
    </section>
    <Dialog isOpen={open} onOpenChange={closeDialog}>
      <DialogHeader><DialogTitle>{payment ? t("cloud.billing.manual.title") : t("cloud.billing.recharge")}</DialogTitle><DialogDescription>{payment ? t("cloud.billing.manual.description") : summary ? t("cloud.billing.minimum", { amount: money(summary.minimumTopUpCents) }) : ""}</DialogDescription></DialogHeader>
      {payment ? <div className="space-y-4">
        <div className="grid gap-3 rounded-md border border-border p-3 text-sm">
          <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">{t("cloud.billing.manual.orderId")}</span><span className="flex items-center gap-1 font-medium tabular-nums">{payment.reference}<Button size="icon-xs" variant="ghost" aria-label={t("cloud.common.save")} onPress={() => void copy(payment.reference)} title={copied === payment.reference ? t("cloud.common.save") : t("cloud.billing.manual.orderId")}><Copy /></Button></span></div>
          <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">{t("cloud.billing.manual.amount")}</span><span className="text-base font-semibold tabular-nums">¥{payment.amount}</span></div>
          <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">{t("cloud.billing.manual.method")}</span><span className="font-medium">{summary?.methods.find((item) => item.id === payment.method)?.label ?? payment.method}</span></div>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("cloud.billing.manual.instructions")}</p>
          {payment.instructions && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{payment.instructions}</p>}
          <p className="text-xs text-muted-foreground">{t("cloud.billing.manual.confirmationNumber")}</p>
        </div>
        {payment.imageUrl && <figure className="overflow-hidden rounded-md border border-border bg-muted/30"><img src={payment.imageUrl} alt={t("cloud.billing.manual.method")} className="mx-auto max-h-64 w-auto object-contain" onError={(event) => { (event.currentTarget.parentElement as HTMLElement).hidden = true; }} /><figcaption className="flex items-center justify-center gap-1 border-t border-border py-1.5 text-xs text-muted-foreground"><ImageIcon className="size-3" />{summary?.methods.find((item) => item.id === payment.method)?.label}</figcaption></figure>}
        {order && <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{order.status === "awaiting_confirm" ? t("cloud.billing.manual.awaitingHint") : t("cloud.billing.manual.pendingHint")}</p>}
        <div className="space-y-2"><Label htmlFor="billing-note">{t("cloud.billing.manual.note")}</Label><Input id="billing-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} /></div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" onPress={() => closeDialog(false)} isDisabled={submitting}>{t("cloud.common.cancel")}</Button><Button type="button" onPress={() => void submitPayment()} isDisabled={submitting || !canSubmitAgain}>{submitting ? <LoaderCircle className="animate-spin" /> : <Check />}{submitting ? t("cloud.billing.manual.submitting") : t("cloud.billing.manual.submit")}</Button></DialogFooter>
      </div> : <form className="space-y-5" onSubmit={(event) => void topUp(event)}>
        <div className="space-y-2"><Label htmlFor="billing-amount">{t("cloud.billing.amount")}</Label><Input id="billing-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required /></div>
        <div className="space-y-2"><Label>{t("cloud.billing.paymentMethod")}</Label><div className="flex flex-wrap gap-2">{(summary?.methods ?? []).map((entry) => <Button key={entry.id} type="button" variant={method === entry.id ? "secondary" : "outline"} aria-pressed={method === entry.id} onPress={() => setMethod(entry.id)}>{entry.label}</Button>)}</div>
          {selected?.description && <p className="text-xs text-muted-foreground">{selected.description}</p>}
          {selected?.imageUrl && <figure className="mt-2 overflow-hidden rounded-md border border-border bg-muted/30"><img src={selected.imageUrl} alt={selected.label} className="mx-auto max-h-40 w-auto object-contain" onError={(event) => { (event.currentTarget.parentElement as HTMLElement).hidden = true; }} /></figure>}
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" onPress={() => closeDialog(false)}>{t("cloud.common.cancel")}</Button><Button type="submit" isDisabled={busy || !amount || !method}>{busy && <LoaderCircle className="animate-spin" />}{busy ? t("cloud.billing.creating") : t("cloud.billing.continuePayment")}</Button></DialogFooter>
      </form>}
    </Dialog>
  </div>;
}
