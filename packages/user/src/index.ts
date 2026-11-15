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

/** Account row as returned by the administration endpoints. */
export interface AdminUserView {
  id: number;
  username: string;
  email: string;
  is_admin: boolean;
  email_verified: boolean;
  created_at: string;
}

export interface UserConfig {
  adminUsername: string;
  adminEmail: string;
  adminPassword: string;
  /**
   * Accounts that are site administrators, by username. The configured bootstrap
   * administrator is always included; databases created before the list existed
   * fall back to the stored `is_admin` column.
   */
  admins: string[];
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
  /* Site administration */
  isAdmin(user: User): boolean;
  /** Resolve the signed-in user and require site administrator rights. */
  requireAdmin(session: Session): Promise<User | undefined>;
  list(): Promise<AdminUserView[]>;
  setAdmin(id: number, isAdmin: boolean): Promise<User | undefined>;
}

/** The subset other plugins rely on through `ctx.component.user`. */
export type SessionUserService = Pick<UserService, "current" | "findById" | "isAdmin" | "requireAdmin" | "list" | "setAdmin">;

declare module "yumeri" {
  interface Components {
    user: SessionUserService;
  }
}

function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

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
  admins: Schema.array(Schema.string("站点管理员用户名"), "站点管理员列表（用户名），启动时同步")
    .key("user.admins").default([]),
});

