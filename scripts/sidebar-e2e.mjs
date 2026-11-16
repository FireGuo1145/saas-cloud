/**
 * Loads the real plugin frontends and prints the sidebar each route resolves to.
 * Only navigation registrations matter, so route components are stubbed out.
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
const paths = ["/", "/projects", "/projects/2", "/projects/2/products", "/store", "/store/cart", "/account/billing", "/admin/users", "/admin/instances/specs", "/instances"];
const failures = [];
for (const path of paths) {
  const state = registry.resolveSidebar(path, registry.registeredSections(), registry.registeredNavigation());
  const shown = state.entries.filter((entry) => !entry.matched).map((entry) => entry.labelKey ?? entry.label);
  console.log(`${path.padEnd(24)} | ${(state.section?.id ?? "-").padEnd(9)} | landing: ${String(state.isLanding).padEnd(5)} | ${shown.join(" / ")}`);
  if (!state.section) failures.push(path);
}
await server.close();
console.log(failures.length ? `\nno sidebar for: ${failures.join(", ")}` : "\nevery path has a sidebar");
process.exit(failures.length ? 1 : 0);
