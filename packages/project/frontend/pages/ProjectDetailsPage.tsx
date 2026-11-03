import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { Badge, Button, Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, api } from "@mirelia/dashboard/frontend";
import { Check, CircleDot, Plus, Save, Settings2 } from "lucide-react";

interface Project { id: number; project_id: string; name: string; description: string; status: string; created_at: string; updated_at: string }
interface ProjectField { id: number; key: string; label: string; type: "text" | "number" | "boolean" | "date" | "url" | "select"; required: boolean; options: string[]; value: unknown }
interface FieldGroup { id: number; key: string; name: string; fields: ProjectField[] }
interface ProjectPayload { project: Project; fieldGroups: FieldGroup[] }
const fieldTypes = ["text", "number", "boolean", "date", "url", "select"] as const;

export default function ProjectDetailsPage() {
  const { id } = useParams();
  const [project, setProject] = useState<Project>();
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [groups, setGroups] = useState<FieldGroup[]>([]);
  const [values, setValues] = useState<Record<number, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [groupOpen, setGroupOpen] = useState(false);
  const [fieldOpen, setFieldOpen] = useState(false);
  const [fieldGroup, setFieldGroup] = useState<FieldGroup>();
  const [groupName, setGroupName] = useState("");
  const [groupKey, setGroupKey] = useState("");
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldKey, setFieldKey] = useState("");
  const [fieldType, setFieldType] = useState<(typeof fieldTypes)[number]>("text");
  const [fieldOptions, setFieldOptions] = useState("");
  const [fieldRequired, setFieldRequired] = useState(false);

  async function load() {
    if (!id) return;
    const response = await api.get<ProjectPayload>(`/projects/${id}`);
    setProject(response.data.project);
    setProjectName(response.data.project.name);
    setProjectDescription(response.data.project.description);
    setGroups(response.data.fieldGroups);
    setValues(Object.fromEntries(response.data.fieldGroups.flatMap((group) => group.fields.map((field) => [field.id, field.value]))));
  }

  useEffect(() => {
    setLoading(true);
    void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Project could not be loaded.")).finally(() => setLoading(false));
  }, [id]);

  async function addGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await api.post("/project-field-groups", { name: groupName, key: groupKey });
      setGroupName(""); setGroupKey(""); setGroupOpen(false); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add field group."); }
  }

  async function addField(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fieldGroup) return;
    setError("");
    try {
      await api.post(`/project-field-groups/${fieldGroup.id}/fields`, {
        label: fieldLabel, key: fieldKey, type: fieldType, required: fieldRequired,
        options: fieldOptions.split(",").map((value) => value.trim()).filter(Boolean),
      });
      setFieldLabel(""); setFieldKey(""); setFieldOptions(""); setFieldRequired(false); setFieldType("text"); setFieldOpen(false); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add field."); }
  }

  async function saveValues() {
    setSaving(true); setError(""); setMessage("");
    try {
      await api.put(`/projects/${id}/fields`, { values });
      await load();
      setMessage("Project fields saved.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save project fields."); }
    finally { setSaving(false); }
  }

  async function saveProject() {
    if (!project) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await api.put<{ project: Project }>(`/projects/${id}`, { name: projectName, description: projectDescription });
      setProject(response.data.project);
      setMessage("Project details saved.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save project details."); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="mx-auto max-w-6xl p-8 text-sm text-muted-foreground">Loading project...</div>;
  if (!project) return <div className="mx-auto max-w-6xl p-8"><p role="alert" className="text-sm text-destructive">{error || "Project not found."}</p></div>;

  return (
    <div className="mx-auto w-full max-w-6xl p-5 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0"><div className="mb-1 flex items-center gap-2 text-sm text-muted-foreground"><span>Projects</span><span>/</span><span className="truncate">{project.project_id}</span></div><h1 className="truncate text-2xl font-semibold">{project.name}</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">{project.description || "Project details and extensible metadata."}</p></div>
        <Badge variant={project.status === "active" ? "secondary" : "outline"}><CircleDot className="size-3" />{project.status}</Badge>
      </div>

      <section className="border-b border-border py-6">
        <div className="mb-4 flex items-center gap-2"><Settings2 className="size-4 text-muted-foreground" /><h2 className="text-sm font-semibold">Project details</h2></div>
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <Detail label="Project ID" value={project.project_id} />
          <div className="space-y-2"><Label htmlFor="project-name-edit">Project name</Label><Input id="project-name-edit" value={projectName} onChange={(event) => setProjectName(event.target.value)} maxLength={120} /></div>
          <Detail label="Status" value={project.status} />
          <Detail label="Created" value={new Date(project.created_at).toLocaleString()} />
          <Detail label="Last updated" value={new Date(project.updated_at).toLocaleString()} />
          <div className="space-y-2"><Label htmlFor="project-description-edit">Description</Label><Input id="project-description-edit" value={projectDescription} onChange={(event) => setProjectDescription(event.target.value)} maxLength={2000} /></div>
        </div>
        <div className="mt-4 flex justify-end"><Button variant="outline" onPress={() => void saveProject()} isDisabled={saving || !projectName.trim()}><Save />Save project</Button></div>
      </section>

      <section className="py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-sm font-semibold">Custom fields</h2><p className="mt-1 text-sm text-muted-foreground">Tenant-wide field groups and project-specific values.</p></div>
          <Button variant="outline" onPress={() => setGroupOpen(true)}><Plus />Add field group</Button>
        </div>
        {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
        {groups.length ? <div className="space-y-8">
          {groups.map((group) => <div key={group.id} className="border-t border-border pt-4">
            <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="text-sm font-medium">{group.name}</h3><p className="text-xs text-muted-foreground">{group.key}</p></div><Button variant="ghost" size="sm" onPress={() => { setFieldGroup(group); setFieldOpen(true); }}><Plus />Add field</Button></div>
            {group.fields.length ? <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
              {group.fields.map((field) => <div key={field.id} className="space-y-2">
                <Label htmlFor={`field-${field.id}`}>{field.label}{field.required && <span className="ml-1 text-destructive">*</span>}</Label>
                <FieldEditor field={field} value={values[field.id] ?? ""} onChange={(value) => setValues((current) => ({ ...current, [field.id]: value }))} />
              </div>)}
            </div> : <p className="text-sm text-muted-foreground">No fields in this group.</p>}
          </div>)}
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">{message && <p role="status" className="mr-auto text-sm text-muted-foreground"><Check className="mr-1 inline size-4" />{message}</p>}<Button onPress={() => void saveValues()} isDisabled={saving}><Save />{saving ? "Saving..." : "Save fields"}</Button></div>
        </div> : <div className="border-y border-border py-10 text-center"><p className="text-sm font-medium">No custom field groups</p><p className="mt-1 text-sm text-muted-foreground">Add a field group to define reusable project metadata.</p></div>}
      </section>

      <Dialog isOpen={groupOpen} onOpenChange={setGroupOpen}>
        <DialogHeader><DialogTitle>Add field group</DialogTitle><DialogDescription>Groups and their field definitions are shared across this workspace.</DialogDescription></DialogHeader>
          <form className="space-y-4" onSubmit={(event) => void addGroup(event)}><div className="space-y-2"><Label htmlFor="group-name">Group name</Label><Input id="group-name" value={groupName} onChange={(event) => setGroupName(event.target.value)} required /></div><div className="space-y-2"><Label htmlFor="group-key">Group key</Label><Input id="group-key" value={groupKey} onChange={(event) => setGroupKey(event.target.value)} placeholder="Generated from group name" /></div><DialogFooter><Button type="button" variant="outline" onPress={() => setGroupOpen(false)}>Cancel</Button><Button type="submit" isDisabled={!groupName.trim()}>Add group</Button></DialogFooter></form>
      </Dialog>

      <Dialog isOpen={fieldOpen} onOpenChange={setFieldOpen}>
        <DialogHeader><DialogTitle>Add custom field</DialogTitle><DialogDescription>Add a field to {fieldGroup?.name}.</DialogDescription></DialogHeader>
          <form className="space-y-4" onSubmit={(event) => void addField(event)}><div className="space-y-2"><Label htmlFor="field-label">Field label</Label><Input id="field-label" value={fieldLabel} onChange={(event) => setFieldLabel(event.target.value)} required /></div><div className="space-y-2"><Label htmlFor="field-key">Field key</Label><Input id="field-key" value={fieldKey} onChange={(event) => setFieldKey(event.target.value)} placeholder="Generated from label" /></div><div className="space-y-2"><Label>Field type</Label><div className="flex flex-wrap gap-1 rounded-md border border-border p-1">{fieldTypes.map((type) => <Button key={type} type="button" variant={fieldType === type ? "secondary" : "ghost"} size="sm" onPress={() => setFieldType(type)}>{type}</Button>)}</div></div>{fieldType === "select" && <div className="space-y-2"><Label htmlFor="field-options">Options</Label><Input id="field-options" value={fieldOptions} onChange={(event) => setFieldOptions(event.target.value)} placeholder="Development, Staging, Production" required /></div>}<Button type="button" variant={fieldRequired ? "secondary" : "outline"} onPress={() => setFieldRequired(!fieldRequired)}>{fieldRequired ? "Required" : "Optional"}</Button><DialogFooter><Button type="button" variant="outline" onPress={() => setFieldOpen(false)}>Cancel</Button><Button type="submit" isDisabled={!fieldLabel.trim()}>Add field</Button></DialogFooter></form>
      </Dialog>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm">{value}</dd></div>;
}

function FieldEditor({ field, value, onChange }: { field: ProjectField; value: unknown; onChange(value: unknown): void }) {
  if (field.type === "boolean") return <Button type="button" variant={value === true ? "secondary" : "outline"} className="justify-start" onPress={() => onChange(value !== true)}>{value === true ? <Check /> : <span className="size-4" />}{value === true ? "Enabled" : "Disabled"}</Button>;
  if (field.type === "select") return <div className="flex flex-wrap gap-2">{field.options.map((option) => <Button key={option} type="button" size="sm" variant={value === option ? "secondary" : "outline"} onPress={() => onChange(value === option ? "" : option)}>{option}</Button>)}</div>;
  const type = field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "url" ? "url" : "text";
  return <Input id={`field-${field.id}`} type={type} value={String(value ?? "")} onChange={(event) => onChange(field.type === "number" ? (event.target.value === "" ? "" : Number(event.target.value)) : event.target.value)} />;
}
