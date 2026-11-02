import { useState, type FormEvent } from "react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@mirelia/dashboard/frontend";

export default function RegisterPage() {
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
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, email, password })
      });
      const payload = await response.json() as { error?: string; returnTo?: string };
      if (!response.ok) throw new Error(payload.error || "Could not create account");
      window.location.assign(payload.returnTo || "/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Create an account</CardTitle>
          <CardDescription>Set up your Mirelia account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input id="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required minLength={2} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={12} />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" type="submit" disabled={busy}>
              {busy ? "Creating account..." : "Create account"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">Already registered? <a className="underline underline-offset-4" href="/login">Sign in</a></p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
