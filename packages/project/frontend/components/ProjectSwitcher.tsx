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
} from "@mirelia/dashboard/frontend";

interface Project { id: number; project_id: string; name: string; description: string }

export default function ProjectSwitcher() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [active, setActive] = useState<Project>();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  async function reload() {
    const response = await api.get<{ projects: Project[] }>("/projects");
    const available = response.data.projects;
    setProjects(available);
    const routeId = location.pathname.match(/^\/projects\/(\d+)/)?.[1];
    setActive(available.find((project) => String(project.id) === routeId));
  }

  useEffect(() => { void reload().catch(() => undefined); }, [location.pathname]);
  useEffect(() => {
    const openCreate = () => setCreateOpen(true);
    document.addEventListener("mirelia:open-project-create", openCreate);
    return () => document.removeEventListener("mirelia:open-project-create", openCreate);
  }, []);

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
      setError(cause instanceof Error ? cause.message : "Could not create project");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <DropdownMenuTrigger>
          <Button variant="outline" className="h-9 min-w-40 justify-between gap-3 sm:min-w-48">
            <span className="flex min-w-0 items-center gap-2"><span className="grid size-6 shrink-0 place-items-center rounded-sm bg-primary text-[10px] font-semibold text-primary-foreground">{active?.name.slice(0, 1).toUpperCase() || "P"}</span><span className="min-w-0 text-left"><span className="block truncate text-xs text-muted-foreground">Project</span><span className="block truncate text-sm">{active?.name || "Select a project"}</span></span></span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </Button>
        <DropdownMenu className="w-72">
          <DropdownMenuLabel>Projects</DropdownMenuLabel>
          <div className="max-h-64 overflow-y-auto">
            {projects.map((project) => <DropdownMenuItem key={project.id} className="gap-2" onAction={() => navigate(`/projects/${project.id}`)}>
              <span className="grid size-6 shrink-0 place-items-center rounded-sm bg-secondary text-xs font-semibold">{project.name.slice(0, 1).toUpperCase()}</span><span className="min-w-0 flex-1 truncate">{project.name}</span>{active?.id === project.id && <Check className="size-4" />}
            </DropdownMenuItem>)}
            {!projects.length && <p className="px-2 py-3 text-sm text-muted-foreground">No projects yet</p>}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onAction={() => setCreateOpen(true)}><FolderPlus className="size-4" />Create project</DropdownMenuItem>
        </DropdownMenu>
      </DropdownMenuTrigger>
      <Dialog isOpen={createOpen} onOpenChange={setCreateOpen}>
          <DialogHeader><DialogTitle>Create a project</DialogTitle><DialogDescription>Projects organize resources inside the current workspace.</DialogDescription></DialogHeader>
          <form className="space-y-4" onSubmit={(event) => void createProject(event)}>
            <div className="space-y-2"><Label htmlFor="project-name">Project name</Label><Input id="project-name" autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} /></div>
            <div className="space-y-2"><Label htmlFor="project-description">Description</Label><Input id="project-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} /></div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <DialogFooter><Button type="button" variant="outline" onPress={() => setCreateOpen(false)}>Cancel</Button><Button type="submit" isDisabled={busy || !name.trim()}>{busy ? "Creating..." : "Create"}</Button></DialogFooter>
          </form>
      </Dialog>
    </div>
  );
}
