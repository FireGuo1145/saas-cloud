import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Input, api, useI18n } from "@mirelia/dashboard/frontend";
import { LoaderCircle, RefreshCw, Search, ShieldCheck, ShieldOff, UsersRound } from "lucide-react";

interface SiteUser { id: number; username: string; email: string; is_admin: boolean; email_verified: boolean; created_at: string }
interface Profile { id: number }

export default function AdminUsersPage() {
  const { t, language } = useI18n();
  const [users, setUsers] = useState<SiteUser[]>([]);
  const [me, setMe] = useState<number>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number>();
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [adminsOnly, setAdminsOnly] = useState(false);
  const load = useCallback(async () => {
    setError(""); setLoading(true);
    try {
      const [people, profile] = await Promise.all([api.get<{ users: SiteUser[] }>("/admin/users"), api.get<Profile>("/user/me")]);
      setUsers(people.data.users); setMe(profile.data.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("cloud.account.admin.errors.usersLoad")); }
    finally { setLoading(false); }
  }, [t]);
  useEffect(() => { void load(); }, [load]);
  async function toggle(user: SiteUser) {
    setBusy(user.id); setError("");
    try {
      await api.put(`/admin/users/${user.id}/admin`, { isAdmin: !user.is_admin });
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("cloud.account.admin.errors.usersLoad")); }
    finally { setBusy(undefined); }
  }
  const query = search.trim().toLowerCase();
  const visible = users.filter((user) => (!adminsOnly || user.is_admin) && `${user.username} ${user.email}`.toLowerCase().includes(query));
  return <div className="mx-auto w-full max-w-5xl p-5 sm:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
      <div><p className="mb-1 text-sm text-muted-foreground">{t("cloud.account.admin.nav.section")}</p><h1 className="text-2xl font-semibold">{t("cloud.account.admin.usersTitle")}</h1><p className="mt-1 text-sm text-muted-foreground">{t("cloud.account.admin.usersDescription")}</p></div>
      <Button variant="outline" onPress={() => void load()} isDisabled={loading} aria-label={t("cloud.common.retry")}><RefreshCw /></Button>
    </div>
    <div className="flex flex-wrap items-center gap-3 border-b border-border py-4">
      <div className="relative min-w-56 flex-1 sm:max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("cloud.account.admin.searchUsers")} aria-label={t("cloud.account.admin.searchUsers")} className="pl-9" />
      </div>
      <Button size="sm" variant={adminsOnly ? "secondary" : "ghost"} aria-pressed={adminsOnly} onPress={() => setAdminsOnly((value) => !value)}><ShieldCheck />{t("cloud.account.admin.onlyAdmins")}</Button>
      <span className="text-xs text-muted-foreground">{visible.length}</span>
    </div>
    {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    {loading ? <p role="status" className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{t("cloud.common.loading")}</p>
      : visible.length ? <div className="mt-2 divide-y divide-border border-b border-border">{visible.map((user) => <article key={user.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full border border-border text-xs text-muted-foreground">{user.username.slice(0, 2).toUpperCase()}</span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium"><span className="truncate">{user.username}</span>{user.id === me && <Badge variant="outline">{t("cloud.account.admin.self")}</Badge>}<Badge variant={user.is_admin ? "secondary" : "outline"}>{user.is_admin ? t("cloud.account.admin.administrator") : t("cloud.account.admin.member")}</Badge></p>
            <p className="text-xs text-muted-foreground">{user.email} · {t("cloud.account.admin.registered")} {new Date(user.created_at).toLocaleDateString(language)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {user.id === me && !user.is_admin && <span className="text-xs text-muted-foreground">{t("cloud.account.admin.self")}</span>}
          <Button size="sm" variant={user.is_admin ? "outline" : "secondary"} isDisabled={busy === user.id} onPress={() => void toggle(user)}>
            {busy === user.id ? <LoaderCircle className="animate-spin" /> : user.is_admin ? <ShieldOff /> : <ShieldCheck />}
            {user.is_admin ? t("cloud.account.admin.revoke") : t("cloud.account.admin.grant")}
          </Button>
        </div>
      </article>)}</div>
        : <div className="mt-6 flex min-h-40 flex-col items-center justify-center gap-3 border-y border-border text-center"><UsersRound className="size-7 text-muted-foreground" /><p className="text-sm text-muted-foreground">{t("cloud.account.admin.empty")}</p></div>}
  </div>;
}
