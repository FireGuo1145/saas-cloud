import { Context, Schema, Session } from "yumeri";
import type { User } from "@mirelia/user";
import "@mirelia/database-core";
import "@mirelia/dashboard";

export interface Tenant {
  id?: number;
  slug: string;
  name: string;
  owner_user_id: number;
  status: "active" | "suspended";
  created_at?: string;
  updated_at?: string;
}

export interface TenantMembership {
  id?: number;
  tenant_id: number;
  user_id: number;
  role: "owner" | "admin" | "member";
  created_at?: string;
  updated_at?: string;
}

declare module "@yumerijs/types" {
  interface Tables {
    tenants: Tenant;
    tenant_memberships: TenantMembership;
  }
}

export const depend = ["database", "dashboard", "user"];
export const provide = ["tenant"];

export interface UserService {
  current(session: Session): Promise<User | undefined>;
  findById(id: number): Promise<User | undefined>;
}

export interface TenantService {
  current(session: Session): Promise<Tenant | undefined>;
  findById(id: number): Promise<Tenant | undefined>;
  listForUser(userId: number): Promise<Tenant[]>;
  createForUser(userId: number, data: { name: string; slug: string }): Promise<Tenant>;
  canAccess(userId: number, tenantId: number, minimumRole?: TenantMembership["role"]): Promise<boolean>;
}

declare module "yumeri" {
  interface Components {
    tenant: TenantService;
  }
}

export const config = Schema.object({
  defaultTenantName: Schema.string("新用户默认租户名称").key("tenant.defaultTenantName").default("个人空间"),
});

const roleRank: Record<TenantMembership["role"], number> = {
  member: 10,
  admin: 50,
  owner: 100,
};

function requestedTenantId(session: Session) {
  const value = session.client.req?.headers["x-tenant-id"];
  if (value === undefined) return { provided: false, id: undefined };
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return { provided: true, id: Number.isInteger(parsed) && parsed > 0 ? parsed : undefined };
}

export async function apply(ctx: Context, pluginConfig: { defaultTenantName?: string } = {}) {
  const db = ctx.component.database;
  const users = ctx.component.user as UserService;

  await db.extend("tenants", {
    id: { type: "integer", autoIncrement: true },
    slug: { type: "string", nullable: false },
    name: { type: "string", nullable: false },
    owner_user_id: { type: "integer", nullable: false },
    status: { type: "string", initial: "active" },
    created_at: "timestamp",
    updated_at: "timestamp",
  }, { unique: ["slug"] });
  await db.extend("tenant_memberships", {
    id: { type: "integer", autoIncrement: true },
    tenant_id: { type: "integer", nullable: false },
    user_id: { type: "integer", nullable: false },
    role: { type: "string", initial: "member" },
    created_at: "timestamp",
    updated_at: "timestamp",
  }, { unique: [["tenant_id", "user_id"]] });

  const service: TenantService = {
    findById: (id) => db.selectOne("tenants", { id }) as Promise<Tenant | undefined>,
    listForUser: async (userId) => {
      const memberships = await db.select("tenant_memberships", { user_id: userId });
      const tenants = await Promise.all(memberships.map((membership) => service.findById(membership.tenant_id)));
      return tenants.filter((tenant): tenant is Tenant => Boolean(tenant));
    },
    createForUser: async (userId, data) => {
      if (!await users.findById(userId)) throw new Error("User not found");
      const name = data.name.trim();
      const slug = data.slug.trim().toLowerCase();
      if (!name || !/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug)) {
        throw new Error("A tenant name and valid slug are required");
      }
      const now = new Date().toISOString();
      const tenant = await db.create("tenants", {
        slug,
        name,
        owner_user_id: userId,
        status: "active",
        created_at: now,
        updated_at: now,
      }) as Tenant;
      await db.create("tenant_memberships", {
        tenant_id: tenant.id,
        user_id: userId,
        role: "owner",
        created_at: now,
        updated_at: now,
      });
      return tenant;
    },
    canAccess: async (userId, tenantId, minimumRole = "member") => {
      const membership = await db.selectOne("tenant_memberships", { user_id: userId, tenant_id: tenantId }) as TenantMembership | undefined;
      if (!membership) return false;
      return roleRank[membership.role] >= roleRank[minimumRole];
    },
    current: async (session) => {
      const user = await users.current(session);
      if (!user?.id) return undefined;
      const selection = requestedTenantId(session);
      if (selection.provided) {
        if (!selection.id || !await service.canAccess(user.id, selection.id)) return undefined;
        const selected = await service.findById(selection.id);
        return selected?.status === "active" ? selected : undefined;
      }
      return (await service.listForUser(user.id))[0];
    },
  };

  ctx.registerComponent("tenant", service);
  ctx.on("user:registered", async (user: User) => {
    if (user.id === undefined || (await service.listForUser(user.id)).length) return;
    const now = new Date().toISOString();
    const tenant = await db.create("tenants", {
      slug: `user-${user.id}`,
      name: `${user.username}'s workspace`,
      owner_user_id: user.id,
      status: "active",
      created_at: now,
      updated_at: now,
    });
    await db.create("tenant_memberships", {
      tenant_id: tenant.id,
      user_id: user.id,
      role: "owner",
      created_at: now,
      updated_at: now,
    });
  });
  ctx.i18n({ tenant: {
    config: { defaultTenantName: { zh: "新用户默认租户名称", en: "Default tenant name", ja: "新規ユーザーのデフォルトテナント名" } },
  } });

  ctx.route("/api/tenant/current").methods("GET").action(async (session: Session) => {
    if (!await users.current(session)) {
      session.status = 401;
      session.respond({ error: "Authorization is required" }, "json");
      return;
    }
    const tenant = await service.current(session);
    if (!tenant) {
      session.status = 404;
      session.respond({ error: "Tenant not found" }, "json");
      return;
    }
    session.respond({ tenant }, "json");
  });

  ctx.route("/api/tenants").methods("GET").action(async (session: Session) => {
    const user = await users.current(session);
    if (!user?.id) {
      session.status = 401;
      session.respond({ error: "Authorization is required" }, "json");
      return;
    }
    session.respond({ tenants: await service.listForUser(user.id) }, "json");
  });
  ctx.route("/api/tenants").methods("POST").action(async (session: Session) => {
    const user = await users.current(session);
    if (!user?.id) {
      session.status = 401;
      session.respond({ error: "Authorization is required" }, "json");
      return;
    }
    try {
      const body = await session.parseRequestBody() as { name?: unknown; slug?: unknown };
      const tenant = await service.createForUser(user.id, { name: String(body.name ?? ""), slug: String(body.slug ?? "") });
      session.status = 201;
      session.respond({ tenant }, "json");
    } catch (error) {
      session.status = 400;
      session.respond({ error: error instanceof Error ? error.message : "Invalid tenant" }, "json");
    }
  });
}

export default apply;
