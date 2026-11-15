import type { DashboardContext } from "@mirelia/dashboard/frontend";
import { ReceiptText, ShoppingCart, Store } from "lucide-react";
import StoreCatalogPage from "./pages/StoreCatalogPage";
import StoreCartPage from "./pages/StoreCartPage";
import StoreOrdersPage from "./pages/StoreOrdersPage";
import { StoreCartLink } from "./pages/StoreCatalogPage";

export default function apply(ctx: DashboardContext) {
  const paths = ["/store", "/store/cart", "/store/orders"];
  const section = { section: "store" };
  ctx.navigation({ id: "store-catalog", label: "Store", labelKey: "cloud.store.nav.section", path: "/store", icon: Store, order: 10, ...section, paths: ["/store"] });
  ctx.navigation({ id: "store-cart", label: "Cart", labelKey: "cloud.store.nav.cart", path: "/store/cart", icon: ShoppingCart, order: 20, ...section, paths: ["/store/cart"] });
  ctx.navigation({ id: "store-orders", label: "Orders", labelKey: "cloud.store.nav.orders", path: "/store/orders", icon: ReceiptText, order: 30, ...section, paths: ["/store/orders"] });
  ctx.topBar({ id: "store-cart", component: StoreCartLink, placement: "end", order: 10 });
  ctx.route({ path: "/store", component: StoreCatalogPage, shell: "dashboard" });
  ctx.route({ path: "/store/cart", component: StoreCartPage, shell: "dashboard" });
  ctx.route({ path: "/store/orders", component: StoreOrdersPage, shell: "dashboard" });
}
