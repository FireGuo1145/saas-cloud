import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Context, Logger, Schema, Session } from "yumeri";
import bcrypt from "bcryptjs";
import "@mirelia/database-core";
import "@mirelia/dashboard";
import type { User, UserSession, PublicUser } from "./types.js";

export type { User, UserSession, PublicUser } from "./types.js";

declare module "@yumerijs/types" {
  interface Tables {
    users: User;
    user_sessions: UserSession;
  }
}

export const depend = ["database", "dashboard"];
export const provide = ["user"];
export const sessionCookieName = "mirelia_session";
const logger = new Logger("user");

const sessionLifetimeSeconds = 60 * 60 * 24 * 14;
const bcryptRounds = 12;

export interface RegisterUserInput {
  username: string;
  email: string;
  password: string;
}

export interface UserConfig {
  adminUsername: string;
  adminEmail: string;
  adminPassword: string;
}

export interface UserService {
  authenticate(identifier: string, password: string): Promise<User | undefined>;
  register(input: RegisterUserInput): Promise<User>;
  current(session: Session): Promise<User | undefined>;
  establishSession(session: Session, user: User): Promise<{ token: string; expiresAt: Date }>;
  revokeSession(session: Session): Promise<void>;
  findById(id: number): Promise<User | undefined>;
  findByIdentifier(identifier: string): Promise<User | undefined>;
  update(id: number, data: Partial<Pick<User, "username" | "email" | "avatar_url">>): Promise<User | undefined>;
  require(session: Session): User | undefined;
}

