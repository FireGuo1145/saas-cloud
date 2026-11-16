/**
 * Checks the sidebar resolver (packages/dashboard/frontend/navigation.ts):
 * longest matching prefix owns the page, entries come from that section only and an
 * entry is marked as the current page when its path equals the location.
 * Run with: node --experimental-strip-types scripts/sidebar-unit.mjs
 */
import { pathWithin, resolveSidebar } from "../packages/dashboard/frontend/navigation.ts";

const sections = [
  { id: "home", basePath: "/", order: 0 },
  { id: "projects", basePath: "/projects", homePath: "/projects/:id", order: 10, backPath: "/" },
  { id: "account", basePath: "/account", order: 10 },
  { id: "admin", basePath: "/admin", order: 20 },
  { id: "store", basePath: "/store", order: 20 },
  { id: "instances", basePath: "/instances", order: 20 },
];
const navigation = [
  { id: "home", path: "/", section: "home" },
  { id: "projects", path: "/projects", section: "projects" },
  { id: "project-overview", path: "/projects/:id", section: "projects" },
  { id: "project-settings", path: "/projects/:id/settings", section: "projects" },
  { id: "store-catalog", path: "/store", section: "store" },
  { id: "store-cart", path: "/store/cart", section: "store" },
  { id: "account", path: "/account", section: "account" },
  { id: "admin-users", path: "/admin/users", section: "admin" },
];

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` :: ${detail}` : ""}`); };
const owner = (path) => resolveSidebar(path, sections, navigation).section?.id;

check("/projects -> projects", owner("/projects") === "projects", owner("/projects"));
check("/projects/2 -> projects", owner("/projects/2") === "projects", owner("/projects/2"));
check("/projects/2/members -> projects", owner("/projects/2/members") === "projects");
check("/store -> store", owner("/store") === "store");
check("/store/cart -> store", owner("/store/cart") === "store");
check("/account/billing -> account", owner("/account/billing") === "account");
check("/admin/instances/specs -> admin", owner("/admin/instances/specs") === "admin");
check("/instances -> instances", owner("/instances") === "instances");
check("/ -> home", owner("/") === "home", owner("/"));
check("/unknown -> home", owner("/unknown") === "home", owner("/unknown"));
check("prefix is segment aware", !pathWithin("/projects", "/project") && !pathWithin("/projects", "/projects-x") && !pathWithin("/store", "/storefront"));
check("projects entry hidden on the list", resolveSidebar("/projects", sections, navigation).entries.filter((e) => !e.matched).every((e) => e.id !== "projects"));
check("projects entry shown on a project", resolveSidebar("/projects/2", sections, navigation).entries.some((e) => e.id === "projects" && !e.matched));
check("overview is current on a project", resolveSidebar("/projects/2", sections, navigation).entries.some((e) => e.id === "project-overview" && e.matched));
check("list is a landing page", resolveSidebar("/projects", sections, navigation).isLanding === true);
check("a project overview is a landing page", resolveSidebar("/projects/2", sections, navigation).isLanding === true);
check("a project sub page is not a landing page", resolveSidebar("/projects/2/settings", sections, navigation).isLanding === false);
check("store landing hides the catalogue entry", resolveSidebar("/store", sections, navigation).entries.filter((e) => !e.matched).every((e) => e.id !== "store-catalog"));
check("store cart keeps the catalogue entry", resolveSidebar("/store/cart", sections, navigation).entries.some((e) => e.id === "store-catalog" && !e.matched));
check("account sections do not leak", resolveSidebar("/account/billing", sections, navigation)?.entries.every((e) => e.path.startsWith("/account")));

const failures = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failures}/${results.length} checks passed`);
process.exit(failures ? 1 : 0);
