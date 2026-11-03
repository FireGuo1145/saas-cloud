import { useEffect, useState, type FormEvent } from "react";
import { api, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Link, LanguageSwitcher, ThemeSwitcher, useI18n } from "@mirelia/dashboard/frontend";

interface AuthConfiguration {
  loginEnabled: boolean;
  registrationEnabled: boolean;
}

export default function LoginPage() {
  const { t } = useI18n();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [configuration, setConfiguration] = useState<AuthConfiguration>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void api.get<AuthConfiguration>("/auth/configuration")
      .then(({ data }) => {
        if (active) setConfiguration(data);
      })
      .catch(() => {
        if (active) setConfiguration({ loginEnabled: false, registrationEnabled: false });
      });
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post<{ returnTo?: string }>("/auth/login", { identifier, password, returnTo: new URLSearchParams(window.location.search).get("returnTo") });
      window.location.assign(data.returnTo || "/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("cloud.auth.errors.credentials"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="absolute right-4 top-4 flex items-center gap-1"><ThemeSwitcher /><LanguageSwitcher /></div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("cloud.auth.loginTitle")}</CardTitle>
          <CardDescription>{t("cloud.auth.loginDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="identifier">{t("cloud.auth.identifier")}</Label>
              <Input id="identifier" autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("cloud.auth.password")}</Label>
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {!configuration?.loginEnabled && <p className="text-sm text-muted-foreground">{t("cloud.auth.loginUnavailable")}</p>}
            <Button className="w-full" type="submit" isDisabled={busy || !configuration?.loginEnabled}>
              {busy ? t("cloud.auth.loggingIn") : t("cloud.auth.loginTitle")}
            </Button>
            {configuration?.registrationEnabled && <p className="text-center text-sm text-muted-foreground">{t("cloud.auth.newHere")} <Link className="underline underline-offset-4" to="/register">{t("cloud.auth.createAccount")}</Link></p>}
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
