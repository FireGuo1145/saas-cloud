import type { DashboardContext } from "@mirelia/dashboard/frontend";
import { FolderKanban, Package, Settings2, UsersRound } from "lucide-react";
import ProjectSwitcher from "./components/ProjectSwitcher";
import ProjectsPage from "./pages/ProjectsPage";
import ProjectDetailsPage from "./pages/ProjectDetailsPage";
import ProjectOverviewPage from "./pages/ProjectOverviewPage";
import ProjectMembersPage from "./pages/ProjectMembersPage";
import ProjectProductsPage from "./pages/ProjectProductsPage";

export default function apply(ctx: DashboardContext) {
  ctx.section({ id: "projects", basePath: "/projects", labelKey: "cloud.project.nav.projects", backPath: "/", backLabelKey: "cloud.nav.backHome", order: 10 });
  ctx.navigation({ id: "projects", label: "Projects", labelKey: "cloud.project.nav.projects", path: "/projects", icon: FolderKanban, order: 5, section: "projects" });
  ctx.navigation({ id: "project-overview", label: "Overview", labelKey: "cloud.project.nav.overview", path: "/projects/:id", icon: FolderKanban, order: 10, section: "projects" });
  ctx.navigation({ id: "project-settings", label: "Settings", labelKey: "cloud.project.nav.settings", path: "/projects/:id/settings", icon: Settings2, order: 20, section: "projects" });
  ctx.navigation({ id: "project-members", label: "Members", labelKey: "cloud.project.nav.members", path: "/projects/:id/members", icon: UsersRound, order: 30, section: "projects" });
  ctx.navigation({ id: "project-products", label: "Products", labelKey: "cloud.project.nav.products", path: "/projects/:id/products", icon: Package, order: 35, section: "projects" });
  // Every page registers its own sidebar.
  const projectSidebar = ["projects", "project-overview", "project-settings", "project-members", "project-products", "rainyun-servers"];
  ctx.sidebar({ path: "/projects", section: "projects", items: ["projects"] });
  ctx.sidebar({ path: "/projects/:id", section: "projects", items: projectSidebar });
  ctx.sidebar({ path: "/projects/:id/settings", section: "projects", items: projectSidebar });
  ctx.sidebar({ path: "/projects/:id/members", section: "projects", items: projectSidebar });
  ctx.sidebar({ path: "/projects/:id/products", section: "projects", items: projectSidebar });
  ctx.sidebar({ path: "/projects/:id/rainyun", section: "projects", items: projectSidebar });
  ctx.topBar({ id: "project-switcher", component: ProjectSwitcher, paths: ["/projects/:id/*"] });
  ctx.route({ path: "/projects", component: ProjectsPage, shell: "dashboard" });
  ctx.route({ path: "/projects/:id", component: ProjectOverviewPage, shell: "dashboard" });
  ctx.route({ path: "/projects/:id/settings", component: ProjectDetailsPage, shell: "dashboard" });
  ctx.route({ path: "/projects/:id/members", component: ProjectMembersPage, shell: "dashboard" });
  ctx.route({ path: "/projects/:id/products", component: ProjectProductsPage, shell: "dashboard" });
}
