import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, LinkButton, api } from "@mirelia/dashboard/frontend";
import { CircleDot, Settings2 } from "lucide-react";

interface Project {
  id: number;
  project_id: string;
  name: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export default function ProjectOverviewPage() {
  const { id } = useParams();
  const [project, setProject] = useState<Project>();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    void api.get<{ project: Project }>(`/projects/${id}`)
      .then(({ data }) => setProject(data.project))
      .catch(() => setError("Project could not be loaded."));
  }, [id]);

  if (error) return <div className="mx-auto max-w-6xl p-8"><p role="alert" className="text-sm text-destructive">{error}</p></div>;
  if (!project) return <div className="mx-auto max-w-6xl p-8 text-sm text-muted-foreground">Loading project...</div>;

  return (
    <div className="mx-auto w-full max-w-6xl p-5 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0">
          <p className="mb-1 text-sm text-muted-foreground">Project overview</p>
          <h1 className="truncate text-2xl font-semibold">{project.name}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{project.description || "Project resources and configuration."}</p>
        </div>
        <Badge variant={project.status === "active" ? "secondary" : "outline"}><CircleDot className="size-3" />{project.status}</Badge>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Project information</CardTitle><CardDescription>Identifiers and activity for this project.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Detail label="Project ID" value={project.project_id} />
            <Detail label="Status" value={project.status} />
            <Detail label="Created" value={new Date(project.created_at).toLocaleString()} />
            <Detail label="Last updated" value={new Date(project.updated_at).toLocaleString()} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Project settings</CardTitle><CardDescription>Manage project details and extensible fields.</CardDescription></CardHeader>
          <CardContent><LinkButton href={`/projects/${project.id}/settings`}><Settings2 />Open settings</LinkButton></CardContent>
        </Card>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm">{value}</dd></div>;
}
