import type { DashboardContext } from "@mirelia/dashboard/frontend";
import { Server } from "lucide-react";
import ServerCatalogPage from "./pages/ServerCatalogPage";

export default function apply(ctx: DashboardContext) {
  ctx.navigation({ id: "server-store", label: "Server store", labelKey: "cloud.store.nav.catalog", path: "/store", icon: Server, order: 20, paths: ["/store"] });
  ctx.route({ path: "/store", component: ServerCatalogPage, shell: "dashboard" });
}
