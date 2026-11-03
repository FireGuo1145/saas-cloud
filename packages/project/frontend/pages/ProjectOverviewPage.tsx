import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, LinkButton, api, useI18n } from "@mirelia/dashboard/frontend";
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
  const { t, language } = useI18n();
  const { id } = useParams();
  const [project, setProject] = useState<Project>();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    void api.get<{ project: Project }>(`/projects/${id}`)
      .then(({ data }) => setProject(data.project))
      .catch((cause) => setError(cause instanceof Error ? cause.message : t("cloud.project.errors.projectLoad")));
  }, [id]);

  if (error) return <div className="mx-auto max-w-6xl p-8"><p role="alert" className="text-sm text-destructive">{error}</p></div>;
  if (!project) return <div className="mx-auto max-w-6xl p-8 text-sm text-muted-foreground">{t("cloud.common.loading")}</div>;

  return (
    <div className="mx-auto w-full max-w-6xl p-5 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0">
          <p className="mb-1 text-sm text-muted-foreground">{t("cloud.project.overview")}</p>
          <h1 className="truncate text-2xl font-semibold">{project.name}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{project.description || t("cloud.project.resourceConfiguration")}</p>
        </div>
        <Badge variant={project.status === "active" ? "secondary" : "outline"}><CircleDot className="size-3" />{t(`cloud.project.statusValues.${project.status}`)}</Badge>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t("cloud.project.projectInformation")}</CardTitle><CardDescription>{t("cloud.project.identifiersActivity")}</CardDescription></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Detail label={t("cloud.project.projectId")} value={project.project_id} />
            <Detail label={t("cloud.project.status")} value={t(`cloud.project.statusValues.${project.status}`)} />
            <Detail label={t("cloud.project.created")} value={new Date(project.created_at).toLocaleString(language)} />
            <Detail label={t("cloud.project.lastUpdated")} value={new Date(project.updated_at).toLocaleString(language)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("cloud.project.projectSettings")}</CardTitle><CardDescription>{t("cloud.project.manageDetailsFields")}</CardDescription></CardHeader>
          <CardContent><LinkButton href={`/projects/${project.id}/settings`}><Settings2 />{t("cloud.project.openSettings")}</LinkButton></CardContent>
        </Card>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm">{value}</dd></div>;
}
