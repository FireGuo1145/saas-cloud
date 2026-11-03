import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Check, ChevronsUpDown, FolderPlus } from "lucide-react";
import {
  Button,
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
  api,
  useI18n,
} from "@mirelia/dashboard/frontend";

interface Project { id: number; project_id: string; name: string; description: string }

export default function ProjectSwitcher() {
  const { t } = useI18n();
  const [projects, setProjects] = useState<Project[]>([]);
  const [active, setActive] = useState<Project>();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  function projectDestination(projectId: number) {
    const currentRoute = location.pathname.match(/^\/projects\/\d+(\/.*)?$/);
    return {
      pathname: `/projects/${projectId}${currentRoute?.[1] ?? ""}`,
      search: location.search,
      hash: location.hash,
    };
  }

  async function reload() {
    const response = await api.get<{ projects: Project[] }>("/projects");
    const available = response.data.projects;
    setProjects(available);
    const routeId = location.pathname.match(/^\/projects\/(\d+)/)?.[1];
    setActive(available.find((project) => String(project.id) === routeId));
  }

  useEffect(() => { void reload().catch(() => undefined); }, [location.pathname]);
  async function createProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await api.post<{ project: Project }>("/projects", { name, description });
      await reload();
      setCreateOpen(false);
      setName("");
      setDescription("");
      navigate(`/projects/${response.data.project.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("cloud.project.errors.createProject"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <DropdownMenuTrigger>
          <Button variant="outline" className="h-9 min-w-40 justify-between gap-3 sm:min-w-48">
            <span className="flex min-w-0 items-center gap-2"><span className="grid size-6 shrink-0 place-items-center rounded-sm bg-primary text-[10px] font-semibold text-primary-foreground">{active?.name.slice(0, 1).toUpperCase() || "P"}</span><span className="min-w-0 text-left"><span className="block truncate text-xs text-muted-foreground">{t("cloud.project.project")}</span><span className="block truncate text-sm">{active?.name || t("cloud.project.selectProject")}</span></span></span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </Button>
        <DropdownMenu className="w-72">
          <DropdownMenuLabel>{t("cloud.project.nav.projects")}</DropdownMenuLabel>
          {projects.map((project) => <DropdownMenuItem key={project.id} className="gap-2" onAction={() => navigate(projectDestination(project.id))}>
            <span className="grid size-6 shrink-0 place-items-center rounded-sm bg-secondary text-xs font-semibold">{project.name.slice(0, 1).toUpperCase()}</span><span className="min-w-0 flex-1 truncate">{project.name}</span>{active?.id === project.id && <Check className="size-4" />}
          </DropdownMenuItem>)}
          {!projects.length && <DropdownMenuItem isDisabled>{t("cloud.project.noProjects")}</DropdownMenuItem>}
          <DropdownMenuSeparator />
          <DropdownMenuItem onAction={() => setCreateOpen(true)}><FolderPlus className="size-4" />{t("cloud.project.createProject")}</DropdownMenuItem>
        </DropdownMenu>
      </DropdownMenuTrigger>
      <Dialog isOpen={createOpen} onOpenChange={setCreateOpen}>
          <DialogHeader><DialogTitle>{t("cloud.project.createProject")}</DialogTitle><DialogDescription>{t("cloud.project.createDescription")}</DialogDescription></DialogHeader>
          <form className="space-y-4" onSubmit={(event) => void createProject(event)}>
            <div className="space-y-2"><Label htmlFor="project-name">{t("cloud.project.projectName")}</Label><Input id="project-name" autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} /></div>
            <div className="space-y-2"><Label htmlFor="project-description">{t("cloud.project.projectDescription")}</Label><Input id="project-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} /></div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <DialogFooter><Button type="button" variant="outline" onPress={() => setCreateOpen(false)}>{t("cloud.project.cancel")}</Button><Button type="submit" isDisabled={busy || !name.trim()}>{busy ? t("cloud.common.creating") : t("cloud.common.create")}</Button></DialogFooter>
          </form>
      </Dialog>
    </div>
  );
}
