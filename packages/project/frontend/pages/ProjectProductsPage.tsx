import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Badge, Button, LinkButton, api, useI18n } from "@mirelia/dashboard/frontend";
import { Boxes, LoaderCircle, RefreshCw, ShoppingBag } from "lucide-react";

interface Product { id: number; plugin_id: string; product_type: string; resource_id: string; name: string; status: string; attributes: Record<string, unknown>; order_id: string; managedBy: string; created_at: string }
interface Payload { products: Product[]; canManage: boolean }

function primitives(attributes: Record<string, unknown>) {
  return Object.entries(attributes)
    .filter(([, value]) => typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    .filter(([, value]) => value !== "" && value !== null)
    .slice(0, 8)
    .map(([key, value]) => `${key}: ${String(value)}`);
}

export default function ProjectProductsPage() {
  const { t, language } = useI18n();
  const { id } = useParams();
  const [data, setData] = useState<Payload>({ products: [], canManage: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true); setError("");
    try { const response = await api.get<Payload>(`/projects/${id}/products`); setData(response.data); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("cloud.project.products.errors.load")); }
    finally { setLoading(false); }
  }, [id, t]);
  useEffect(() => { void load(); }, [load]);
  return <div className="mx-auto w-full max-w-6xl p-5 sm:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
      <div><p className="mb-1 text-sm text-muted-foreground">{t("cloud.project.nav.projects")}</p><h1 className="text-2xl font-semibold">{t("cloud.project.products.title")}</h1><p className="mt-1 text-sm text-muted-foreground">{t("cloud.project.products.description")}</p></div>
      <div className="flex gap-2"><LinkButton variant="outline" href="/store"><ShoppingBag />{t("cloud.project.products.browse")}</LinkButton><Button variant="outline" onPress={() => void load()} isDisabled={loading}><RefreshCw /></Button></div>
    </div>
    {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    {loading ? <p role="status" className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{t("cloud.project.products.loading")}</p>
      : data.products.length ? <div className="mt-5 divide-y divide-border border-y border-border">{data.products.map((product) => <article key={product.id} className="flex flex-wrap items-start justify-between gap-4 py-4">
        <div className="flex min-w-0 items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-card"><Boxes className="size-4 text-muted-foreground" /></span>
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-medium">{product.name}</h2><Badge variant="outline">{product.plugin_id}</Badge><Badge variant={product.status === "active" ? "secondary" : "outline"}>{product.status}</Badge>{product.order_id && <Badge variant="secondary">{t("cloud.project.products.purchasedBadge")}</Badge>}</div>
            <p className="mt-1 text-xs text-muted-foreground">{t("cloud.project.products.provider")}: {product.managedBy} · #{product.resource_id}</p>
            <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">{primitives(product.attributes).map((line) => <span key={line}>{line}</span>)}</p></div></div>
        <div className="text-right text-xs text-muted-foreground"><p>{t("cloud.project.products.purchased")}</p><time>{new Date(product.created_at).toLocaleString(language)}</time></div>
      </article>)}</div>
        : <div className="mt-5 flex min-h-40 flex-col items-center justify-center gap-3 border-y border-border text-center"><Boxes className="size-7 text-muted-foreground" /><p className="text-sm text-muted-foreground">{t("cloud.project.products.empty")}</p><LinkButton size="sm" href="/store"><ShoppingBag />{t("cloud.project.products.browse")}</LinkButton></div>}
  </div>;
}
