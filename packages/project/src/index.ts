import { Context, Schema, Session } from "yumeri";
import { fileURLToPath } from "node:url";
import type { User } from "@mirelia/user";
import type { Tenant, TenantService } from "@mirelia/tenant";
import "@mirelia/database-core";
import "@mirelia/dashboard";
import "@mirelia/user";
import "@mirelia/tenant";

export type ProjectFieldType = "text" | "number" | "boolean" | "date" | "url" | "select";

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

declare module "@yumerijs/types" {
  interface Tables {
    projects: Project;
    project_field_groups: ProjectFieldGroup;
    project_fields: ProjectField;
    project_field_values: ProjectFieldValue;
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

  const service: ProjectService = {
    list: (tenantId) => db.select("projects", { tenant_id: tenantId, status: "active" }) as Promise<Project[]>,
    find: (tenantId, id) => db.selectOne("projects", { tenant_id: tenantId, id }) as Promise<Project | undefined>,
  };
  ctx.registerComponent("project", service);

  async function scope(session: Session) {
    const user = await users.current(session);
    const tenant = user ? await tenants.current(session) : undefined;
    return user?.id && tenant?.id ? { user, tenant } : undefined;
  }

  async function requireProject(session: Session, id: string): Promise<
    { user: User; tenant: Tenant; project: Project } | { error: string }
  > {
    const current = await scope(session);
    const projectId = Number(id);
    if (!current) return { error: "Authorization is required" as const };
    if (!Number.isInteger(projectId) || projectId < 1) return { error: "Project not found" as const };
    const project = await service.find(current.tenant.id!, projectId);
    return project ? { ...current, project } : { error: "Project not found" as const };
  }

  async function canManageFields(userId: number, tenant: Tenant) {
    return tenant.id ? tenants.canAccess(userId, tenant.id, "admin") : false;
  }

  async function fieldGroups(tenantId: number, projectId: number) {
    const groups = await db.select("project_field_groups", { tenant_id: tenantId }) as ProjectFieldGroup[];
    const output = [];
    for (const group of groups.sort((a, b) => a.sort_order - b.sort_order || a.id! - b.id!)) {
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
    session.respond({ projects: await service.list(current.tenant.id!) }, "json");
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
      session.status = 201;
      session.respond({ project }, "json");
    } catch (error) {
      return respondError(session, 400, error instanceof Error ? error.message : "Invalid project");
    }
  });

  ctx.route("/api/projects/:id").methods("GET").action(async (session, _query, id) => {
    const result = await requireProject(session, id);
    if ("error" in result) return respondError(session, result.error === "Authorization is required" ? 401 : 404, result.error);
    const groups = await fieldGroups(result.tenant.id!, result.project.id!);
    session.respond({ project: result.project, fieldGroups: groups }, "json");
  });

  ctx.route("/api/projects/:id").methods("PUT").action(async (session, _query, id) => {
    const result = await requireProject(session, id);
    if ("error" in result) return respondError(session, result.error === "Authorization is required" ? 401 : 404, result.error);
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

  ctx.route("/api/project-field-groups").methods("POST").action(async (session) => {
    const current = await scope(session);
    if (!current) return respondError(session, 401, "Authorization is required");
    if (!await canManageFields(current.user.id!, current.tenant)) return respondError(session, 403, "Tenant admin access is required to manage project fields");
    try {
      const body = record(await session.parseRequestBody());
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
      const requestedKey = typeof body.key === "string" ? body.key.trim().toLowerCase() : "";
      const key = requestedKey || slugify(name).replace(/-/g, "_");
      if (!name || !/^[a-z][a-z0-9_-]{1,62}$/.test(key)) return respondError(session, 400, "Provide a group name and a key with at least 2 valid characters");
      if (await db.selectOne("project_field_groups", { tenant_id: current.tenant.id, key })) return respondError(session, 409, "A field group with this key already exists");
      const now = new Date().toISOString();
      const group = await db.create("project_field_groups", {
        tenant_id: current.tenant.id!, key, name, sort_order: 0, created_at: now, updated_at: now,
      });
      session.status = 201;
      session.respond({ group }, "json");
    } catch (error) {
      return respondError(session, 400, error instanceof Error ? error.message : "Invalid field group");
    }
  });

  ctx.route("/api/project-field-groups/:groupId/fields").methods("POST").action(async (session, _query, groupId) => {
    const current = await scope(session);
    if (!current) return respondError(session, 401, "Authorization is required");
    if (!await canManageFields(current.user.id!, current.tenant)) return respondError(session, 403, "Tenant admin access is required to manage project fields");
    const group = await db.selectOne("project_field_groups", { id: Number(groupId), tenant_id: current.tenant.id }) as ProjectFieldGroup | undefined;
    if (!group) return respondError(session, 404, "Field group not found");
    try {
      const body = record(await session.parseRequestBody());
      const label = typeof body.label === "string" ? body.label.trim().slice(0, 100) : "";
      const requestedKey = typeof body.key === "string" ? body.key.trim().toLowerCase() : "";
      const key = requestedKey || slugify(label).replace(/-/g, "_");
      const type = body.type as ProjectFieldType;
      const types: ProjectFieldType[] = ["text", "number", "boolean", "date", "url", "select"];
      const options = Array.isArray(body.options) ? body.options.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 50) : [];
      if (!label || !/^[a-z][a-z0-9_]{1,62}$/.test(key) || !types.includes(type)) return respondError(session, 400, "Provide a field label, key, and valid type");
      if (type === "select" && !options.length) return respondError(session, 400, "Select fields require at least one option");
      if (await db.selectOne("project_fields", { group_id: group.id, key })) return respondError(session, 409, "A field with this key already exists in the group");
      const now = new Date().toISOString();
      const field = await db.create("project_fields", {
        group_id: group.id!, key, label, type, required: body.required === true,
        options_json: JSON.stringify(options), sort_order: 0, created_at: now, updated_at: now,
      });
      session.status = 201;
      session.respond({ field: { ...field, options } }, "json");
    } catch (error) {
      return respondError(session, 400, error instanceof Error ? error.message : "Invalid project field");
    }
  });

  ctx.route("/api/projects/:id/fields").methods("PUT").action(async (session, _query, id) => {
    const result = await requireProject(session, id);
    if ("error" in result) return respondError(session, result.error === "Authorization is required" ? 401 : 404, result.error);
    try {
      const body = record(await session.parseRequestBody());
      const values = record(body.values);
      const groups = await db.select("project_field_groups", { tenant_id: result.tenant.id }) as ProjectFieldGroup[];
      const groupIds = groups.map((group) => group.id!);
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
