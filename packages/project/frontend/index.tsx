import type { DashboardContext } from "@mirelia/dashboard/frontend";
import { FolderKanban, Package, Settings2, UsersRound } from "lucide-react";
import ProjectSwitcher from "./components/ProjectSwitcher";
import ProjectsPage from "./pages/ProjectsPage";
import ProjectDetailsPage from "./pages/ProjectDetailsPage";
import ProjectOverviewPage from "./pages/ProjectOverviewPage";
import ProjectMembersPage from "./pages/ProjectMembersPage";
import ProjectProductsPage from "./pages/ProjectProductsPage";

export default function apply(ctx: DashboardContext) {
  // The project list is its own section root, so it stays in the sidebar there.
  ctx.navigation({ id: "projects", label: "Projects", labelKey: "cloud.project.nav.projects", path: "/projects", icon: FolderKanban, order: 10, section: "projects", paths: ["/projects"] });
  const projectPaths = ["/projects/:id", "/projects/:id/settings", "/projects/:id/members", "/projects/:id/products", "/projects/:id/rainyun"];
  ctx.navigation({ id: "project-overview", label: "Overview", labelKey: "cloud.project.nav.overview", path: "/projects/:id", icon: FolderKanban, order: 10, section: "projects", paths: projectPaths });
  ctx.navigation({ id: "project-settings", label: "Settings", labelKey: "cloud.project.nav.settings", path: "/projects/:id/settings", icon: Settings2, order: 20, section: "projects", paths: projectPaths });
  ctx.navigation({ id: "project-members", label: "Members", labelKey: "cloud.project.nav.members", path: "/projects/:id/members", icon: UsersRound, order: 30, section: "projects", paths: projectPaths });
  ctx.navigation({ id: "project-products", label: "Products", labelKey: "cloud.project.nav.products", path: "/projects/:id/products", icon: Package, order: 35, section: "projects", paths: projectPaths });
  ctx.topBar({ id: "project-switcher", component: ProjectSwitcher, paths: ["/projects/:id/*"] });
  ctx.route({ path: "/projects", component: ProjectsPage, shell: "dashboard" });
  ctx.route({ path: "/projects/:id", component: ProjectOverviewPage, shell: "dashboard" });
  ctx.route({ path: "/projects/:id/settings", component: ProjectDetailsPage, shell: "dashboard" });
  ctx.route({ path: "/projects/:id/members", component: ProjectMembersPage, shell: "dashboard" });
  ctx.route({ path: "/projects/:id/products", component: ProjectProductsPage, shell: "dashboard" });
}
