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

export type ProjectPermission = "view" | "edit" | "manage_members" | "manage_fields" | "manage_products";
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

export interface ProjectAccess {
  user: User;
  tenant: Tenant;
  project: Project;
  permissions: ProjectPermission[];
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
  authorize(session: Session, projectId: number | string, permission?: ProjectPermission): Promise<ProjectAccess | undefined>;
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
  ctx.i18n({ cloud: { project: {
    nav: {
      projects: { zh: "项目", en: "Projects", ja: "プロジェクト" },
      overview: { zh: "概览", en: "Overview", ja: "概要" },
      settings: { zh: "设置", en: "Settings", ja: "設定" },
      members: { zh: "成员", en: "Members", ja: "メンバー" },
      servers: { zh: "云服务器", en: "Cloud servers", ja: "クラウドサーバー" },
    },
    backToList: { zh: "返回项目列表", en: "Back to projects", ja: "プロジェクト一覧に戻る" },
    workspace: { zh: "工作区", en: "Workspace", ja: "ワークスペース" },
    manageWorkspaceProjects: { zh: "管理此工作区中的项目。", en: "Manage projects in this workspace.", ja: "このワークスペースのプロジェクトを管理します。" },
    newProject: { zh: "新建项目", en: "New project", ja: "新しいプロジェクト" },
    createProject: { zh: "创建项目", en: "Create project", ja: "プロジェクトを作成" },
    project: { zh: "项目", en: "Project", ja: "プロジェクト" },
    selectProject: { zh: "选择项目", en: "Select a project", ja: "プロジェクトを選択" },
    noProjects: { zh: "暂无项目", en: "No projects yet", ja: "プロジェクトはありません" },
    noProjectsDescription: { zh: "创建项目以整理工作区资源。", en: "Create a project to organize workspace resources.", ja: "プロジェクトを作成してワークスペースのリソースを整理します。" },
    projectDescription: { zh: "项目说明", en: "Description", ja: "説明" },
    projectName: { zh: "项目名称", en: "Project name", ja: "プロジェクト名" },
    projectId: { zh: "项目 ID", en: "Project ID", ja: "プロジェクト ID" },
    cancel: { zh: "取消", en: "Cancel", ja: "キャンセル" },
    created: { zh: "创建于", en: "Created", ja: "作成日" },
    createDescription: { zh: "项目用于整理当前工作区中的资源。", en: "Projects organize resources inside the current workspace.", ja: "プロジェクトは現在のワークスペース内のリソースを整理します。" },
    overview: { zh: "项目概览", en: "Project overview", ja: "プロジェクト概要" },
    resourceConfiguration: { zh: "项目资源与配置。", en: "Project resources and configuration.", ja: "プロジェクトのリソースと設定です。" },
    projectInformation: { zh: "项目信息", en: "Project information", ja: "プロジェクト情報" },
    identifiersActivity: { zh: "项目标识和活动信息。", en: "Identifiers and activity for this project.", ja: "プロジェクトの識別子とアクティビティです。" },
    status: { zh: "状态", en: "Status", ja: "ステータス" },
    statusValues: {
      active: { zh: "正常", en: "Active", ja: "有効" },
      archived: { zh: "已归档", en: "Archived", ja: "アーカイブ済み" },
    },
    lastUpdated: { zh: "最近更新", en: "Last updated", ja: "最終更新" },
    projectSettings: { zh: "项目设置", en: "Project settings", ja: "プロジェクト設定" },
    manageDetailsFields: { zh: "管理项目详情和扩展字段。", en: "Manage project details and extensible fields.", ja: "プロジェクトの詳細と拡張フィールドを管理します。" },
    openSettings: { zh: "打开设置", en: "Open settings", ja: "設定を開く" },
    details: { zh: "项目详情", en: "Project details", ja: "プロジェクト詳細" },
    saveProject: { zh: "保存项目", en: "Save project", ja: "プロジェクトを保存" },
    pluginFields: { zh: "插件字段", en: "Plugin fields", ja: "プラグインフィールド" },
    fieldsProvidedByPlugins: { zh: "字段由已安装的插件提供。", en: "Fields are provided by installed plugins.", ja: "フィールドはインストール済みプラグインによって提供されます。" },
    noPluginFields: { zh: "暂无插件字段", en: "No plugin fields", ja: "プラグインフィールドはありません" },
    noFieldsFromPlugin: { zh: "此插件未提供字段。", en: "No fields provided by this plugin.", ja: "このプラグインが提供するフィールドはありません。" },
    installedPluginsFields: { zh: "已安装的插件可以提供项目配置字段。", en: "Installed plugins can provide project configuration fields.", ja: "インストール済みプラグインはプロジェクト設定フィールドを提供できます。" },
    saveFields: { zh: "保存字段", en: "Save fields", ja: "フィールドを保存" },
    fieldsSaved: { zh: "项目字段已保存。", en: "Project fields saved.", ja: "プロジェクトフィールドを保存しました。" },
    detailsSaved: { zh: "项目详情已保存。", en: "Project details saved.", ja: "プロジェクト詳細を保存しました。" },
    enabled: { zh: "启用", en: "Enabled", ja: "有効" },
    disabled: { zh: "停用", en: "Disabled", ja: "無効" },
    access: { zh: "项目访问权限", en: "Project access", ja: "プロジェクトアクセス" },
    manageAccess: { zh: "管理可访问此项目的成员及其权限。", en: "Manage who can access this project and what they can do.", ja: "プロジェクトにアクセスできるメンバーとその権限を管理します。" },
    addMember: { zh: "添加成员", en: "Add member", ja: "メンバーを追加" },
    addMemberTitle: { zh: "添加项目成员", en: "Add project member", ja: "プロジェクトメンバーを追加" },
    addMemberDescription: { zh: "从此工作区选择用户并分配项目权限。", en: "Choose a user from this workspace and assign project permissions.", ja: "このワークスペースからユーザーを選び、プロジェクト権限を割り当てます。" },
    addingMember: { zh: "正在添加…", en: "Adding…", ja: "追加中…" },
    removingMember: { zh: "移除 {username}", en: "Remove {username}", ja: "{username} を削除" },
    retry: { zh: "重试", en: "Retry", ja: "再試行" },
    loadingMembers: { zh: "正在加载成员…", en: "Loading members…", ja: "メンバーを読み込み中…" },
    account: { zh: "账户", en: "Account", ja: "アカウント" },
    selectUser: { zh: "选择用户", en: "Select a user", ja: "ユーザーを選択" },
    availableAccounts: { zh: "可用账户", en: "Available accounts", ja: "利用可能なアカウント" },
    noAvailableUsers: { zh: "没有可添加的用户", en: "No available users", ja: "追加できるユーザーはいません" },
    permissions: { zh: "权限", en: "Permissions", ja: "権限" },
    noMembers: { zh: "暂无项目成员", en: "No project members", ja: "プロジェクトメンバーはいません" },
    owner: { zh: "所有者", en: "Owner", ja: "オーナー" },
    editAccess: { zh: "编辑权限", en: "Edit access", ja: "アクセス権を編集" },
    viewProject: { zh: "查看项目", en: "View project", ja: "プロジェクトを表示" },
    viewProjectDescription: { zh: "查看项目页面和详情", en: "View project pages and details", ja: "プロジェクトページと詳細を表示" },
    editProject: { zh: "编辑项目", en: "Edit project", ja: "プロジェクトを編集" },
    editProjectDescription: { zh: "修改项目名称和说明", en: "Change project name and description", ja: "プロジェクト名と説明を変更" },
    editFieldValues: { zh: "编辑字段值", en: "Edit field values", ja: "フィールド値を編集" },
    editFieldValuesDescription: { zh: "更新此项目中的自定义字段值", en: "Update custom field values in this project", ja: "このプロジェクトのカスタムフィールド値を更新" },
    manageMembers: { zh: "管理成员", en: "Manage members", ja: "メンバーを管理" },
    manageMembersDescription: { zh: "添加成员并更改其权限", en: "Add members and change their permissions", ja: "メンバーを追加して権限を変更" },
    manageProducts: { zh: "管理云产品", en: "Manage cloud products", ja: "クラウド製品を管理" },
    manageProductsDescription: { zh: "将云服务商资源关联到此项目", en: "Link cloud provider resources to this project", ja: "クラウドプロバイダーのリソースをこのプロジェクトに関連付け" },
    errors: {
      authorization: { zh: "请先登录", en: "Authorization is required", ja: "ログインしてください" },
      notFound: { zh: "项目不存在", en: "Project not found", ja: "プロジェクトが見つかりません" },
      forbidden: { zh: "你没有访问此项目的权限", en: "You do not have permission to access this project", ja: "このプロジェクトへのアクセス権がありません" },
      nameRequired: { zh: "请输入项目名称", en: "Project name is required", ja: "プロジェクト名を入力してください" },
      invalidId: { zh: "项目 ID 须为 3 至 63 个小写字母、数字或连字符，并以字母开头", en: "Project ID must be 3-63 lowercase letters, numbers, or hyphens and start with a letter", ja: "プロジェクト ID は小文字、数字、ハイフンで 3～63 文字、先頭は英字にしてください" },
      invalidProject: { zh: "项目数据无效", en: "Invalid project", ja: "プロジェクトデータが無効です" },
      noUpdates: { zh: "没有要更新的项目字段", en: "No project fields to update", ja: "更新するプロジェクト項目がありません" },
      invalidUser: { zh: "请选择有效的工作区用户", en: "Choose a valid tenant user", ja: "有効なワークスペースユーザーを選択してください" },
      workspaceUser: { zh: "该用户不是此工作区成员", en: "User is not a member of this workspace", ja: "このユーザーはワークスペースのメンバーではありません" },
      alreadyMember: { zh: "该用户已是项目成员", en: "User is already a project member", ja: "このユーザーはすでにプロジェクトメンバーです" },
      memberNotFound: { zh: "未找到项目成员", en: "Project member not found", ja: "プロジェクトメンバーが見つかりません" },
      ownerPermissions: { zh: "不能更改项目所有者的权限", en: "Project owner permissions cannot be changed", ja: "プロジェクトオーナーの権限は変更できません" },
      invalidPermissions: { zh: "项目权限无效", en: "Invalid project permissions", ja: "プロジェクト権限が無効です" },
      keepManager: { zh: "项目至少需要一位成员管理员", en: "A project must keep at least one member manager", ja: "プロジェクトには少なくとも 1 人のメンバー管理者が必要です" },
      ownerRemove: { zh: "不能移除项目所有者", en: "Project owner cannot be removed", ja: "プロジェクトオーナーは削除できません" },
      fieldRequired: { zh: "必填项目字段缺少值", en: "A required project field is missing a value", ja: "必須プロジェクトフィールドの値がありません" },
      unknownField: { zh: "项目字段无效", en: "Unknown project field", ja: "プロジェクトフィールドが不明です" },
      invalidFieldValue: { zh: "项目字段值无效", en: "Invalid project field value", ja: "プロジェクトフィールド値が無効です" },
      invalidFields: { zh: "项目字段值无效", en: "Invalid field values", ja: "プロジェクトフィールド値が無効です" },
      invalidUpdate: { zh: "项目更新无效", en: "Invalid project update", ja: "プロジェクトの更新内容が無効です" },
      membersLoad: { zh: "无法加载项目成员", en: "Project members could not be loaded.", ja: "プロジェクトメンバーを読み込めませんでした" },
      addMember: { zh: "无法添加项目成员", en: "Could not add project member.", ja: "プロジェクトメンバーを追加できませんでした" },
      memberUpdate: { zh: "无法更新成员权限", en: "Could not update member permissions.", ja: "メンバー権限を更新できませんでした" },
      memberRemove: { zh: "无法移除项目成员", en: "Could not remove project member.", ja: "プロジェクトメンバーを削除できませんでした" },
      projectLoad: { zh: "无法加载项目", en: "Project could not be loaded.", ja: "プロジェクトを読み込めませんでした" },
      projectsLoad: { zh: "无法加载项目列表", en: "Projects could not be loaded.", ja: "プロジェクト一覧を読み込めませんでした" },
      createProject: { zh: "无法创建项目", en: "Could not create project.", ja: "プロジェクトを作成できませんでした" },
      saveFields: { zh: "无法保存项目字段", en: "Could not save project fields.", ja: "プロジェクトフィールドを保存できませんでした" },
      saveDetails: { zh: "无法保存项目详情", en: "Could not save project details.", ja: "プロジェクト詳細を保存できませんでした" },
    },
  } } });
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

