import { ArrowRight, FolderKanban, UserRound } from "lucide-react";
import type { DashboardContext } from "@mirelia/dashboard/frontend";
import { api, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, LinkButton } from "@mirelia/dashboard/frontend";
import { useEffect, useState, type FormEvent } from "react";
import { useI18n } from "@mirelia/dashboard/frontend";

interface Profile {
  id: number;
  username: string;
  email: string;
  avatar_url: string;
}

function AccountHomePage() {
  const { t } = useI18n();
  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => {
    void api.get("/user/me").then((response) => setProfile(response.data as Profile));
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl p-5 sm:p-8">
      <div className="border-b border-border pb-5">
        <p className="mb-1 text-sm text-muted-foreground">{t("cloud.account.title")}</p>
        <h1 className="text-2xl font-semibold">{profile ? t("cloud.account.welcome", { username: profile.username }) : t("cloud.account.home")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("cloud.account.overview")}</p>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <UserRound className="size-5 text-muted-foreground" />
              <div><CardTitle>{t("cloud.account.profile")}</CardTitle><CardDescription>{profile?.email || t("cloud.account.profileDescription")}</CardDescription></div>
            </div>
          </CardHeader>
          <CardContent><LinkButton variant="outline" href="/account/profile">{t("cloud.account.manageAccount")}<ArrowRight /></LinkButton></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <FolderKanban className="size-5 text-muted-foreground" />
              <div><CardTitle>{t("cloud.account.projects")}</CardTitle><CardDescription>{t("cloud.account.projectsDescription")}</CardDescription></div>
            </div>
          </CardHeader>
          <CardContent><LinkButton href="/">{t("cloud.account.goToProjects")}<ArrowRight /></LinkButton></CardContent>
        </Card>
      </div>
    </div>
  );
}

function ProfilePage() {
  const { t } = useI18n();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void api.get("/user/me").then((response) => setProfile(response.data as Profile));
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await api.put("/user/me", profile);
      setProfile(response.data as Profile);
      setMessage(t("cloud.account.saved"));
    } catch {
      setMessage(t("cloud.account.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl p-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <UserRound className="size-5 text-muted-foreground" />
            <div>
              <CardTitle>{t("cloud.account.profile")}</CardTitle>
              <CardDescription>{t("cloud.account.profileDescription")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {profile ? (
            <form className="space-y-5" onSubmit={(event) => void save(event)}>
              <div className="space-y-2">
                <Label htmlFor="profile-username">{t("cloud.account.username")}</Label>
                <Input id="profile-username" autoComplete="username" value={profile.username} onChange={(event) => setProfile({ ...profile, username: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-email">{t("cloud.account.email")}</Label>
                <Input id="profile-email" type="email" autoComplete="email" value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} />
              </div>
              {message && <p className="text-sm text-muted-foreground" role="status">{message}</p>}
              <Button type="submit" isDisabled={busy}>{busy ? t("cloud.common.saving") : t("cloud.common.save")}</Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">{t("cloud.common.loading")}</p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

export default function apply(ctx: DashboardContext) {
  ctx.navigation({ id: "account", label: "Account", labelKey: "cloud.account.nav.account", path: "/account", icon: UserRound, order: 90, paths: ["/account", "/account/profile"] });
  ctx.route({ path: "/account", component: AccountHomePage, shell: "dashboard" });
  ctx.route({ path: "/account/profile", component: ProfilePage, shell: "dashboard" });
}