declare module "yumeri" {
  interface Components {
    user: UserService;
  }
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeUsername(value: string) {
  return value.trim();
}

function validEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validPassword(value: string) {
  const bytes = Buffer.byteLength(value, "utf8");
  return value.length >= 12 && bytes <= 72;
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function tokensFrom(session: Session) {
  const authorization = String(session.client.req?.headers.authorization ?? "").trim();
  const parts = authorization.split(/\s+/);
  const bearer = parts.length === 2 && parts[0].toLowerCase() === "bearer" ? parts[1] : "";
  const cookie = String(session.cookie?.[sessionCookieName] ?? "");
  return [...new Set([bearer, cookie].filter(Boolean))];
}

function publicUser(user: User): PublicUser {
  const { password_hash: _passwordHash, ...safe } = user;
  return safe;
}

export const config: Schema<UserConfig> = Schema.object({
  adminUsername: Schema.string("管理员用户名，留空时不创建初始管理员").key("user.adminUsername").default(""),
  adminEmail: Schema.string("管理员邮箱，留空时使用用户名加 @localhost").key("user.adminEmail").default(""),
  adminPassword: Schema.string("管理员密码，至少 12 个字符").key("user.adminPassword").default(""),
});

export async function apply(ctx: Context, pluginConfig: UserConfig = { adminUsername: "", adminEmail: "", adminPassword: "" }) {
  ctx.i18n({ cloud: { account: {
    nav: { account: { zh: "账户", en: "Account", ja: "アカウント" } },
    title: { zh: "账户", en: "Account", ja: "アカウント" },
    home: { zh: "账户首页", en: "Account home", ja: "アカウントホーム" },
    welcome: { zh: "欢迎，{username}", en: "Welcome, {username}", ja: "ようこそ、{username} さん" },
    overview: { zh: "账户与工作区概览。", en: "Your account and workspace overview.", ja: "アカウントとワークスペースの概要です。" },
    profile: { zh: "账户资料", en: "Account profile", ja: "アカウントプロフィール" },
    manageIdentity: { zh: "管理账户身份信息。", en: "Manage your account identity.", ja: "アカウント情報を管理します。" },
    manageAccount: { zh: "管理账户", en: "Manage account", ja: "アカウントを管理" },
    projects: { zh: "项目", en: "Projects", ja: "プロジェクト" },
    projectsDescription: { zh: "打开并管理云项目。", en: "Open and manage your cloud projects.", ja: "クラウドプロジェクトを開いて管理します。" },
    goToProjects: { zh: "前往项目", en: "Go to projects", ja: "プロジェクトへ" },
    profileDescription: { zh: "管理账户身份信息。", en: "Manage your account identity.", ja: "アカウント情報を管理します。" },
    username: { zh: "用户名", en: "Username", ja: "ユーザー名" },
    email: { zh: "邮箱", en: "Email", ja: "メールアドレス" },
    saved: { zh: "账户资料已保存。", en: "Account details saved.", ja: "アカウント情報を保存しました。" },
    saveFailed: { zh: "无法保存账户资料。", en: "Could not save account details.", ja: "アカウント情報を保存できませんでした。" },
    errors: {
      authRequired: { zh: "请先登录", en: "Authentication is required", ja: "ログインしてください" },
      invalidRequest: { zh: "请求内容无效", en: "Invalid request", ja: "リクエスト内容が無効です" },
      accountExists: { zh: "用户名或邮箱已被使用", en: "The username or email is already in use", ja: "ユーザー名またはメールアドレスはすでに使用されています" },
    },
  } } });
  ctx.component.dashboard.addEntry({
    id: "user",
    dev: fileURLToPath(new URL("../frontend/index.tsx", import.meta.url)),
    prod: fileURLToPath(new URL("../dist/frontend/user.js", import.meta.url)),
    plugin: "user",
  });

  const db = ctx.component.database;
  await db.extend("users", {
    id: { type: "integer", autoIncrement: true },
    username: { type: "string", nullable: false },
    email: { type: "string", nullable: false },
    password_hash: { type: "string", nullable: false },
    email_verified: { type: "boolean", initial: false, nullable: false },
    avatar_url: { type: "string", initial: "", nullable: false },
    is_admin: { type: "boolean", initial: false, nullable: false },
    created_at: { type: "timestamp", nullable: false },
    updated_at: { type: "timestamp", nullable: false },
  }, { unique: ["username", "email"] });
  await db.extend("user_sessions", {
    id: { type: "integer", autoIncrement: true },
    user_id: { type: "integer", nullable: false },
    token_hash: { type: "string", nullable: false },
    expires_at: { type: "timestamp", nullable: false },
    last_seen_at: { type: "timestamp", nullable: false },
    revoked_at: "timestamp",
    created_at: { type: "timestamp", nullable: false },
  }, { unique: ["token_hash"] });

  const adminUsername = normalizeUsername(pluginConfig.adminUsername ?? "");
  const adminPassword = pluginConfig.adminPassword ?? "";
  const adminEmail = normalizeEmail(pluginConfig.adminEmail || `${adminUsername}@localhost.localdomain`);
  if (adminUsername || adminPassword || pluginConfig.adminEmail) {
    if (!/^[\p{L}\p{N}_.-]{3,32}$/u.test(adminUsername)) throw new Error("user.adminUsername must be 3-32 letters, numbers, dots, underscores, or hyphens");
    if (!validEmail(adminEmail)) throw new Error("user.adminEmail must be a valid email address");
    if (!validPassword(adminPassword)) throw new Error("user.adminPassword must be 12-72 UTF-8 bytes");

    const byUsername = await db.selectOne("users", { username: adminUsername }) as User | undefined;
    const byEmail = await db.selectOne("users", { email: adminEmail }) as User | undefined;
    if (byUsername && byEmail && byUsername.id !== byEmail.id) {
      throw new Error("Configured administrator username and email belong to different accounts");
    }
    const existing = byUsername ?? byEmail;
    const now = new Date().toISOString();
    const passwordMatches = existing ? await bcrypt.compare(adminPassword, existing.password_hash) : false;
    if (existing) {
      if (existing.id === undefined) throw new Error("Configured administrator has an invalid account id");
      await db.update("users", { id: existing.id }, {
        username: adminUsername,
        email: adminEmail,
        password_hash: passwordMatches ? existing.password_hash : await bcrypt.hash(adminPassword, bcryptRounds),
        is_admin: true,
        email_verified: true,
        updated_at: now,
      });
      if (!passwordMatches) {
        await db.update("user_sessions", { user_id: existing.id, revoked_at: null }, { revoked_at: now });
      }
      logger.info(`Administrator account "${adminUsername}" synchronized from user configuration`);
    } else {
      const administrator = await db.create("users", {
        username: adminUsername,
        email: adminEmail,
        password_hash: await bcrypt.hash(adminPassword, bcryptRounds),
        email_verified: true,
        avatar_url: "",
        is_admin: true,
        created_at: now,
        updated_at: now,
      });
      await ctx.emit("user:registered", administrator);
      logger.info(`Administrator account "${adminUsername}" created from user configuration`);
    }
  }

  const service: UserService = {
    async authenticate(identifier, password) {
      const normalized = identifier.trim();
      if (!normalized || !password) return undefined;
      const user = await db.selectOne("users", {
        $or: [{ username: normalized }, { email: normalizeEmail(normalized) }],
      });
      if (!user || !(await bcrypt.compare(password, user.password_hash))) return undefined;
      return user;
    },

    async register(input) {
      const username = normalizeUsername(String(input.username ?? ""));
      const email = normalizeEmail(String(input.email ?? ""));
      const password = String(input.password ?? "");
      if (!/^[\p{L}\p{N}_.-]{3,32}$/u.test(username)) throw new Error("invalid_username");
      if (!validEmail(email)) throw new Error("invalid_email");
      if (!validPassword(password)) throw new Error("invalid_password");
      if (await db.selectOne("users", { $or: [{ username }, { email }] })) throw new Error("account_exists");
      const now = new Date().toISOString();
      const user = await db.create("users", {
        username,
        email,
        password_hash: await bcrypt.hash(password, bcryptRounds),
        email_verified: false,
        avatar_url: "",
        is_admin: false,
        created_at: now,
        updated_at: now,
      });
      await ctx.emit("user:registered", user);
      return user;
    },

    findById: (id) => db.selectOne("users", { id }),

    findByIdentifier(identifier) {
      const normalized = identifier.trim();
      return db.selectOne("users", {
        $or: [{ username: normalized }, { email: normalizeEmail(normalized) }],
      });
    },

    async update(id, input) {
      const updates: Partial<User> = {};
      if (typeof input.username === "string") {
        const username = normalizeUsername(input.username);
        if (!/^[\p{L}\p{N}_.-]{3,32}$/u.test(username)) throw new Error("invalid_username");
        const duplicate = await db.selectOne("users", { username });
        if (duplicate && duplicate.id !== id) throw new Error("account_exists");
        updates.username = username;
      }
      if (typeof input.email === "string") {
        const email = normalizeEmail(input.email);
        if (!validEmail(email)) throw new Error("invalid_email");
        const duplicate = await db.selectOne("users", { email });
        if (duplicate && duplicate.id !== id) throw new Error("account_exists");
        updates.email = email;
      }
      if (typeof input.avatar_url === "string") updates.avatar_url = input.avatar_url.trim().slice(0, 500);
      if (Object.keys(updates).length) {
        updates.updated_at = new Date().toISOString();
        await db.update("users", { id }, updates);
      }
      return db.selectOne("users", { id });
    },

    async establishSession(session, user) {
      if (user.id === undefined) throw new Error("user_required");
      const token = randomBytes(32).toString("base64url");
      const now = new Date();
      const expiresAt = new Date(now.getTime() + sessionLifetimeSeconds * 1000);
      await db.create("user_sessions", {
        user_id: user.id,
        token_hash: tokenHash(token),
        expires_at: expiresAt.toISOString(),
        last_seen_at: now.toISOString(),
        revoked_at: null,
        created_at: now.toISOString(),
      });
      session.setCookie(sessionCookieName, token, {
        httpOnly: true,
        sameSite: "Lax",
        secure: session.protocol === "https",
        path: "/",
        expires: expiresAt,
      });
      return { token, expiresAt };
    },

    async revokeSession(session) {
      const now = new Date().toISOString();
      for (const token of tokensFrom(session)) {
        await db.update("user_sessions", { token_hash: tokenHash(token), revoked_at: null }, { revoked_at: now });
      }
      session.setCookie(sessionCookieName, "", {
        httpOnly: true,
        sameSite: "Lax",
        secure: session.protocol === "https",
        path: "/",
        expires: new Date(0),
      });
      delete session.properties.user;
    },

    async current(session) {
      const cached = session.properties.user as User | undefined;
      if (cached) return cached;
      for (const token of tokensFrom(session)) {
        const record = await db.selectOne("user_sessions", {
          token_hash: tokenHash(token),
          revoked_at: null,
        }) as UserSession | undefined;
        if (!record || new Date(record.expires_at).getTime() <= Date.now()) continue;
        const user = await db.selectOne("users", { id: record.user_id });
        if (!user) continue;
        if (Date.now() - new Date(record.last_seen_at).getTime() > 5 * 60_000) {
          void db.update("user_sessions", { id: record.id }, { last_seen_at: new Date().toISOString() });
        }
        session.properties.user = user;
        return user;
      }
      return undefined;
    },

    require(session) {
      const user = session.properties.user as User | undefined;
      if (user) return user;
      session.status = 401;
      session.respond({ error: session.text("cloud.account.errors.authRequired") }, "json");
      return undefined;
    },
  };

  ctx.registerComponent("user", service);
  ctx.use("user-context", async (session: Session, next) => {
    const current = await service.current(session);
    if (current) session.properties.user = current;
    await next();
  });

  ctx.route("/api/user/me").methods("GET", "PUT").action(async (session) => {
    const current = service.require(session);
    if (!current) return;
    if ((session.client.req?.method ?? "GET").toUpperCase() === "GET") {
      session.respond(publicUser(current), "json");
      return;
    }
    try {
      const input = await session.parseRequestBody() as Record<string, unknown>;
      const updated = await service.update(current.id!, {
        username: typeof input.username === "string" ? input.username : undefined,
        email: typeof input.email === "string" ? input.email : undefined,
        avatar_url: typeof input.avatar_url === "string" ? input.avatar_url : undefined,
      });
      session.respond(updated ? publicUser(updated) : publicUser(current), "json");
    } catch (error) {
      const code = error instanceof Error ? error.message : "invalid_request";
      session.status = code === "account_exists" ? 409 : 400;
      const message = code === "account_exists"
        ? session.text("cloud.account.errors.accountExists")
        : session.text("cloud.account.errors.invalidRequest");
      session.respond({ error: message }, "json");
    }
  });

  ctx.setInterval(() => {
    void db.remove("user_sessions", { expires_at: { $lte: new Date().toISOString() } }).catch(() => undefined);
  }, 60 * 60 * 1000);
}

export default apply;
