import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { Badge, Button, Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, LinkButton, api, useI18n } from "@mirelia/dashboard/frontend";
import { CalendarClock, Check, ChevronDown, LoaderCircle, RefreshCw, Server, ShoppingBag, Unlink } from "lucide-react";

interface ServerItem { instance_id: number; hostname: string; ipv4: string; status: string; node: string; cpu: number | null; memory: number | null; disk: number | null; expires_at: string }
interface Payload { linked: ServerItem[]; available: ServerItem[]; canManage: boolean }
interface Renewable { instanceId: number; hostname: string; expiresAt: string; expiring: boolean; cpu: number | null; memory: number | null; disk: number | null; status: string }
interface RenewalQuote { instanceId: number; days: number; priceCents: number; available: boolean }

export default function RainyunServersPage() {
  const { t, language } = useI18n();
  const { id } = useParams();
  const [data, setData] = useState<Payload>({ linked: [], available: [], canManage: false });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number>();
  const [error, setError] = useState("");
  const [renewOpen, setRenewOpen] = useState(false);
  const [servers, setServers] = useState<Renewable[]>([]);
  const [renewAvailable, setRenewAvailable] = useState(true);
  const [instanceId, setInstanceId] = useState<number>();
  const [days, setDays] = useState(30);
  const [quote, setQuote] = useState<RenewalQuote>();
  const [quoting, setQuoting] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [message, setMessage] = useState("");
  const money = (cents: number) => new Intl.NumberFormat(language === "zh" ? "zh-CN" : language === "ja" ? "ja-JP" : "en-US", { style: "currency", currency: "CNY" }).format(cents / 100);
  const load = useCallback(async () => {
    if (!id) return;
    setError("");
    try { const response = await api.get<Payload>(`/projects/${id}/rainyun/servers`); setData(response.data); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("cloud.rainyun.errors.load")); }
    finally { setLoading(false); }
  }, [id, t]);
  useEffect(() => { void load(); }, [load]);
  async function bind(instanceId: number) {
    if (!id) return;
    setBusy(instanceId); setError("");
    try { await api.post(`/projects/${id}/rainyun/servers`, { instanceId }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("cloud.rainyun.errors.request")); }
    finally { setBusy(undefined); }
  }
  async function unlink(instanceId: number) {
    if (!id) return;
    setBusy(instanceId); setError("");
    try { await api.delete(`/projects/${id}/rainyun/servers/${instanceId}`); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("cloud.rainyun.errors.request")); }
    finally { setBusy(undefined); }
  }
  async function openRenew() {
    if (!id) return;
    setError(""); setMessage(""); setQuote(undefined); setDays(30); setRenewing(false);
    try {
      const { data: payload } = await api.get<{ servers: Renewable[]; available: boolean }>(`/projects/${id}/rainyun/renewal-options`);
      setServers(payload.servers); setRenewAvailable(payload.available);
      setInstanceId(payload.servers[0]?.instanceId);
      setRenewOpen(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("cloud.rainyun.store.renewUnavailable")); }
  }
  useEffect(() => {
    if (!id || !renewOpen || !instanceId) return;
    let active = true;
    setQuoting(true); setQuote(undefined);
    const timer = setTimeout(() => {
      void api.get<RenewalQuote>(`/projects/${id}/rainyun/renewal-quote?instanceId=${instanceId}&days=${days}`)
        .then(({ data: result }) => { if (active) setQuote(result); })
        .catch(() => { if (active) setQuote(undefined); })
        .finally(() => { if (active) setQuoting(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [id, renewOpen, instanceId, days]);
  async function renew() {
    if (!id || !instanceId) return;
    setRenewing(true); setError("");
    try {
      await api.post(`/projects/${id}/rainyun/renewals`, { instanceId, days });
      setRenewOpen(false); setMessage(t("cloud.rainyun.store.renewUntil") + " · " + t("cloud.rainyun.refresh"));
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("cloud.rainyun.store.renewFail")); }
    finally { setRenewing(false); }
  }
  const selectedServer = servers.find((server) => server.instanceId === instanceId);
  return <div className="mx-auto w-full max-w-6xl p-5 sm:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
      <div><p className="mb-1 text-sm text-muted-foreground">{t("cloud.project.nav.projects")}</p><h1 className="text-2xl font-semibold">{t("cloud.rainyun.title")}</h1><p className="mt-1 text-sm text-muted-foreground">{t("cloud.rainyun.description")}</p></div>
      <div className="flex flex-wrap gap-2">
        <LinkButton variant="outline" href="/store"><ShoppingBag />{t("cloud.store.nav.section")}</LinkButton>
        <Button variant="outline" onPress={() => void openRenew()} isDisabled={loading || !data.canManage || !data.linked.length}><CalendarClock />{t("cloud.rainyun.store.renew")}</Button>
        <Button variant="outline" onPress={() => { setLoading(true); void load(); }} isDisabled={loading}><RefreshCw />{t("cloud.rainyun.refresh")}</Button>
      </div>
    </div>
    {message && <p role="status" className="mt-4 text-sm text-muted-foreground">{message}</p>}
    {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    {loading ? <p role="status" className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{t("cloud.rainyun.loading")}</p> : <>
      <section className="mt-6">
        <div className="mb-3 flex items-center gap-2"><Server className="size-4 text-muted-foreground" /><h2 className="text-sm font-semibold">{t("cloud.rainyun.linked")}</h2><Badge variant="secondary">{data.linked.length}</Badge></div>
        {data.linked.length ? <div className="divide-y divide-border border-y border-border">{data.linked.map((server) => <ServerRow key={server.instance_id} item={server} action={data.canManage ? <Button variant="outline" size="sm" onPress={() => void unlink(server.instance_id)} isDisabled={busy === server.instance_id}><Unlink />{t("cloud.rainyun.remove")}</Button> : undefined} busy={busy === server.instance_id} />)}</div> : <p className="border-y border-border py-8 text-center text-sm text-muted-foreground">{t("cloud.rainyun.empty")}</p>}
      </section>
      {data.canManage && <section className="mt-8">
        <div className="mb-3 flex items-center gap-2"><Server className="size-4 text-muted-foreground" /><h2 className="text-sm font-semibold">{t("cloud.rainyun.available")}</h2><Badge variant="secondary">{data.available.length}</Badge></div>
        {data.available.length ? <div className="divide-y divide-border border-y border-border">{data.available.map((server) => <ServerRow key={server.instance_id} item={server} action={<Button size="sm" onPress={() => void bind(server.instance_id)} isDisabled={busy === server.instance_id}>{busy === server.instance_id && <LoaderCircle className="animate-spin" />}{t("cloud.rainyun.add")}</Button>} busy={busy === server.instance_id} />)}</div> : <p className="border-y border-border py-8 text-center text-sm text-muted-foreground">{t("cloud.rainyun.noAvailable")}</p>}
      </section>}
    </>}
    <Dialog isOpen={renewOpen} onOpenChange={(open) => { if (!renewing) setRenewOpen(open); }}>
      <DialogHeader><DialogTitle>{t("cloud.rainyun.store.renewTitle")}</DialogTitle><DialogDescription>{t("cloud.rainyun.store.renewDescription")}</DialogDescription></DialogHeader>
      <div className="space-y-5">
        <div className="space-y-2"><p className="text-sm font-medium">{t("cloud.rainyun.store.renewServer")}</p>
          <DropdownMenuTrigger>
            <Button variant="outline" className="w-full justify-between" isDisabled={!servers.length}>{selectedServer?.hostname ?? t("cloud.rainyun.store.renewNoServers")}<ChevronDown /></Button>
            <DropdownMenu><DropdownMenuLabel>{t("cloud.rainyun.linked")}</DropdownMenuLabel>{servers.map((server) => <DropdownMenuItem key={server.instanceId} onAction={() => setInstanceId(server.instanceId)}>{server.hostname}{server.instanceId === instanceId && <Check className="ml-auto size-4" />}</DropdownMenuItem>)}</DropdownMenu>
          </DropdownMenuTrigger>
          {selectedServer?.expiresAt && <p className="text-xs text-muted-foreground">{t("cloud.rainyun.store.renewUntil")}: {selectedServer.expiresAt}</p>}
        </div>
        <div className="space-y-2"><p className="text-sm font-medium">{t("cloud.rainyun.store.renewDays")}</p><div className="flex flex-wrap gap-2">{[7, 30, 90, 365].map((value) => <Button key={value} type="button" variant={days === value ? "secondary" : "outline"} aria-pressed={days === value} onPress={() => setDays(value)}>{value}</Button>)}</div></div>
        {!renewAvailable && <p className="text-sm text-muted-foreground">{t("cloud.rainyun.store.renewNoConfig")}</p>}
        <div className="flex items-baseline justify-between border-t border-border pt-4"><span className="text-sm text-muted-foreground">{t("cloud.rainyun.store.renewPrice")}</span><span className="text-lg font-semibold tabular-nums">{quoting || !quote ? <LoaderCircle className="size-4 animate-spin" /> : quote.available ? money(quote.priceCents) : "—"}</span></div>
        {quote && !quote.available && <p className="text-sm text-muted-foreground">{t("cloud.rainyun.store.renewUnavailable")}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" onPress={() => setRenewOpen(false)} isDisabled={renewing}>{t("cloud.common.cancel")}</Button><Button type="button" onPress={() => void renew()} isDisabled={renewing || !instanceId || !quote?.available}>{renewing && <LoaderCircle className="animate-spin" />}{t("cloud.rainyun.store.renew")}</Button></DialogFooter>
      </div>
    </Dialog>
  </div>;
}

function ServerRow({ item, action, busy }: { item: ServerItem; action?: ReactNode; busy: boolean }) {
  return <div className="flex flex-wrap items-center justify-between gap-4 py-3">
    <div className="flex min-w-0 items-start gap-3"><Server className="mt-1 size-4 shrink-0 text-muted-foreground" /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{item.hostname}</span><Badge variant={item.status.toLowerCase() === "running" ? "secondary" : "outline"}>{item.status}</Badge><span className="text-xs text-muted-foreground">#{item.instance_id}</span></div><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"><span>{item.ipv4 || "-"}</span>{item.node && <span>{item.node}</span>}{item.cpu !== null && <span>{item.cpu} vCPU</span>}{item.memory !== null && <span>{item.memory} MB</span>}{item.disk !== null && <span>{item.disk} GB</span>}{item.expires_at && <span><CalendarClock className="mr-1 inline size-3" />{item.expires_at}</span>}</div></div></div>
    <div className="flex shrink-0 items-center gap-2">{busy && !action && <LoaderCircle className="size-4 animate-spin text-muted-foreground" />}{action}</div>
  </div>;
}
