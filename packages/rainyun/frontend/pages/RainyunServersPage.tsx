import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { Badge, Button, api, useI18n } from "@mirelia/dashboard/frontend";
import { Link2, LoaderCircle, RefreshCw, Server, Unlink } from "lucide-react";

interface ServerItem { instance_id: number; hostname: string; ipv4: string; status: string; node: string; cpu: number | null; memory: number | null; disk: number | null; expires_at: string }
interface Payload { linked: ServerItem[]; available: ServerItem[]; canManage: boolean }

export default function RainyunServersPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const [data, setData] = useState<Payload>({ linked: [], available: [], canManage: false });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number>();
  const [error, setError] = useState("");
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
  return <div className="mx-auto w-full max-w-6xl p-5 sm:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
      <div><p className="mb-1 text-sm text-muted-foreground">{t("cloud.project.nav.projects")}</p><h1 className="text-2xl font-semibold">{t("cloud.rainyun.title")}</h1><p className="mt-1 text-sm text-muted-foreground">{t("cloud.rainyun.description")}</p></div>
      <Button variant="outline" onPress={() => { setLoading(true); void load(); }} isDisabled={loading}><RefreshCw />{t("cloud.rainyun.refresh")}</Button>
    </div>
    {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    {loading ? <p role="status" className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{t("cloud.rainyun.loading")}</p> : <>
      <section className="mt-6">
        <div className="mb-3 flex items-center gap-2"><Server className="size-4 text-muted-foreground" /><h2 className="text-sm font-semibold">{t("cloud.rainyun.linked")}</h2><Badge variant="secondary">{data.linked.length}</Badge></div>
        {data.linked.length ? <div className="divide-y divide-border border-y border-border">{data.linked.map((server) => <ServerRow key={server.instance_id} item={server} action={data.canManage ? <Button variant="outline" size="sm" onPress={() => void unlink(server.instance_id)} isDisabled={busy === server.instance_id}><Unlink />{t("cloud.rainyun.remove")}</Button> : undefined} busy={busy === server.instance_id} />)}</div> : <p className="border-y border-border py-8 text-center text-sm text-muted-foreground">{t("cloud.rainyun.empty")}</p>}
      </section>
      {data.canManage && <section className="mt-8">
        <div className="mb-3 flex items-center gap-2"><Link2 className="size-4 text-muted-foreground" /><h2 className="text-sm font-semibold">{t("cloud.rainyun.available")}</h2><Badge variant="secondary">{data.available.length}</Badge></div>
        {data.available.length ? <div className="divide-y divide-border border-y border-border">{data.available.map((server) => <ServerRow key={server.instance_id} item={server} action={<Button size="sm" onPress={() => void bind(server.instance_id)} isDisabled={busy === server.instance_id}>{busy === server.instance_id && <LoaderCircle className="animate-spin" />}{t("cloud.rainyun.add")}</Button>} busy={busy === server.instance_id} />)}</div> : <p className="border-y border-border py-8 text-center text-sm text-muted-foreground">{t("cloud.rainyun.noAvailable")}</p>}
      </section>}
    </>}
  </div>;
}

function ServerRow({ item, action, busy }: { item: ServerItem; action?: ReactNode; busy: boolean }) {
  return <div className="flex flex-wrap items-center justify-between gap-4 py-3">
    <div className="flex min-w-0 items-start gap-3"><Server className="mt-1 size-4 shrink-0 text-muted-foreground" /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{item.hostname}</span><Badge variant={item.status.toLowerCase() === "running" ? "secondary" : "outline"}>{item.status}</Badge><span className="text-xs text-muted-foreground">#{item.instance_id}</span></div><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"><span>{item.ipv4 || "-"}</span>{item.node && <span>{item.node}</span>}{item.cpu !== null && <span>{item.cpu} vCPU</span>}{item.memory !== null && <span>{item.memory} MB</span>}{item.disk !== null && <span>{item.disk} GB</span>}</div></div></div>
    <div className="flex shrink-0 items-center gap-2">{busy && !action && <LoaderCircle className="size-4 animate-spin text-muted-foreground" />}{action}</div>
  </div>;
}
