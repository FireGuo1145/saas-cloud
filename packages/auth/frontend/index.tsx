import type { DashboardContext } from "@mirelia/dashboard/frontend";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";

export default function apply(ctx: DashboardContext) {
  ctx.route({
    path: "/login",
    component: LoginPage,
    shell: "owned"
  });
  ctx.route({
    path: "/register",
    component: RegisterPage,
    shell: "owned"
  });
}
