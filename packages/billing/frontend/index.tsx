import type { DashboardContext } from "@mirelia/dashboard/frontend";
import { CreditCard, ReceiptText } from "lucide-react";
import BillingPage from "./pages/BillingPage";
import AdminPaymentsPage from "./pages/AdminPaymentsPage";

async function isAdmin() {
  try {
    const response = await fetch("/api/user/me", { credentials: "same-origin", headers: { "accept-language": document.documentElement.lang || "zh" } });
    if (!response.ok) return false;
    const data = await response.json() as { is_admin?: boolean };
    return data.is_admin === true;
  } catch { return false; }
}

export default function apply(ctx: DashboardContext) {
  ctx.navigation({ id: "billing", label: "Billing", labelKey: "cloud.billing.nav.billing", path: "/account/billing", icon: CreditCard, order: 30, section: "account", paths: ["/account/billing"] });
  ctx.navigation({ id: "admin-payments", label: "Payments", labelKey: "cloud.billing.admin.nav.orders", path: "/admin/payments", icon: ReceiptText, order: 20, section: "admin", paths: ["/admin/payments"], visible: isAdmin });
  ctx.route({ path: "/account/billing", component: BillingPage, shell: "dashboard" });
  ctx.route({ path: "/admin/payments", component: AdminPaymentsPage, shell: "dashboard" });
}