export async function apply(ctx: Context, pluginConfig: UserConfig = { adminUsername: "", adminEmail: "", adminPassword: "", admins: [] }) {
  ctx.i18n({ cloud: { home: {
    greeting: { zh: "你好，{username}", en: "Hello, {username}", ja: "こんにちは、{username} さん" },
    subtitle: { zh: "从这里进入项目、实例、商城与账单。", en: "Jump into your projects, instances, store and billing.", ja: "プロジェクト、インスタンス、ストア、請求へ移動します。" },
    balance: { zh: "账户余额", en: "Account balance", ja: "アカウント残高" },
    balanceHint: { zh: "余额用于购买商城商品与充值实例。", en: "The balance pays for store purchases and instances.", ja: "残高はストアの購入やインスタンスに使われます。" },
    topUp: { zh: "充值", en: "Add funds", ja: "チャージ" },
    projects: { zh: "项目", en: "Projects", ja: "プロジェクト" },
    projectsHint: { zh: "整理并管理你的云资源。", en: "Organise and manage your cloud resources.", ja: "クラウドリソースを整理・管理します。" },
    openProjects: { zh: "打开项目列表", en: "Open projects", ja: "プロジェクト一覧を開く" },
    instances: { zh: "我的实例", en: "Instances", ja: "インスタンス" },
    instancesHint: { zh: "启动、停止并连接已分配的服务器。", en: "Start, stop and connect your servers.", ja: "割り当てられたサーバーの起動・停止・接続を行います。" },
    store: { zh: "商城", en: "Store", ja: "ストア" },
    storeHint: { zh: "购买云服务器与实例。", en: "Buy cloud servers and instances.", ja: "クラウドサーバーやインスタンスを購入します。" },
    orders: { zh: "我的订单", en: "Orders", ja: "注文履歴" },
    ordersHint: { zh: "查看购买记录与交付状态。", en: "Review purchases and delivery state.", ja: "購入履歴と提供状況を確認します。" },
    quickLinks: { zh: "快捷入口", en: "Quick links", ja: "クイックリンク" },
    administration: { zh: "站点管理", en: "Administration", ja: "サイト管理" },
    administrationHint: { zh: "用户、充值确认与实例规格。", en: "Users, payment review and instance specifications.", ja: "ユーザー、入金確認、インスタンス仕様。" },
    memberSince: { zh: "注册于", en: "Member since", ja: "登録日" },
  }, account: {
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
      adminRequired: { zh: "需要站点管理员权限", en: "Site administrator permission is required", ja: "サイト管理者の権限が必要です" },
    },
    admin: {
      nav: { section: { zh: "站点管理", en: "Administration", ja: "サイト管理" }, users: { zh: "用户", en: "Users", ja: "ユーザー" } },
      usersTitle: { zh: "站点用户", en: "Site users", ja: "サイトユーザー" },
      usersDescription: { zh: "查看全部账户并授予或撤销站点管理员权限。", en: "Review every account and grant or revoke site administrator rights.", ja: "すべてのアカウントを確認し、サイト管理者権限を付与・解除します。" },
      administrator: { zh: "管理员", en: "Administrator", ja: "管理者" },
      member: { zh: "普通用户", en: "User", ja: "一般ユーザー" },
      grant: { zh: "设为管理员", en: "Make administrator", ja: "管理者にする" },
      revoke: { zh: "撤销管理员", en: "Revoke administrator", ja: "管理者権限を解除" },
      registered: { zh: "注册于", en: "Joined", ja: "登録日" },
      searchUsers: { zh: "搜索用户", en: "Search users", ja: "ユーザーを検索" },
      onlyAdmins: { zh: "仅显示管理员", en: "Administrators only", ja: "管理者のみ" },
      empty: { zh: "没有匹配的用户", en: "No matching users", ja: "該当するユーザーはいません" },
      self: { zh: "你", en: "You", ja: "あなた" },
      errors: {
        keepAdmin: { zh: "站点至少需要保留一位管理员", en: "The site must keep at least one administrator", ja: "サイトには少なくとも 1 名の管理者が必要です" },
        protectedAdmin: { zh: "内置管理员权限不能撤销", en: "The bootstrap administrator cannot be demoted", ja: "初期管理者の権限は解除できません" },
        usersLoad: { zh: "无法加载用户列表", en: "Could not load users", ja: "ユーザー一覧を読み込めませんでした" },
      },
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

  let adminUserId: number | undefined;
  /** Usernames configured as administrators; the source of truth for administration rights. */
  const configuredAdmins = new Set<string>();
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
      adminUserId = existing.id;
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
      adminUserId = administrator.id;
      await ctx.emit("user:registered", administrator);
      logger.info(`Administrator account "${adminUsername}" created from user configuration`);
    }
  }

  const listedAdmins = Array.isArray(pluginConfig.admins) ? pluginConfig.admins : [];
  for (const entry of listedAdmins) {
    const username = normalizeUsername(String(entry ?? ""));
    if (!username) continue;
    configuredAdmins.add(username.toLowerCase());
  }
  // Without an explicit list the bootstrap administrator is the only administrator.
  if (!listedAdmins.some((entry) => normalizeUsername(String(entry ?? ""))) && adminUsername) configuredAdmins.add(adminUsername.toLowerCase());
  logger.info(`Site administrators in configuration: ${[...configuredAdmins].join(", ") || "(none)"}`);
  // Mirror the configured list into the stored flag so both stay consistent.
  for (const account of await db.select("users", {}) as User[]) {
    if (account.id === undefined) continue;
    const configured = configuredAdmins.has(normalizeUsername(account.username).toLowerCase());
    if (configured === Boolean(account.is_admin)) continue;
    await db.update("users", { id: account.id }, { is_admin: configured, updated_at: new Date().toISOString() });
    logger.info(`Administrator rights ${configured ? "granted to" : "revoked from"} "${account.username}" from configuration`);
  }
  if (configuredAdmins.size) logger.info(`Site administrators: ${[...configuredAdmins].join(", ")}`);

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

    isAdmin(user) {
      if (user.id === undefined) return false;
      // The configuration is authoritative: `user.admins` decides who administers the
      // site, so removing the bootstrap account from it really revokes its rights.
      if (configuredAdmins.size) return configuredAdmins.has(normalizeUsername(user.username).toLowerCase());
      if (adminUserId !== undefined && user.id === adminUserId) return true;
      // Databases created before `user.admins` existed keep working from the stored flag.
      return Boolean(user.is_admin);
    },

    async requireAdmin(session) {
      const user = await service.current(session);
      if (!user) { session.status = 401; session.respond({ error: session.text("cloud.account.errors.authRequired") }, "json"); return undefined; }
      if (!service.isAdmin(user)) { session.status = 403; session.respond({ error: session.text("cloud.account.errors.adminRequired") }, "json"); return undefined; }
      return user;
    },

    async list() {
      const users = await db.select("users", {}) as User[];
      return users.sort((a, b) => (b.id ?? 0) - (a.id ?? 0)).map((user) => ({
        id: user.id!, username: user.username, email: user.email,
        is_admin: service.isAdmin(user), email_verified: Boolean(user.email_verified),
        created_at: user.created_at,
      }));
    },

    async setAdmin(id, next) {
      const target = await db.selectOne("users", { id }) as User | undefined;
      if (!target?.id) return undefined;
      const username = normalizeUsername(target.username);
      // Without a configured list the UI still works, but the change only lives in the
      // database; with a list, the panel edits it and the file keeps the last word.
      if (!next) {
        if (adminUserId !== undefined && target.id === adminUserId && !configuredAdmins.size) throw new Error("protected_admin");
        const remaining = (await db.select("users", {}) as User[]).filter((user) => user.id !== id && service.isAdmin(user));
        if (!remaining.length) throw new Error("keep_admin");
      }
      await db.update("users", { id }, { is_admin: next, updated_at: new Date().toISOString() });
      if (next) configuredAdmins.add(username.toLowerCase());
      else configuredAdmins.delete(username.toLowerCase());
      return db.selectOne("users", { id });
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
      // `is_admin` is stored as 0/1 by SQL drivers; clients rely on a boolean.
      session.respond({ ...publicUser(current), is_admin: service.isAdmin(current), email_verified: Boolean(current.email_verified) }, "json");
      return;
    }
    try {
      const input = await session.parseRequestBody() as Record<string, unknown>;
      const updated = await service.update(current.id!, {
        username: typeof input.username === "string" ? input.username : undefined,
        email: typeof input.email === "string" ? input.email : undefined,
        avatar_url: typeof input.avatar_url === "string" ? input.avatar_url : undefined,
      });
      const result = updated ?? current;
      session.respond({ ...publicUser(result), is_admin: service.isAdmin(result), email_verified: Boolean(result.email_verified) }, "json");
    } catch (error) {
      const code = error instanceof Error ? error.message : "invalid_request";
      session.status = code === "account_exists" ? 409 : 400;
      const message = code === "account_exists"
        ? session.text("cloud.account.errors.accountExists")
        : session.text("cloud.account.errors.invalidRequest");
      session.respond({ error: message }, "json");
    }
  });

  ctx.route("/api/admin/users").methods("GET").action(async (session) => {
    if (!await service.requireAdmin(session)) return;
    session.respond({ users: await service.list() }, "json");
  });
  /** Create accounts from the administration panel; registration policy does not apply. */
  ctx.route("/api/admin/users").methods("POST").action(async (session) => {
    const operator = await service.requireAdmin(session);
    if (!operator) return;
    const body = object(await session.parseRequestBody());
    try {
      const created = await service.register({
        username: String(body.username ?? ""),
        email: String(body.email ?? ""),
        password: String(body.password ?? ""),
      });
      if (body.isAdmin === true) await service.setAdmin(created.id!, true);
      logger.info(`Administrator ${operator.username} created account ${created.username}`);
      session.status = 201;
      session.respond({ id: created.id, username: created.username, email: created.email, is_admin: body.isAdmin === true }, "json");
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      session.status = code === "account_exists" ? 409 : 400;
      session.respond({ error: session.text(code === "account_exists" ? "cloud.account.errors.accountExists" : "cloud.account.errors.invalidRequest") }, "json");
    }
  });
  ctx.route("/api/admin/users/:id/admin").methods("PUT").action(async (session, _query, id) => {
    const operator = await service.requireAdmin(session);
    if (!operator) return;
    const body = object(await session.parseRequestBody());
    const userId = Number(id);
    if (!Number.isSafeInteger(userId) || userId < 1 || typeof body.isAdmin !== "boolean") {
      session.status = 400; session.respond({ error: session.text("cloud.account.errors.invalidRequest") }, "json"); return;
    }
    try {
      const updated = await service.setAdmin(userId, body.isAdmin);
      if (!updated) { session.status = 404; session.respond({ error: session.text("cloud.account.errors.invalidRequest") }, "json"); return; }
      session.respond({ id: updated.id, is_admin: service.isAdmin(updated) }, "json");
      logger.info(`Administrator ${operator.username} ${body.isAdmin ? "granted" : "revoked"} administrator rights for ${updated.username}`);
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      session.status = 400;
      session.respond({ error: session.text(code === "keep_admin" ? "cloud.account.admin.errors.keepAdmin" : "cloud.account.admin.errors.protectedAdmin") }, "json");
    }
  });

  ctx.setInterval(() => {
    void db.remove("user_sessions", { expires_at: { $lte: new Date().toISOString() } }).catch(() => undefined);
  }, 60 * 60 * 1000);
}

export default apply;
