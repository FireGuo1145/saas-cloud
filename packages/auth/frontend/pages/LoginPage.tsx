import { useEffect, useState, type FormEvent } from "react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@mirelia/dashboard/frontend";

interface AuthConfiguration {
  loginEnabled: boolean;
  registrationEnabled: boolean;
}

export default function LoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [configuration, setConfiguration] = useState<AuthConfiguration>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/auth/configuration")
      .then((response) => response.json())
      .then((value: AuthConfiguration) => {
        if (active) setConfiguration(value);
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
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier, password, returnTo: new URLSearchParams(window.location.search).get("returnTo") })
      });
      const payload = await response.json() as { error?: string; returnTo?: string };
      if (!response.ok) throw new Error(payload.error || "Could not sign in");
      window.location.assign(payload.returnTo || "/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Access your Mirelia account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="identifier">Email or username</Label>
              <Input id="identifier" autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {!configuration?.loginEnabled && <p className="text-sm text-muted-foreground">Password login is unavailable.</p>}
            <Button className="w-full" type="submit" disabled={busy || !configuration?.loginEnabled}>
              {busy ? "Signing in..." : "Sign in"}
            </Button>
            {configuration?.registrationEnabled && <p className="text-center text-sm text-muted-foreground">New here? <a className="underline underline-offset-4" href="/register">Create an account</a></p>}
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
