import type { DashboardNavigationItem, DashboardSection } from "./extension.js";

export function normalizeBase(basePath: string) {
  const trimmed = `/${String(basePath ?? "").split("/").filter(Boolean).join("/")}`;
  return trimmed === "/" ? "/" : trimmed;
}

/**
 * Whether a route prefix contains the path: `/projects` matches `/projects` and
 * `/projects/2`, while `/project` and `/projects-x` do not. The root prefix owns every
 * path that no longer prefix claims.
 */
export function pathWithin(prefix: string, pathname: string) {
  const base = normalizeBase(prefix);
  const current = normalizeBase(pathname);
  if (base === "/") return true;
  return current === base || current.startsWith(`${base}/`);
}

/** Match a route pattern (`/projects/:id`) against a pathname and return its params. */
export function matchRoute(pattern: string, pathname: string): Record<string, string> | undefined {
  const expected = pattern.split("/").filter(Boolean);
  const actual = pathname.split("/").filter(Boolean);
  if (expected.length !== actual.length) return undefined;
  const params: Record<string, string> = {};
  for (const [index, segment] of expected.entries()) {
    if (segment.startsWith(":")) params[segment.slice(1)] = decodeURIComponent(actual[index]);
    else if (segment !== actual[index]) return undefined;
  }
  return params;
}

/** Fill `:params` of a pattern from a pathname, keeping the pattern for missing values. */
export function resolveRoute(pattern: string, pathname: string) {
  const params = matchRoute(pattern, pathname) ?? {};
  const known = Object.entries(params);
  void known;
  return pattern.split("/").filter(Boolean).map((segment) => {
    if (!segment.startsWith(":")) return segment;
    const name = segment.slice(1);
    return params[name] ?? segment;
  }).join("/");
}

export interface SidebarEntry extends DashboardNavigationItem { matched: boolean }
export interface SidebarState {
  section?: DashboardSection;
  entries: SidebarEntry[];
  /** Whether the current path is the page the section calls its home. */
  isLanding: boolean;
}

/**
 * Resolve the sidebar for a path. The longest matching section prefix owns the page, so
 * `/projects` and `/projects/:id` share the projects sidebar while `/store` never leaks
 * into it. Entries are returned with `matched` telling whether they point at this page;
 * patterns with parameters are compared structurally.
 */
export function resolveSidebar(
  pathname: string,
  sections: DashboardSection[],
  navigation: DashboardNavigationItem[],
): SidebarState {
  const current = normalizeBase(pathname);
  const matches = sections
    .map((section, index) => ({ section, index, base: normalizeBase(section.basePath) }))
    .filter((entry) => pathWithin(entry.base, current))
    .sort((a, b) => b.base.length - a.base.length || (a.section.order ?? 100) - (b.section.order ?? 100) || a.index - b.index);
  const section = matches[0]?.section;
  const entries = navigation
    .filter((item) => item.section === section?.id)
    .map((item) => ({ ...item, matched: Boolean(matchRoute(normalizeBase(item.path), current)) }));
  // A section lists several landing pages: its own base path and any extra `homePath`
  // entries (the project list and a single project are both "home" for projects).
  const homes = [section?.basePath ?? "/", ...(section?.homePath ? [section.homePath] : [])].map((pattern) => normalizeBase(pattern));
  return { section, entries, isLanding: homes.some((pattern) => Boolean(matchRoute(pattern, current))) };
}
