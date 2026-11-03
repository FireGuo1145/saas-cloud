import { useEffect, useState } from "react";
import { FolderKanban, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api, Button, Card, CardContent } from "@mirelia/dashboard/frontend";

interface Project { id: number; project_id: string; name: string; description: string; created_at: string }

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  useEffect(() => { void api.get<{ projects: Project[] }>("/projects").then(({ data }) => setProjects(data.projects)).catch(() => setError("Projects could not be loaded.")); }, []);

  return (
    <div className="mx-auto w-full max-w-6xl p-5 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div><p className="mb-1 text-sm text-muted-foreground">Workspace</p><h1 className="text-2xl font-semibold">Projects</h1><p className="mt-1 text-sm text-muted-foreground">Manage projects in this workspace.</p></div>
        <Button onPress={() => document.dispatchEvent(new CustomEvent("mirelia:open-project-create"))}><Plus />New project</Button>
      </div>
      {error ? <p className="mt-6 text-sm text-destructive">{error}</p> : projects.length ? <div className="mt-6 divide-y divide-border border-y border-border">
        {projects.map((project) => <Button key={project.id} variant="ghost" onPress={() => navigate(`/projects/${project.id}`)} className="h-auto min-h-16 w-full justify-start gap-4 rounded-none px-2 py-3 text-left whitespace-normal hover:bg-muted/40">
          <span className="grid size-10 shrink-0 place-items-center rounded-md border border-border bg-card"><FolderKanban className="size-5 text-muted-foreground" /></span>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{project.name}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{project.description || project.project_id}</span></span>
          <span className="hidden text-xs text-muted-foreground sm:block">Created {new Date(project.created_at).toLocaleDateString()}</span>
        </Button>)}
      </div> : <div className="mt-6 flex min-h-56 flex-col items-center justify-center border-y border-border text-center">
        <FolderKanban className="mb-3 size-7 text-muted-foreground" /><h2 className="text-base font-medium">No projects yet</h2><p className="mt-1 text-sm text-muted-foreground">Create a project to organize workspace resources.</p>
      </div>}
    </div>
  );
}
