import { ArrowRight, FolderKanban, UserRound } from "lucide-react";
import type { DashboardContext } from "@mirelia/dashboard/frontend";
import { api, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, LinkButton } from "@mirelia/dashboard/frontend";
import { useEffect, useState, type FormEvent } from "react";

interface Profile {
  id: number;
  username: string;
  email: string;
  avatar_url: string;
}

function AccountHomePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => {
    void api.get("/user/me").then((response) => setProfile(response.data as Profile));
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl p-5 sm:p-8">
      <div className="border-b border-border pb-5">
        <p className="mb-1 text-sm text-muted-foreground">Account</p>
        <h1 className="text-2xl font-semibold">{profile ? `Welcome, ${profile.username}` : "Account home"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your account and workspace overview.</p>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <UserRound className="size-5 text-muted-foreground" />
              <div><CardTitle>Account profile</CardTitle><CardDescription>{profile?.email || "Manage your account details."}</CardDescription></div>
            </div>
          </CardHeader>
          <CardContent><LinkButton variant="outline" href="/account/profile">Manage account<ArrowRight /></LinkButton></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <FolderKanban className="size-5 text-muted-foreground" />
              <div><CardTitle>Projects</CardTitle><CardDescription>Open and manage your cloud projects.</CardDescription></div>
            </div>
          </CardHeader>
          <CardContent><LinkButton href="/projects">Go to projects<ArrowRight /></LinkButton></CardContent>
        </Card>
      </div>
    </div>
  );
}

function ProfilePage() {
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
      setMessage("Account details saved.");
    } catch {
      setMessage("Could not save account details.");
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
              <CardTitle>Account profile</CardTitle>
              <CardDescription>Manage your account identity.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {profile ? (
            <form className="space-y-5" onSubmit={(event) => void save(event)}>
              <div className="space-y-2">
                <Label htmlFor="profile-username">Username</Label>
                <Input id="profile-username" autoComplete="username" value={profile.username} onChange={(event) => setProfile({ ...profile, username: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-email">Email</Label>
                <Input id="profile-email" type="email" autoComplete="email" value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} />
              </div>
              {message && <p className="text-sm text-muted-foreground" role="status">{message}</p>}
              <Button type="submit" disabled={busy}>{busy ? "Saving..." : "Save changes"}</Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">Loading account...</p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

export default function apply(ctx: DashboardContext) {
  ctx.navigation({ id: "account", label: "Account", path: "/", icon: UserRound, order: 90 });
  ctx.route({ path: "/", component: AccountHomePage, shell: "dashboard" });
  ctx.route({ path: "/account/profile", component: ProfilePage, shell: "dashboard" });
}
