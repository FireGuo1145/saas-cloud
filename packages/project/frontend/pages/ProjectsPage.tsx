import { useEffect, useState, type FormEvent } from "react";
import { FolderKanban, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api, Button, Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, useI18n } from "@mirelia/dashboard/frontend";

interface Project { id: number; project_id: string; name: string; description: string; created_at: string }

export default function ProjectsPage() {
  const { t, language } = useI18n();
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  async function loadProjects() {
    setError("");
    try {
      const { data } = await api.get<{ projects: Project[] }>("/projects");
      setProjects(data.projects);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("cloud.project.errors.projectsLoad"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadProjects(); }, []);

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError("");
    try {
      const { data } = await api.post<{ project: Project }>("/projects", { name, description });
      setCreateOpen(false);
      setName("");
      setDescription("");
      navigate(`/projects/${data.project.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("cloud.project.errors.createProject"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-5 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div><p className="mb-1 text-sm text-muted-foreground">{t("cloud.project.workspace")}</p><h1 className="text-2xl font-semibold">{t("cloud.project.nav.projects")}</h1><p className="mt-1 text-sm text-muted-foreground">{t("cloud.project.manageWorkspaceProjects")}</p></div>
        <Button onPress={() => setCreateOpen(true)}><Plus />{t("cloud.project.newProject")}</Button>
      </div>
      {error ? <div className="mt-6 flex flex-wrap items-center gap-3" role="alert"><p className="text-sm text-destructive">{error}</p><Button variant="outline" size="sm" onPress={() => { setLoading(true); void loadProjects(); }}>{t("cloud.common.retry")}</Button></div> : loading ? <p className="mt-6 text-sm text-muted-foreground" role="status">{t("cloud.common.loading")}</p> : projects.length ? <div className="mt-6 divide-y divide-border border-y border-border">
        {projects.map((project) => <Button key={project.id} variant="ghost" onPress={() => navigate(`/projects/${project.id}`)} className="h-auto min-h-16 w-full justify-start gap-4 rounded-none px-2 py-3 text-left whitespace-normal hover:bg-muted/40">
          <span className="grid size-10 shrink-0 place-items-center rounded-md border border-border bg-card"><FolderKanban className="size-5 text-muted-foreground" /></span>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{project.name}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{project.description || project.project_id}</span></span>
          <span className="hidden text-xs text-muted-foreground sm:block">{t("cloud.project.created")} {new Date(project.created_at).toLocaleDateString(language)}</span>
        </Button>)}
      </div> : <div className="mt-6 flex min-h-56 flex-col items-center justify-center border-y border-border text-center">
        <FolderKanban className="mb-3 size-7 text-muted-foreground" /><h2 className="text-base font-medium">{t("cloud.project.noProjects")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("cloud.project.noProjectsDescription")}</p>
      </div>}
      <Dialog isOpen={createOpen} onOpenChange={setCreateOpen}>
        <DialogHeader><DialogTitle>{t("cloud.project.createProject")}</DialogTitle><DialogDescription>{t("cloud.project.createDescription")}</DialogDescription></DialogHeader>
        <form className="space-y-4" onSubmit={(event) => void createProject(event)}>
          <div className="space-y-2"><Label htmlFor="project-name">{t("cloud.project.projectName")}</Label><Input id="project-name" autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} /></div>
          <div className="space-y-2"><Label htmlFor="project-description">{t("cloud.project.projectDescription")}</Label><Input id="project-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} /></div>
          <DialogFooter><Button type="button" variant="outline" onPress={() => setCreateOpen(false)}>{t("cloud.project.cancel")}</Button><Button type="submit" isDisabled={creating || !name.trim()}>{creating ? t("cloud.common.creating") : t("cloud.common.create")}</Button></DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
