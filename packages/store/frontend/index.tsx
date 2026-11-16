import type { DashboardContext } from "@mirelia/dashboard/frontend";
import { ReceiptText, ShoppingCart, Store } from "lucide-react";
import StoreCatalogPage from "./pages/StoreCatalogPage";
import StoreCartPage from "./pages/StoreCartPage";
import StoreOrdersPage from "./pages/StoreOrdersPage";
import { StoreCartLink } from "./pages/StoreCatalogPage";

export default function apply(ctx: DashboardContext) {
  ctx.section({ id: "store", basePath: "/store", labelKey: "cloud.store.nav.section", backPath: "/", order: 20 });
  ctx.navigation({ id: "store-catalog", label: "Store", labelKey: "cloud.store.nav.catalog", path: "/store", icon: Store, order: 10, section: "store" });
  ctx.navigation({ id: "store-cart", label: "Cart", labelKey: "cloud.store.nav.cart", path: "/store/cart", icon: ShoppingCart, order: 20, section: "store" });
  ctx.navigation({ id: "store-orders", label: "Orders", labelKey: "cloud.store.nav.orders", path: "/store/orders", icon: ReceiptText, order: 30, section: "store" });
  // Each page registers its own sidebar.
  const storeSidebar = ["store-catalog", "store-cart", "store-orders"];
  ctx.sidebar({ path: "/store", section: "store", items: storeSidebar });
  ctx.sidebar({ path: "/store/cart", section: "store", items: storeSidebar });
  ctx.sidebar({ path: "/store/orders", section: "store", items: storeSidebar });
  ctx.topBar({ id: "store-cart", component: StoreCartLink, placement: "end", order: 10 });
  ctx.route({ path: "/store", component: StoreCatalogPage, shell: "dashboard" });
  ctx.route({ path: "/store/cart", component: StoreCartPage, shell: "dashboard" });
  ctx.route({ path: "/store/orders", component: StoreOrdersPage, shell: "dashboard" });
}
