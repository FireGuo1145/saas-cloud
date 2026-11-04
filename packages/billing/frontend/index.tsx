import type { DashboardContext } from "@mirelia/dashboard/frontend";
import { CreditCard } from "lucide-react";
import BillingPage from "./pages/BillingPage";

export default function apply(ctx: DashboardContext) {
  ctx.navigation({ id: "billing", label: "Billing", labelKey: "cloud.billing.nav.billing", path: "/account/billing", icon: CreditCard, order: 91, paths: ["/account/billing"] });
  ctx.route({ path: "/account/billing", component: BillingPage, shell: "dashboard" });
}
