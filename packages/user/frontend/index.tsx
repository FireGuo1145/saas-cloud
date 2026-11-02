import { UserRound } from "lucide-react";
import type { DashboardContext } from "@mirelia/dashboard/frontend";
import { api, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@mirelia/dashboard/frontend";
import { useEffect, useState, type FormEvent } from "react";

interface Profile {
  id: number;
  username: string;
  email: string;
  avatar_url: string;
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
  ctx.route({ path: "/account/profile", component: ProfilePage, shell: "dashboard" });
}
