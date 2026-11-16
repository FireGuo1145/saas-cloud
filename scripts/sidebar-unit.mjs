/**
 * Checks the sidebar resolver: a page registers its own entries, the most specific page
 * pattern wins, and every path falls back to its section heading.
 * Run with: node --experimental-strip-types scripts/sidebar-unit.mjs
 */
import { resolveSidebar } from "../packages/dashboard/frontend/navigation.ts";

const sections = [
  { id: "home", basePath: "/", order: 0 },
  { id: "projects", basePath: "/projects", order: 10, backPath: "/" },
  { id: "store", basePath: "/store", order: 20 },
];
const nav = [
  { id: "home", label: "Home", path: "/", section: "home" },
  { id: "projects", label: "Projects", path: "/projects", section: "projects" },
  { id: "overview", label: "Overview", path: "/projects/:id", section: "projects" },
  { id: "settings", label: "Settings", path: "/projects/:id/settings", section: "projects" },
  { id: "catalog", label: "Catalog", path: "/store", section: "store" },
];
const sidebars = [
  { path: "/", section: "home", items: ["home"] },
  { path: "/projects", section: "projects", items: ["projects"] },
  { path: "/projects/:id", section: "projects", items: ["projects", "overview", "settings"] },
  { path: "/projects/:id/settings", section: "projects", items: ["projects", "overview", "settings"] },
  { path: "/store", section: "store", items: ["catalog"] },
];

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` :: ${detail}` : ""}`); };
const resolve = (path) => resolveSidebar(path, sections, sidebars, nav);
const ids = (path) => resolve(path).entries.map((entry) => entry.id);

check("/projects lists only itself", JSON.stringify(ids("/projects")) === '["projects"]', JSON.stringify(ids("/projects")));
check("/projects/2 lists project pages", JSON.stringify(ids("/projects/2")) === '["projects","overview","settings"]', JSON.stringify(ids("/projects/2")));
check("detail page marks overview as current", resolve("/projects/2").entries.find((entry) => entry.id === "overview")?.matched === true);
check("settings page marks settings as current", resolve("/projects/2/settings").entries.find((entry) => entry.id === "settings")?.matched === true);
check("settings page keeps the list entry", ids("/projects/2/settings").includes("projects"));
check("a page below a registered one falls back to its section", resolve("/projects/2/unknown").section?.id === "projects" && resolve("/projects/2/unknown").sidebar === undefined);
check("most specific pattern wins", resolve("/projects/2/settings").sidebar?.path === "/projects/:id/settings");
check("params are exposed", resolve("/projects/2/settings").params.id === "2");
check("store page has its own sidebar", JSON.stringify(ids("/store")) === '["catalog"]');
check("root page has its own sidebar", JSON.stringify(ids("/")) === '["home"]');
check("unknown root path has no entries", ids("/somewhere").length === 0 && resolve("/somewhere").section?.id === "home");

const failures = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failures}/${results.length} checks passed`);
process.exit(failures ? 1 : 0);
