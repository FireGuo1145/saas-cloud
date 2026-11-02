import { Context, Schema, Session } from "yumeri";
import type { User } from "@mirelia/user";
import "@mirelia/dashboard";
import "@mirelia/user";

export const depend = ["dashboard", "user"];
export const provide = ["auth"];

export interface AuthConfig {
  loginEnabled: boolean;
  registrationEnabled: boolean;
}

export const config: Schema<AuthConfig> = Schema.object({
  loginEnabled: Schema.boolean("允许账号密码登录").key("auth.loginEnabled").default(true),
  registrationEnabled: Schema.boolean("允许公开注册新账号").key("auth.registrationEnabled").default(true)
});

export interface UserService {
  authenticate(identifier: string, password: string): Promise<User | undefined>;
  register(data: { username: string; email: string; password: string }): Promise<User>;
  current(session: Session): Promise<User | undefined>;
  establishSession(session: Session, user: User): Promise<unknown>;
  revokeSession(session: Session): Promise<void>;
}

export interface AuthService {
  enabled(): boolean;
  registrationEnabled(): boolean;
  current(session: Session): Promise<User | undefined>;
}

declare module "yumeri" {
  interface Components {
    auth: AuthService;
  }
}

const publicPaths = new Set([
  "/login",
  "/register",
  "/api/auth/configuration",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/logout",
  "/api/dashboard/manifest",
  "/api/static/plugin"
]);
const assetPattern = /\.(?:js|mjs|css|map|json|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf)$/i;

function isPublicPath(pathname: string) {
  return publicPaths.has(pathname)
    || pathname.startsWith("/@")
    || pathname.startsWith("/node_modules/.vite/")
    || (!pathname.startsWith("/api/") && assetPattern.test(pathname));
}

function expectsJson(session: Session) {
  return session.pathname.startsWith("/api/")
    || String(session.client.req?.headers.accept ?? "").includes("application/json");
}

function safeReturnTo(value: unknown) {
  const path = typeof value === "string" ? value.trim() : "";
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") ? path : "/";
}

function readString(input: Record<string, unknown>, key: string) {
  return typeof input[key] === "string" ? String(input[key]).trim() : "";
}

function respondError(session: Session, status: number, error: string) {
  session.status = status;
  session.respond({ error }, "json");
}

export async function apply(ctx: Context, pluginConfig: AuthConfig) {
  const users = ctx.component.user as UserService;
  const enabled = pluginConfig?.loginEnabled !== false;
  const registrationEnabled = pluginConfig?.registrationEnabled !== false;

  ctx.i18n({ auth: { config: {
    loginEnabled: { zh: "允许账号密码登录", en: "Enable password login" },
    registrationEnabled: { zh: "允许公开注册", en: "Allow public registration" }
  } } });

  const service: AuthService = {
    enabled: () => enabled,
    registrationEnabled: () => enabled && registrationEnabled,
    current: (session) => users.current(session)
  };
  ctx.registerComponent("auth", service);

  ctx.route("/api/auth/configuration").methods("GET").action((session) => {
    session.respond({ loginEnabled: enabled, registrationEnabled: enabled && registrationEnabled }, "json");
  });

  ctx.route("/api/auth/login").methods("POST").action(async (session) => {
    if (!enabled) return respondError(session, 404, "Password login is disabled");
    let body: Record<string, unknown>;
    try {
      body = await session.parseRequestBody() as Record<string, unknown>;
    } catch {
      return respondError(session, 400, "Invalid request body");
    }
    const identifier = readString(body, "identifier");
    const password = typeof body.password === "string" ? body.password : "";
    if (!identifier || !password) return respondError(session, 400, "Identifier and password are required");
    const user = await users.authenticate(identifier, password);
    if (!user) return respondError(session, 401, "Invalid credentials");
    await users.establishSession(session, user);
    session.respond({ user: publicUser(user), returnTo: safeReturnTo(body.returnTo) }, "json");
  });

  ctx.route("/api/auth/register").methods("POST").action(async (session) => {
    if (!enabled || !registrationEnabled) return respondError(session, 403, "Registration is disabled");
    let body: Record<string, unknown>;
    try {
      body = await session.parseRequestBody() as Record<string, unknown>;
    } catch {
      return respondError(session, 400, "Invalid request body");
    }
    const username = readString(body, "username");
    const email = readString(body, "email").toLowerCase();
    const password = typeof body.password === "string" ? body.password : "";
    if (username.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || password.length < 12) {
      return respondError(session, 400, "Use a valid email, a username of at least 2 characters, and a password of at least 12 characters");
    }
    try {
      const user = await users.register({ username, email, password });
      await users.establishSession(session, user);
      session.status = 201;
      session.respond({ user: publicUser(user), returnTo: safeReturnTo(body.returnTo) }, "json");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create account";
      respondError(session, 409, message);
    }
  });

  ctx.route("/api/auth/logout").methods("POST").action(async (session) => {
    await users.revokeSession(session);
    session.respond({ ok: true }, "json");
  });

  ctx.use("auth-gate", async (session, next) => {
    if (isPublicPath(session.pathname)) return next();
    const current = await users.current(session);
    if (current) session.properties.user = current;
    if (current) return next();

    if (expectsJson(session)) {
      return respondError(session, 401, "Authentication is required");
    }
    session.status = 302;
    session.head.location = `/login?returnTo=${encodeURIComponent(session.pathname)}`;
    session.respond("", "plain");
  });

  ctx.component.dashboard.addEntry({
    id: "auth",
    dev: new URL("../frontend/index.tsx", import.meta.url).pathname,
    prod: new URL("./frontend/auth.js", import.meta.url).pathname,
    plugin: "auth"
  });
}

export function publicUser(user: User) {
  const { password_hash: _passwordHash, ...safe } = user as User & { password_hash?: string };
  return safe;
}
