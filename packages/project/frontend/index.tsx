import type { DashboardContext } from "@mirelia/dashboard/frontend";
import { FolderKanban, Settings2 } from "lucide-react";
import ProjectSwitcher from "./components/ProjectSwitcher";
import ProjectsPage from "./pages/ProjectsPage";
import ProjectDetailsPage from "./pages/ProjectDetailsPage";
import ProjectOverviewPage from "./pages/ProjectOverviewPage";

export default function apply(ctx: DashboardContext) {
  ctx.navigation({ id: "projects", label: "Projects", path: "/projects", icon: FolderKanban, order: 10 });
  ctx.navigation({ id: "project-overview", label: "Overview", path: "/projects/:id", icon: FolderKanban, order: 10, group: "Project", paths: ["/projects/:id", "/projects/:id/settings"] });
  ctx.navigation({ id: "project-settings", label: "Settings", path: "/projects/:id/settings", icon: Settings2, order: 20, group: "Project", paths: ["/projects/:id", "/projects/:id/settings"] });
  ctx.topBar({ id: "project-switcher", component: ProjectSwitcher, paths: ["/projects", "/projects/:id", "/projects/:id/settings"] });
  ctx.route({ path: "/projects", component: ProjectsPage, shell: "dashboard" });
  ctx.route({ path: "/projects/:id", component: ProjectOverviewPage, shell: "dashboard" });
  ctx.route({ path: "/projects/:id/settings", component: ProjectDetailsPage, shell: "dashboard" });
}
