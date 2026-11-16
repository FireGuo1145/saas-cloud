import type { DashboardNavigationItem, DashboardSection, DashboardSidebar } from "./extension.js";

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

/** Normalise a page pattern: drop duplicate and trailing slashes. */
export function normalizeSidebarPath(path: string) {
  const trimmed = `/${String(path ?? "").split("/").filter(Boolean).join("/")}`;
  return trimmed === "/" ? "/" : trimmed;
}

export interface SidebarEntry extends DashboardNavigationItem { matched: boolean }
export interface SidebarState {
  /** Sidebar registered for this page, if any. */
  sidebar?: DashboardSidebar;
  /** Group of pages the sidebar belongs to; supplies the heading and back link. */
  section?: DashboardSection;
  /** Entries in the order the page registered them. */
  entries: SidebarEntry[];
  params: Record<string, string>;
}

/**
 * Resolve the sidebar for a path.
 *
 * Plugins register a sidebar per page pattern; the most specific matching pattern wins.
 * A page without its own sidebar falls back to its section's base path, so a new sub page
 * still renders the group heading instead of an empty area.
 */
export function resolveSidebar(
  pathname: string,
  sections: DashboardSection[],
  sidebars: DashboardSidebar[],
  navigation: DashboardNavigationItem[],
): SidebarState {
  const current = normalizeBase(pathname);
  const matches = sidebars
    .map((sidebar) => ({ sidebar, path: normalizeSidebarPath(sidebar.path), params: matchRoute(normalizeSidebarPath(sidebar.path), current) }))
    .filter((entry): entry is { sidebar: DashboardSidebar; path: string; params: Record<string, string> } => Boolean(entry.params))
    .sort((a, b) => b.path.length - a.path.length);
  const active = matches[0];
  const section = active?.sidebar.section
    ? sections.find((entry) => entry.id === active.sidebar.section)
    : sections
      .map((section) => ({ section, base: normalizeBase(section.basePath) }))
      .filter((entry) => pathWithin(entry.base, current))
      .sort((a, b) => b.base.length - a.base.length)[0]?.section;
  const ids = active?.sidebar.items ?? [];
  const entries = ids
    .map((id) => navigation.find((item) => item.id === id))
    .filter((item): item is DashboardNavigationItem => Boolean(item))
    .map((item) => ({ ...item, matched: Boolean(matchRoute(normalizeBase(item.path), current)) }));
  return { sidebar: active?.sidebar, section, entries, params: active?.params ?? {} };
}
