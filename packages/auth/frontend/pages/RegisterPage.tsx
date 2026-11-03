import { useState, type FormEvent } from "react";
import { api, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Link, LanguageSwitcher, useI18n } from "@mirelia/dashboard/frontend";

export default function RegisterPage() {
  const { t } = useI18n();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post<{ returnTo?: string }>("/auth/register", { username, email, password });
      window.location.assign(data.returnTo || "/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("cloud.auth.errors.createAccountFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="absolute right-4 top-4"><LanguageSwitcher /></div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("cloud.auth.registerTitle")}</CardTitle>
          <CardDescription>{t("cloud.auth.registerDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="username">{t("cloud.auth.username")}</Label>
              <Input id="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required minLength={2} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t("cloud.auth.email")}</Label>
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("cloud.auth.password")}</Label>
              <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={12} />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" type="submit" isDisabled={busy}>
              {busy ? t("cloud.auth.registering") : t("cloud.auth.registerTitle")}
            </Button>
            <p className="text-center text-sm text-muted-foreground">{t("cloud.auth.alreadyRegistered")} <Link className="underline underline-offset-4" to="/login">{t("cloud.auth.signIn")}</Link></p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
