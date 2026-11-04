import type { DashboardContext } from "@mirelia/dashboard/frontend";
import { Server } from "lucide-react";
import RainyunServersPage from "./pages/RainyunServersPage";

export default function apply(ctx: DashboardContext) {
  const paths = ["/projects/:id", "/projects/:id/settings", "/projects/:id/members", "/projects/:id/rainyun"];
  ctx.navigation({ id: "rainyun-servers", label: "Rainyun servers", labelKey: "cloud.rainyun.nav.servers", path: "/projects/:id/rainyun", icon: Server, order: 40, group: "Project", groupKey: "cloud.nav.project", paths });
  ctx.route({ path: "/projects/:id/rainyun", component: RainyunServersPage, shell: "dashboard" });
}
