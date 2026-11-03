import type { DashboardContext } from "@mirelia/dashboard/frontend";
import { FolderKanban } from "lucide-react";
import ProjectSwitcher from "./components/ProjectSwitcher";
import ProjectsPage from "./pages/ProjectsPage";
import ProjectDetailsPage from "./pages/ProjectDetailsPage";

export default function apply(ctx: DashboardContext) {
  ctx.navigation({ id: "projects", label: "Projects", path: "/projects", icon: FolderKanban, order: 10 });
  ctx.topBar({ id: "project-switcher", component: ProjectSwitcher });
  ctx.route({ path: "/", component: ProjectsPage, shell: "dashboard" });
  ctx.route({ path: "/projects", component: ProjectsPage, shell: "dashboard" });
  ctx.route({ path: "/projects/:id", component: ProjectDetailsPage, shell: "dashboard" });
}
