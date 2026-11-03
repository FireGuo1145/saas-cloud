import { Context, Schema, Session } from "yumeri";
import { fileURLToPath } from "node:url";
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

  ctx.i18n({ cloud: { auth: {
    loginTitle: { zh: "登录", en: "Sign in", ja: "ログイン" },
    loginDescription: { zh: "访问你的 Mirelia 账户。", en: "Access your Mirelia account.", ja: "Mirelia アカウントにアクセスします。" },
    identifier: { zh: "邮箱或用户名", en: "Email or username", ja: "メールアドレスまたはユーザー名" },
    password: { zh: "密码", en: "Password", ja: "パスワード" },
    login: { zh: "登录", en: "Sign in", ja: "ログイン" },
    loggingIn: { zh: "正在登录…", en: "Signing in…", ja: "ログイン中…" },
    loginUnavailable: { zh: "密码登录当前不可用。", en: "Password login is unavailable.", ja: "パスワードログインは現在利用できません。" },
    newHere: { zh: "还没有账户？", en: "New here?", ja: "初めてですか？" },
    createAccount: { zh: "创建账户", en: "Create an account", ja: "アカウントを作成" },
    registerTitle: { zh: "创建账户", en: "Create an account", ja: "アカウントを作成" },
    registerDescription: { zh: "创建你的 Mirelia 账户。", en: "Set up your Mirelia account.", ja: "Mirelia アカウントを作成します。" },
    username: { zh: "用户名", en: "Username", ja: "ユーザー名" },
    email: { zh: "邮箱", en: "Email", ja: "メールアドレス" },
    registering: { zh: "正在创建账户…", en: "Creating account…", ja: "アカウントを作成中…" },
    alreadyRegistered: { zh: "已有账户？", en: "Already registered?", ja: "すでに登録済みですか？" },
    signIn: { zh: "登录", en: "Sign in", ja: "ログイン" },
    errors: {
      loginDisabled: { zh: "密码登录已关闭", en: "Password login is disabled", ja: "パスワードログインは無効です" },
      invalidBody: { zh: "请求内容无效", en: "Invalid request body", ja: "リクエスト内容が無効です" },
      required: { zh: "请输入邮箱/用户名和密码", en: "Identifier and password are required", ja: "メールアドレスまたはユーザー名とパスワードを入力してください" },
      credentials: { zh: "账号或密码错误", en: "Invalid credentials", ja: "認証情報が正しくありません" },
      registrationDisabled: { zh: "注册已关闭", en: "Registration is disabled", ja: "登録は無効です" },
      invalidRegistration: { zh: "请输入有效邮箱、至少 2 个字符的用户名和至少 12 位密码", en: "Use a valid email, a username of at least 2 characters, and a password of at least 12 characters", ja: "有効なメールアドレス、2 文字以上のユーザー名、12 文字以上のパスワードを入力してください" },
      createAccountFailed: { zh: "无法创建账户", en: "Could not create account", ja: "アカウントを作成できませんでした" },
      authRequired: { zh: "请先登录", en: "Authentication is required", ja: "ログインしてください" },
    },
    config: {
      loginEnabled: { zh: "允许账号密码登录", en: "Enable password login", ja: "パスワードログインを有効にする" },
      registrationEnabled: { zh: "允许公开注册", en: "Allow public registration", ja: "公開登録を許可する" },
  } } } });

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
    if (!enabled) return respondError(session, 404, session.text("cloud.auth.errors.loginDisabled"));
    let body: Record<string, unknown>;
    try {
      body = await session.parseRequestBody() as Record<string, unknown>;
    } catch {
      return respondError(session, 400, session.text("cloud.auth.errors.invalidBody"));
    }
    const identifier = readString(body, "identifier");
    const password = typeof body.password === "string" ? body.password : "";
    if (!identifier || !password) return respondError(session, 400, session.text("cloud.auth.errors.required"));
    const user = await users.authenticate(identifier, password);
    if (!user) return respondError(session, 401, session.text("cloud.auth.errors.credentials"));
    await users.establishSession(session, user);
    session.respond({ user: publicUser(user), returnTo: safeReturnTo(body.returnTo) }, "json");
  });

  ctx.route("/api/auth/register").methods("POST").action(async (session) => {
    if (!enabled || !registrationEnabled) return respondError(session, 403, session.text("cloud.auth.errors.registrationDisabled"));
    let body: Record<string, unknown>;
    try {
      body = await session.parseRequestBody() as Record<string, unknown>;
    } catch {
      return respondError(session, 400, session.text("cloud.auth.errors.invalidBody"));
    }
    const username = readString(body, "username");
    const email = readString(body, "email").toLowerCase();
    const password = typeof body.password === "string" ? body.password : "";
    if (username.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || password.length < 12) {
      return respondError(session, 400, session.text("cloud.auth.errors.invalidRegistration"));
    }
    try {
      const user = await users.register({ username, email, password });
      await users.establishSession(session, user);
      session.status = 201;
      session.respond({ user: publicUser(user), returnTo: safeReturnTo(body.returnTo) }, "json");
    } catch (error) {
      const message = session.text("cloud.auth.errors.createAccountFailed");
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
      return respondError(session, 401, session.text("cloud.auth.errors.authRequired"));
    }
    session.status = 302;
    session.head.location = `/login?returnTo=${encodeURIComponent(session.pathname)}`;
    session.respond("", "plain");
  });

  ctx.component.dashboard.addEntry({
    id: "auth",
    dev: fileURLToPath(new URL("../frontend/index.tsx", import.meta.url)),
    prod: fileURLToPath(new URL("../dist/frontend/auth.js", import.meta.url)),
    plugin: "auth"
  });
}

export function publicUser(user: User) {
  const { password_hash: _passwordHash, ...safe } = user as User & { password_hash?: string };
  return safe;
}