  const allPermissions: ProjectPermission[] = ["view", "edit", "manage_members", "manage_fields", "manage_products"];
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
    authorize: async (session, projectId, permission = "view") => {
      const result = await requireProject(session, String(projectId), permission);
      return "error" in result ? undefined : result;
    },
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
    if (!user?.id) return { error: session.text("cloud.project.errors.authorization"), status: 401 };
    if (!Number.isInteger(projectId) || projectId < 1) return { error: session.text("cloud.project.errors.notFound"), status: 404 };
    const project = await db.selectOne("projects", { id: projectId, status: "active" }) as Project | undefined;
    if (!project) return { error: session.text("cloud.project.errors.notFound"), status: 404 };
    const tenant = await tenants.findById(project.tenant_id);
    if (!tenant || tenant.status !== "active" || !await tenants.canAccess(user.id, tenant.id!)) return { error: session.text("cloud.project.errors.notFound"), status: 404 };
    const permissions = await permissionsFor(project, user, tenant);
    if (!permissions.includes(permission)) return { error: session.text("cloud.project.errors.forbidden"), status: 403 };
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
    if (!current) return respondError(session, 401, session.text("cloud.project.errors.authorization"));
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
    if (!current) return respondError(session, 401, session.text("cloud.project.errors.authorization"));
    try {
      const body = record(await session.parseRequestBody());
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
      const description = typeof body.description === "string" ? body.description.trim().slice(0, 2000) : "";
      if (!name) return respondError(session, 400, session.text("cloud.project.errors.nameRequired"));
      let baseId = typeof body.projectId === "string" && body.projectId.trim() ? body.projectId.trim().toLowerCase() : slugify(name);
      if (!baseId) baseId = "project";
      if (!validProjectId(baseId)) return respondError(session, 400, session.text("cloud.project.errors.invalidId"));
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
      return respondError(session, 400, session.text("cloud.project.errors.invalidProject"));
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
        if (!name) return respondError(session, 400, session.text("cloud.project.errors.nameRequired"));
        updates.name = name;
      }
      if (typeof body.description === "string") updates.description = body.description.trim().slice(0, 2000);
      if (body.status === "active" || body.status === "archived") updates.status = body.status;
      if (!Object.keys(updates).length) return respondError(session, 400, session.text("cloud.project.errors.noUpdates"));
      updates.updated_at = new Date().toISOString();
      await db.update("projects", { id: result.project.id, tenant_id: result.tenant.id }, updates);
      session.respond({ project: await service.find(result.tenant.id!, result.project.id!) }, "json");
    } catch (error) {
      return respondError(session, 400, session.text("cloud.project.errors.invalidUpdate"));
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
      if (!Number.isInteger(userId) || userId < 1) return respondError(session, 400, session.text("cloud.project.errors.invalidUser"));
      const tenantMembership = await db.selectOne("tenant_memberships", { tenant_id: result.tenant.id, user_id: userId });
      const user = tenantMembership ? await db.selectOne("users", { id: userId }) as User | undefined : undefined;
      if (!user) return respondError(session, 404, session.text("cloud.project.errors.workspaceUser"));
      if (await db.selectOne("project_members", { project_id: result.project.id, user_id: userId })) return respondError(session, 409, session.text("cloud.project.errors.alreadyMember"));
      const now = new Date().toISOString();
      await db.create("project_members", {
        project_id: result.project.id!, user_id: userId,
        permissions_json: JSON.stringify(permissions.includes("view") ? permissions : [...permissions, "view"]),
        added_by: result.user.id!, created_at: now, updated_at: now,
      });
      session.status = 201;
      session.respond({ member: { id: user.id, username: user.username, email: user.email, permissions: permissions.includes("view") ? permissions : [...permissions, "view"], isOwner: false } }, "json");
    } catch (error) {
      return respondError(session, 400, session.text("cloud.project.errors.invalidUser"));
    }
  });

  ctx.route("/api/projects/:id/members/:userId").methods("PUT").action(async (session, _query, id, userId) => {
    const result = await requireProject(session, id, "manage_members");
    if ("error" in result) return respondError(session, result.status, result.error);
    const targetId = Number(userId);
    const member = await db.selectOne("project_members", { project_id: result.project.id, user_id: targetId }) as ProjectMember | undefined;
    if (!member) return respondError(session, 404, session.text("cloud.project.errors.memberNotFound"));
    if (targetId === result.project.created_by) return respondError(session, 400, session.text("cloud.project.errors.ownerPermissions"));
    const targetUser = await db.selectOne("users", { id: targetId }) as User | undefined;
    if (!targetUser) return respondError(session, 404, session.text("cloud.project.errors.memberNotFound"));
    try {
      const body = record(await session.parseRequestBody());
      if (!Array.isArray(body.permissions) || body.permissions.some((permission) => !allPermissions.includes(permission as ProjectPermission))) return respondError(session, 400, session.text("cloud.project.errors.invalidPermissions"));
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
        if (!managerCount) return respondError(session, 400, session.text("cloud.project.errors.keepManager"));
      }
      await db.update("project_members", { id: member.id }, { permissions_json: JSON.stringify(permissions), updated_at: new Date().toISOString() });
      session.respond({ userId: targetId, permissions }, "json");
    } catch (error) {
      return respondError(session, 400, session.text("cloud.project.errors.invalidPermissions"));
    }
  });

  ctx.route("/api/projects/:id/members/:userId").methods("DELETE").action(async (session, _query, id, userId) => {
    const result = await requireProject(session, id, "manage_members");
    if ("error" in result) return respondError(session, result.status, result.error);
    const targetId = Number(userId);
    if (targetId === result.project.created_by) return respondError(session, 400, session.text("cloud.project.errors.ownerRemove"));
    const member = await db.selectOne("project_members", { project_id: result.project.id, user_id: targetId }) as ProjectMember | undefined;
    if (!member) return respondError(session, 404, session.text("cloud.project.errors.memberNotFound"));
    const targetUser = await db.selectOne("users", { id: targetId }) as User | undefined;
    if (targetUser && (await permissionsFor(result.project, targetUser, result.tenant)).includes("manage_members")) {
      const projectMembers = await db.select("project_members", { project_id: result.project.id }) as ProjectMember[];
      let managerCount = 0;
      for (const projectMember of projectMembers) {
        if (projectMember.user_id === targetId) continue;
        const otherUser = await db.selectOne("users", { id: projectMember.user_id }) as User | undefined;
        if (otherUser && (await permissionsFor(result.project, otherUser, result.tenant)).includes("manage_members")) managerCount++;
      }
      if (!managerCount) return respondError(session, 400, session.text("cloud.project.errors.keepManager"));
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
          return respondError(session, 400, session.text("cloud.project.errors.fieldRequired"));
        }
      }
      const now = new Date().toISOString();
      for (const [rawId, value] of Object.entries(values)) {
        const field = allowed.get(rawId);
        if (!field || field.id === undefined) return respondError(session, 400, session.text("cloud.project.errors.unknownField"));
        const options = JSON.parse(field.options_json || "[]") as string[];
        const valid = value === null || value === ""
          ? !field.required
          : field.type === "text" || field.type === "date" || field.type === "url" ? typeof value === "string"
            : field.type === "number" ? typeof value === "number" && Number.isFinite(value)
              : field.type === "boolean" ? typeof value === "boolean"
                : field.type === "select" ? typeof value === "string" && options.includes(value) : false;
        if (!valid) return respondError(session, 400, session.text("cloud.project.errors.invalidFieldValue"));
        await db.upsert("project_field_values", [{
          project_id: result.project.id!, field_id: field.id, value_json: JSON.stringify(value),
          updated_by: result.user.id!, updated_at: now,
        }], ["project_id", "field_id"]);
      }
      session.respond({ fieldGroups: await fieldGroups(result.tenant.id!, result.project.id!) }, "json");
    } catch (error) {
      return respondError(session, 400, session.text("cloud.project.errors.invalidFields"));
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
