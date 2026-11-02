import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Context, Schema, Session } from "yumeri";
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

const sessionLifetimeSeconds = 60 * 60 * 24 * 14;
const bcryptRounds = 12;

export interface RegisterUserInput {
  username: string;
  email: string;
  password: string;
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

export const config: Schema<Record<string, never>> = Schema.object({});

export async function apply(ctx: Context) {
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
      session.respond({ error: "authentication_required" }, "json");
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
      session.respond({ error: code }, "json");
    }
  });

  ctx.setInterval(() => {
    void db.remove("user_sessions", { expires_at: { $lte: new Date().toISOString() } }).catch(() => undefined);
  }, 60 * 60 * 1000);
}

export default apply;
