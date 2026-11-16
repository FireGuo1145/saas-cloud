/**
 * Loads the real plugin frontends and prints the sidebar each route resolves to.
 * Only navigation/sidebar registrations matter, so route components are stubbed out.
 * Usage: node scripts/sidebar-e2e.mjs
 */
import { createServer } from "vite";

const server = await createServer({
  root: process.cwd(), logLevel: "error", appType: "custom", server: { middlewareMode: true },
  resolve: { alias: [
    { find: "@mirelia/dashboard/frontend", replacement: "/packages/dashboard/frontend/public.ts" },
    { find: /^@\//, replacement: "/packages/dashboard/frontend/" },
  ] },
});
const registry = await server.ssrLoadModule("/packages/dashboard/frontend/extension.tsx");
const fronts = [
  "/packages/user/frontend/index.tsx",
  "/packages/project/frontend/index.tsx",
  "/packages/store/frontend/index.tsx",
  "/packages/billing/frontend/index.tsx",
  "/packages/rainyun/frontend/index.tsx",
  "/panels/JPGPanel/packages/server-instances/frontend/index.tsx",
];
for (const file of fronts) {
  const mod = await server.ssrLoadModule(file);
  const ctx = new registry.DashboardContext();
  ctx.route = () => () => {};
  ctx.topBar = () => {};
  mod.default(ctx);
}
const paths = [
  "/", "/projects", "/projects/2", "/projects/2/settings", "/projects/2/members", "/projects/2/products", "/projects/2/rainyun",
  "/store", "/store/cart", "/store/orders", "/instances",
  "/instances/srv_1", "/instances/srv_1/console", "/instances/srv_1/terminal", "/instances/srv_1/config", "/instances/srv_1/files", "/instances/srv_1/tools",
  "/account", "/account/profile", "/account/billing", "/admin/users", "/admin/payments", "/admin/instances/specs",
];
const failures = [];
for (const path of paths) {
  const state = registry.sidebarState(path);
  const shown = state.entries.map((entry) => `${entry.matched ? "*" : ""}${entry.labelKey ?? entry.label}`);
  console.log(`${path.padEnd(26)} | ${(state.section?.id ?? "-").padEnd(9)} | ${shown.join(" / ") || "(no sidebar)"}`);
  if (!state.sidebar) failures.push(path);
}
await server.close();
console.log(failures.length ? `\nno sidebar registered for: ${failures.join(", ")}` : "\nevery page has a sidebar");
process.exit(failures.length ? 1 : 0);
