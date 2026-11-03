import { Context, Schema, Session } from "yumeri";
import { fileURLToPath } from "node:url";
import type { User } from "@mirelia/user";
import type { Tenant, TenantService } from "@mirelia/tenant";
import "@mirelia/database-core";
import "@mirelia/dashboard";
import "@mirelia/user";
import "@mirelia/tenant";

export type ProjectFieldType = "text" | "number" | "boolean" | "date" | "url" | "select";
const projectFieldTypes: ProjectFieldType[] = ["text", "number", "boolean", "date", "url", "select"];

export interface Project {
  id?: number;
  tenant_id: number;
  project_id: string;
  name: string;
  description: string;
  status: "active" | "archived";
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectFieldGroup {
  id?: number;
  tenant_id: number;
  plugin_id?: string;
  key: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectField {
  id?: number;
  group_id: number;
  key: string;
  label: string;
  type: ProjectFieldType;
  required: boolean;
  options_json: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectFieldValue {
  id?: number;
  project_id: number;
  field_id: number;
  value_json: string;
  updated_by: number;
  updated_at: string;
}

export type ProjectPermission = "view" | "edit" | "manage_members" | "manage_fields";
export interface ProjectMember {
  id?: number;
  project_id: number;
  user_id: number;
  permissions_json: string;
  added_by: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectFieldDefinition {
  key: string;
  label: string;
  type: ProjectFieldType;
  required?: boolean;
  options?: string[];
}

export interface ProjectFieldGroupDefinition {
  key: string;
  name: string;
  fields: ProjectFieldDefinition[];
}

declare module "@yumerijs/types" {
  interface Tables {
    projects: Project;
    project_field_groups: ProjectFieldGroup;
    project_fields: ProjectField;
    project_field_values: ProjectFieldValue;
    project_members: ProjectMember;
  }
}

export const depend = ["database", "dashboard", "user", "tenant"];
export const provide = ["project"];
export const config: Schema<Record<string, never>> = Schema.object({});

declare module "yumeri" {
  interface Components { project: ProjectService; }
}

export interface ProjectService {
  list(tenantId: number): Promise<Project[]>;
  find(tenantId: number, projectId: number): Promise<Project | undefined>;
  registerFieldGroup(pluginId: string, definition: ProjectFieldGroupDefinition): Promise<void>;
}

function respondError(session: Session, status: number, error: string) {
  session.status = status;
  session.respond({ error }, "json");
}

function slugify(value: string) {
  return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63);
}

function validProjectId(value: string) {
  return /^[a-z][a-z0-9-]{1,61}[a-z0-9]$/.test(value);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function apply(ctx: Context) {
  const db = ctx.component.database;
  const tenants = ctx.component.tenant as TenantService;
  const users = ctx.component.user as { current(session: Session): Promise<User | undefined> };

  await db.extend("projects", {
    id: { type: "integer", autoIncrement: true },
    tenant_id: { type: "integer", nullable: false },
    project_id: { type: "string", nullable: false },
    name: { type: "string", nullable: false },
    description: { type: "text", initial: "", nullable: false },
    status: { type: "string", initial: "active", nullable: false },
    created_by: { type: "integer", nullable: false },
    created_at: { type: "timestamp", nullable: false },
    updated_at: { type: "timestamp", nullable: false },
  }, { unique: [["tenant_id", "project_id"]] });
  await db.extend("project_field_groups", {
    id: { type: "integer", autoIncrement: true },
    tenant_id: { type: "integer", nullable: false },
    plugin_id: { type: "string", nullable: true },
    key: { type: "string", nullable: false },
    name: { type: "string", nullable: false },
    sort_order: { type: "integer", initial: 0, nullable: false },
    created_at: { type: "timestamp", nullable: false },
    updated_at: { type: "timestamp", nullable: false },
  }, { unique: [["tenant_id", "key"]] });
  await db.extend("project_fields", {
    id: { type: "integer", autoIncrement: true },
    group_id: { type: "integer", nullable: false },
    key: { type: "string", nullable: false },
    label: { type: "string", nullable: false },
    type: { type: "string", initial: "text", nullable: false },
    required: { type: "boolean", initial: false, nullable: false },
    options_json: { type: "text", initial: "[]", nullable: false },
    sort_order: { type: "integer", initial: 0, nullable: false },
    created_at: { type: "timestamp", nullable: false },
    updated_at: { type: "timestamp", nullable: false },
  }, { unique: [["group_id", "key"]] });
  await db.extend("project_field_values", {
    id: { type: "integer", autoIncrement: true },
    project_id: { type: "integer", nullable: false },
    field_id: { type: "integer", nullable: false },
    value_json: { type: "text", initial: "null", nullable: false },
    updated_by: { type: "integer", nullable: false },
    updated_at: { type: "timestamp", nullable: false },
  }, { unique: [["project_id", "field_id"]] });
  await db.extend("project_members", {
    id: { type: "integer", autoIncrement: true },
    project_id: { type: "integer", nullable: false },
    user_id: { type: "integer", nullable: false },
    permissions_json: { type: "text", nullable: false },
    added_by: { type: "integer", nullable: false },
    created_at: { type: "timestamp", nullable: false },
    updated_at: { type: "timestamp", nullable: false },
  }, { unique: [["project_id", "user_id"]] });

  const allPermissions: ProjectPermission[] = ["view", "edit", "manage_members", "manage_fields"];
  for (const project of await db.select("projects", {})) {
    if (project.id === undefined || project.created_by === undefined) continue;
    if (await db.selectOne("project_members", { project_id: project.id, user_id: project.created_by })) continue;
    const now = new Date().toISOString();
    await db.create("project_members", {
      project_id: project.id,
      user_id: project.created_by,
      permissions_json: JSON.stringify(allPermissions),
      added_by: project.created_by,
      created_at: now,
      updated_at: now,
    });
  }

  const service: ProjectService = {
    list: async (tenantId) => db.select("projects", { tenant_id: tenantId, status: "active" }) as Promise<Project[]>,
    find: (tenantId, id) => db.selectOne("projects", { tenant_id: tenantId, id }) as Promise<Project | undefined>,
    async registerFieldGroup(pluginId, definition) {
      const source = pluginId.trim();
      const key = definition.key.trim().toLowerCase();
      const name = definition.name.trim().slice(0, 100);
      if (!source || !/^[a-z][a-z0-9_-]{1,62}$/.test(key) || !name) throw new Error("Invalid plugin project field group");
      if (!Array.isArray(definition.fields)) throw new Error("Invalid plugin project field group");
      const pluginKey = slugify(source).replace(/-/g, "_");
      if (!pluginKey) throw new Error("Invalid project field plugin id");
      const groupKey = `${pluginKey}__${key}`;
      if (groupKey.length > 100) throw new Error("Invalid plugin project field group");
      const normalizedFields = definition.fields.map((field) => {
        const fieldKey = field.key.trim().toLowerCase();
        const label = field.label.trim().slice(0, 100);
        const options = Array.isArray(field.options) ? field.options.map((option) => option.trim()).filter(Boolean).slice(0, 50) : [];
        if (!/^[a-z][a-z0-9_]{1,62}$/.test(fieldKey) || !projectFieldTypes.includes(field.type) || !label) throw new Error(`Invalid project field definition: ${field.key}`);
        if (field.type === "select" && !options.length) throw new Error(`Select field ${fieldKey} requires options`);
        return { key: fieldKey, label, type: field.type, required: field.required === true, options };
      });
      if (new Set(normalizedFields.map((field) => field.key)).size !== normalizedFields.length) throw new Error("Duplicate project field keys in plugin definition");
      let group = await db.selectOne("project_field_groups", { tenant_id: 0, key: groupKey }) as ProjectFieldGroup | undefined;
      const now = new Date().toISOString();
      if (!group) {
        group = await db.create("project_field_groups", {
          tenant_id: 0, plugin_id: source, key: groupKey, name, sort_order: 0, created_at: now, updated_at: now,
        }) as ProjectFieldGroup;
      } else {
        const existingPlugin = group.plugin_id;
        if (existingPlugin && existingPlugin !== source) throw new Error(`Project field group key is already registered by ${existingPlugin}`);
        await db.update("project_field_groups", { id: group.id }, { plugin_id: source, name, updated_at: now });
      }
      const fields = await db.select("project_fields", { group_id: group.id }) as ProjectField[];
      const existing = new Map(fields.map((field) => [field.key, field]));
      const seen = new Set<string>();
      for (const field of normalizedFields) {
        seen.add(field.key);
        const data = {
          group_id: group.id!, key: field.key, label: field.label, type: field.type,
          required: field.required, options_json: JSON.stringify(field.options), sort_order: seen.size - 1, updated_at: now,
        };
        const current = existing.get(field.key);
        if (current) await db.update("project_fields", { id: current.id }, data);
        else await db.create("project_fields", { ...data, created_at: now });
      }
    },
  };
  ctx.registerComponent("project", service);

  async function scope(session: Session) {
    const user = await users.current(session);
    const tenant = user ? await tenants.current(session) : undefined;
    return user?.id && tenant?.id ? { user, tenant } : undefined;
  }

  async function permissionsFor(project: Project, user: User, tenant: Tenant): Promise<ProjectPermission[]> {
    if (user.id === project.created_by || user.id && tenant.id && await tenants.canAccess(user.id, tenant.id, "admin")) return allPermissions;
    const member = await db.selectOne("project_members", { project_id: project.id, user_id: user.id }) as ProjectMember | undefined;
    try {
      const permissions = member ? JSON.parse(member.permissions_json) : [];
      return Array.isArray(permissions) ? permissions.filter((permission): permission is ProjectPermission => allPermissions.includes(permission)) : [];
    } catch { return []; }
  }

  async function requireProject(session: Session, id: string, permission: ProjectPermission = "view"): Promise<
    { user: User; tenant: Tenant; project: Project; permissions: ProjectPermission[] } | { error: string; status: number }
  > {
    const user = await users.current(session);
    const projectId = Number(id);
    if (!user?.id) return { error: "Authorization is required", status: 401 };
    if (!Number.isInteger(projectId) || projectId < 1) return { error: "Project not found", status: 404 };
    const project = await db.selectOne("projects", { id: projectId, status: "active" }) as Project | undefined;
    if (!project) return { error: "Project not found", status: 404 };
    const tenant = await tenants.findById(project.tenant_id);
    if (!tenant || tenant.status !== "active" || !await tenants.canAccess(user.id, tenant.id!)) return { error: "Project not found", status: 404 };
    const permissions = await permissionsFor(project, user, tenant);
    if (!permissions.includes(permission)) return { error: "You do not have permission to access this project", status: 403 };
    return { user, tenant, project, permissions };
  }

  async function fieldGroups(tenantId: number, projectId: number) {
    const groups = await db.select("project_field_groups", { $or: [{ tenant_id: 0 }, { tenant_id: tenantId }] }) as ProjectFieldGroup[];
    const output = [];
    for (const group of groups.filter((group) => group.plugin_id).sort((a, b) => a.sort_order - b.sort_order || a.id! - b.id!)) {
      const fields = await db.select("project_fields", { group_id: group.id }) as ProjectField[];
      const values = await db.select("project_field_values", { project_id: projectId }) as ProjectFieldValue[];
      output.push({
        ...group,
        fields: fields.sort((a, b) => a.sort_order - b.sort_order || a.id! - b.id!).map((field) => {
          const stored = values.find((value) => value.field_id === field.id);
          let value: unknown = null;
          try { value = stored ? JSON.parse(stored.value_json) : null; } catch { value = null; }
          return { ...field, options: JSON.parse(field.options_json || "[]") as string[], value };
        }),
      });
    }
    return output;
  }

  ctx.route("/api/projects").methods("GET").action(async (session) => {
    const current = await scope(session);
    if (!current) return respondError(session, 401, "Authorization is required");
    const userTenants = await tenants.listForUser(current.user.id!);
    const visible = [];
    const seen = new Set<number>();
    for (const tenant of userTenants) {
      if (!tenant.id || tenant.status !== "active") continue;
      for (const project of await service.list(tenant.id)) {
        if (project.id === undefined || seen.has(project.id)) continue;
        const permissions = await permissionsFor(project, current.user, tenant);
        if (permissions.includes("view")) { visible.push(project); seen.add(project.id); }
      }
    }
    session.respond({ projects: visible }, "json");
  });

  ctx.route("/api/projects").methods("POST").action(async (session) => {
    const current = await scope(session);
    if (!current) return respondError(session, 401, "Authorization is required");
    try {
      const body = record(await session.parseRequestBody());
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
      const description = typeof body.description === "string" ? body.description.trim().slice(0, 2000) : "";
      if (!name) return respondError(session, 400, "Project name is required");
      let baseId = typeof body.projectId === "string" && body.projectId.trim() ? body.projectId.trim().toLowerCase() : slugify(name);
      if (!baseId) baseId = "project";
      if (!validProjectId(baseId)) return respondError(session, 400, "Project ID must be 3-63 lowercase letters, numbers, or hyphens and start with a letter");
      let projectId = baseId;
      let suffix = 2;
      while (await db.selectOne("projects", { tenant_id: current.tenant.id, project_id: projectId })) {
        const tail = `-${suffix++}`;
        projectId = `${baseId.slice(0, 63 - tail.length)}${tail}`;
      }
      const now = new Date().toISOString();
      const project = await db.create("projects", {
        tenant_id: current.tenant.id!,
        project_id: projectId,
        name,
        description,
        status: "active",
        created_by: current.user.id!,
        created_at: now,
        updated_at: now,
      });
      await db.create("project_members", {
        project_id: project.id!,
        user_id: current.user.id!,
        permissions_json: JSON.stringify(allPermissions),
        added_by: current.user.id!,
        created_at: now,
        updated_at: now,
      });
      session.status = 201;
      session.respond({ project }, "json");
    } catch (error) {
      return respondError(session, 400, error instanceof Error ? error.message : "Invalid project");
    }
  });

  ctx.route("/api/projects/:id").methods("GET").action(async (session, _query, id) => {
    const result = await requireProject(session, id);
    if ("error" in result) return respondError(session, result.status, result.error);
    const groups = await fieldGroups(result.tenant.id!, result.project.id!);
    session.respond({ project: result.project, fieldGroups: groups, permissions: result.permissions }, "json");
  });

  ctx.route("/api/projects/:id").methods("PUT").action(async (session, _query, id) => {
    const result = await requireProject(session, id, "edit");
    if ("error" in result) return respondError(session, result.status, result.error);
    try {
      const body = record(await session.parseRequestBody());
      const updates: Partial<Project> = {};
      if (typeof body.name === "string") {
        const name = body.name.trim().slice(0, 120);
        if (!name) return respondError(session, 400, "Project name is required");
        updates.name = name;
      }
      if (typeof body.description === "string") updates.description = body.description.trim().slice(0, 2000);
      if (body.status === "active" || body.status === "archived") updates.status = body.status;
      if (!Object.keys(updates).length) return respondError(session, 400, "No project fields to update");
      updates.updated_at = new Date().toISOString();
      await db.update("projects", { id: result.project.id, tenant_id: result.tenant.id }, updates);
      session.respond({ project: await service.find(result.tenant.id!, result.project.id!) }, "json");
    } catch (error) {
      return respondError(session, 400, error instanceof Error ? error.message : "Invalid project update");
    }
  });

  ctx.route("/api/projects/:id/members").methods("GET").action(async (session, _query, id) => {
    const result = await requireProject(session, id, "view");
    if ("error" in result) return respondError(session, result.status, result.error);
    const canManage = result.permissions.includes("manage_members");
    const memberships = await db.select("project_members", { project_id: result.project.id }) as ProjectMember[];
    const members = [];
    for (const membership of memberships) {
      const user = await db.selectOne("users", { id: membership.user_id }) as User | undefined;
      if (!user) continue;
      let permissions: ProjectPermission[] = [];
      try {
        const parsed = JSON.parse(membership.permissions_json);
        if (Array.isArray(parsed)) permissions = parsed.filter((permission): permission is ProjectPermission => allPermissions.includes(permission));
      } catch { /* Invalid stored permissions are treated as no access. */ }
      members.push({ id: user.id, username: user.username, email: user.email, permissions, isOwner: user.id === result.project.created_by });
    }
    const tenantMembers = canManage ? await db.select("tenant_memberships", { tenant_id: result.tenant.id }) as Array<{ user_id: number }> : [];
    const existingIds = new Set(memberships.map((membership) => membership.user_id));
    const availableUsers = [];
    for (const tenantMember of tenantMembers) {
      if (existingIds.has(tenantMember.user_id)) continue;
      const user = await db.selectOne("users", { id: tenantMember.user_id }) as User | undefined;
      if (user?.id !== undefined) availableUsers.push({ id: user.id, username: user.username, email: user.email });
    }
    session.respond({ members, availableUsers, permissions: allPermissions, canManage }, "json");
  });

  ctx.route("/api/projects/:id/members").methods("POST").action(async (session, _query, id) => {
    const result = await requireProject(session, id, "manage_members");
    if ("error" in result) return respondError(session, result.status, result.error);
    try {
      const body = record(await session.parseRequestBody());
      const userId = Number(body.userId);
      const permissions = Array.isArray(body.permissions) ? body.permissions.filter((permission): permission is ProjectPermission => allPermissions.includes(permission as ProjectPermission)) : ["view"];
      if (!Number.isInteger(userId) || userId < 1) return respondError(session, 400, "Choose a valid tenant user");
      const tenantMembership = await db.selectOne("tenant_memberships", { tenant_id: result.tenant.id, user_id: userId });
      const user = tenantMembership ? await db.selectOne("users", { id: userId }) as User | undefined : undefined;
      if (!user) return respondError(session, 404, "User is not a member of this workspace");
      if (await db.selectOne("project_members", { project_id: result.project.id, user_id: userId })) return respondError(session, 409, "User is already a project member");
      const now = new Date().toISOString();
      await db.create("project_members", {
        project_id: result.project.id!, user_id: userId,
        permissions_json: JSON.stringify(permissions.includes("view") ? permissions : [...permissions, "view"]),
        added_by: result.user.id!, created_at: now, updated_at: now,
      });
      session.status = 201;
      session.respond({ member: { id: user.id, username: user.username, email: user.email, permissions: permissions.includes("view") ? permissions : [...permissions, "view"], isOwner: false } }, "json");
    } catch (error) {
      return respondError(session, 400, error instanceof Error ? error.message : "Invalid project member");
    }
  });

  ctx.route("/api/projects/:id/members/:userId").methods("PUT").action(async (session, _query, id, userId) => {
    const result = await requireProject(session, id, "manage_members");
    if ("error" in result) return respondError(session, result.status, result.error);
    const targetId = Number(userId);
    const member = await db.selectOne("project_members", { project_id: result.project.id, user_id: targetId }) as ProjectMember | undefined;
    if (!member) return respondError(session, 404, "Project member not found");
    if (targetId === result.project.created_by) return respondError(session, 400, "Project owner permissions cannot be changed");
    const targetUser = await db.selectOne("users", { id: targetId }) as User | undefined;
    if (!targetUser) return respondError(session, 404, "Project member not found");
    try {
      const body = record(await session.parseRequestBody());
      if (!Array.isArray(body.permissions) || body.permissions.some((permission) => !allPermissions.includes(permission as ProjectPermission))) return respondError(session, 400, "Invalid project permissions");
      const permissions = [...new Set(body.permissions as ProjectPermission[])];
      if (!permissions.includes("view")) permissions.push("view");
      const existingPermissions = await permissionsFor(result.project, targetUser, result.tenant);
      if (existingPermissions.includes("manage_members") && !permissions.includes("manage_members")) {
        const projectMembers = await db.select("project_members", { project_id: result.project.id }) as ProjectMember[];
        let managerCount = 0;
        for (const projectMember of projectMembers) {
          if (projectMember.user_id === targetId) continue;
          const otherUser = await db.selectOne("users", { id: projectMember.user_id }) as User | undefined;
          if (otherUser && (await permissionsFor(result.project, otherUser, result.tenant)).includes("manage_members")) managerCount++;
        }
        if (!managerCount) return respondError(session, 400, "A project must keep at least one member manager");
      }
      await db.update("project_members", { id: member.id }, { permissions_json: JSON.stringify(permissions), updated_at: new Date().toISOString() });
      session.respond({ userId: targetId, permissions }, "json");
    } catch (error) {
      return respondError(session, 400, error instanceof Error ? error.message : "Invalid project permissions");
    }
  });

  ctx.route("/api/projects/:id/members/:userId").methods("DELETE").action(async (session, _query, id, userId) => {
    const result = await requireProject(session, id, "manage_members");
    if ("error" in result) return respondError(session, result.status, result.error);
    const targetId = Number(userId);
    if (targetId === result.project.created_by) return respondError(session, 400, "Project owner cannot be removed");
    const member = await db.selectOne("project_members", { project_id: result.project.id, user_id: targetId }) as ProjectMember | undefined;
    if (!member) return respondError(session, 404, "Project member not found");
    const targetUser = await db.selectOne("users", { id: targetId }) as User | undefined;
    if (targetUser && (await permissionsFor(result.project, targetUser, result.tenant)).includes("manage_members")) {
      const projectMembers = await db.select("project_members", { project_id: result.project.id }) as ProjectMember[];
      let managerCount = 0;
      for (const projectMember of projectMembers) {
        if (projectMember.user_id === targetId) continue;
        const otherUser = await db.selectOne("users", { id: projectMember.user_id }) as User | undefined;
        if (otherUser && (await permissionsFor(result.project, otherUser, result.tenant)).includes("manage_members")) managerCount++;
      }
      if (!managerCount) return respondError(session, 400, "A project must keep at least one member manager");
    }
    await db.remove("project_members", { id: member.id });
    session.respond({ success: true }, "json");
  });

  ctx.route("/api/projects/:id/fields").methods("PUT").action(async (session, _query, id) => {
    const result = await requireProject(session, id, "manage_fields");
    if ("error" in result) return respondError(session, result.status, result.error);
    try {
      const body = record(await session.parseRequestBody());
      const values = record(body.values);
      const groups = await db.select("project_field_groups", { $or: [{ tenant_id: 0 }, { tenant_id: result.tenant.id }] }) as ProjectFieldGroup[];
      const pluginGroups = groups.filter((group) => group.plugin_id);
      const groupIds = pluginGroups.map((group) => group.id!);
      const definitions: ProjectField[] = [];
      for (const groupId of groupIds) definitions.push(...await db.select("project_fields", { group_id: groupId }) as ProjectField[]);
      const allowed = new Map(definitions.map((field) => [String(field.id), field]));
      for (const field of definitions) {
        const fieldValue = values[String(field.id)];
        if (field.required && (fieldValue === undefined || fieldValue === null || fieldValue === "")) {
          return respondError(session, 400, `Field ${field.key} is required`);
        }
      }
      const now = new Date().toISOString();
      for (const [rawId, value] of Object.entries(values)) {
        const field = allowed.get(rawId);
        if (!field || field.id === undefined) return respondError(session, 400, "Unknown project field");
        const options = JSON.parse(field.options_json || "[]") as string[];
        const valid = value === null || value === ""
          ? !field.required
          : field.type === "text" || field.type === "date" || field.type === "url" ? typeof value === "string"
            : field.type === "number" ? typeof value === "number" && Number.isFinite(value)
              : field.type === "boolean" ? typeof value === "boolean"
                : field.type === "select" ? typeof value === "string" && options.includes(value) : false;
        if (!valid) return respondError(session, 400, `Invalid value for field ${field.key}`);
        await db.upsert("project_field_values", [{
          project_id: result.project.id!, field_id: field.id, value_json: JSON.stringify(value),
          updated_by: result.user.id!, updated_at: now,
        }], ["project_id", "field_id"]);
      }
      session.respond({ fieldGroups: await fieldGroups(result.tenant.id!, result.project.id!) }, "json");
    } catch (error) {
      return respondError(session, 400, error instanceof Error ? error.message : "Invalid field values");
    }
  });

  ctx.component.dashboard.addEntry({
    id: "project",
    dev: fileURLToPath(new URL("../frontend/index.tsx", import.meta.url)),
    prod: fileURLToPath(new URL("../dist/frontend/project.js", import.meta.url)),
    plugin: "project",
  });
}

export default apply;
