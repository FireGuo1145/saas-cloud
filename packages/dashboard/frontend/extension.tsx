import { useEffect, useState, useSyncExternalStore, type ComponentType } from "react";
import { normalizeBase, pathWithin, resolveSidebar } from "./navigation.js";
export { normalizeBase, pathWithin, resolveSidebar } from "./navigation.js";
export type { SidebarEntry, SidebarState } from "./navigation.js";

export interface DashboardRoute { path: string; component: ComponentType; shell?: "owned" | "dashboard" }
/**
 * A sidebar. A section owns a route prefix and every navigation entry registered with
 * that section appears in its sidebar. One prefix always maps to exactly one section,
 * so pages can never fall into a different sidebar than their owner intended.
 */
export interface DashboardSection {
  id: string;
  /** Route prefix such as `/projects`; `/` covers the landing pages. */
  basePath: string;
  label?: string;
  labelKey?: string;
  /** Entry the section title links to; defaults to `basePath`. */
  homePath?: string;
  /** Back link target shown above the section entries. */
  backPath?: string;
  backLabelKey?: string;
  order?: number;
}
/**
 * A navigation entry. `section` names the sidebar section it belongs to; without one the
 * entry is a global destination listed on the landing sidebar.
 */
export interface DashboardNavigationItem {
  id: string; label: string; labelKey?: string; path: string; icon: ComponentType<{ className?: string }>;
  order?: number; section?: string;
  /** Extra visibility rule evaluated in the browser, used for administrator-only routes. */
  visible?: () => Promise<boolean> | boolean;
}
export interface DashboardTopBarItem { id: string; component: ComponentType; paths?: string[]; placement?: "start" | "end"; order?: number }
/** A component contributed into a named slot owned by another plugin. */
export interface DashboardSlotItem { slot: string; id: string; component: ComponentType<never>; order?: number }
export interface DashboardExtensionApi {
  route(route: DashboardRoute): () => void;
  /** Declare a sidebar for a route prefix. Register at most one section per prefix. */
  section(section: DashboardSection): () => void;
  navigation(item: DashboardNavigationItem): () => void;
  topBar(item: DashboardTopBarItem): () => void;
  /** Contribute a component into a slot another plugin renders. */
  slot(item: DashboardSlotItem): () => void;
}
const routes: DashboardRoute[] = [];
const sections: DashboardSection[] = [];
const navigation: DashboardNavigationItem[] = [];
const topBar: DashboardTopBarItem[] = [];
const slots: DashboardSlotItem[] = [];
const listeners = new Set<() => void>();
let revision = 0;
const notify = () => { revision += 1; listeners.forEach((listener) => listener()); };
function register<T>(items: T[], item: T) {
  items.push(item);
  notify();
  return () => { const index = items.indexOf(item); if (index >= 0) items.splice(index, 1); notify(); };
}
export const dashboardExtension: DashboardExtensionApi = {
  route: (route) => register(routes, route),
  section: (section) => {
    const normalized = { ...section, basePath: normalizeBase(section.basePath) };
    const clash = sections.find((existing) => existing.basePath === normalized.basePath && existing.id !== normalized.id);
    if (clash) throw new Error(`Sidebar section ${normalized.basePath} is already owned by "${clash.id}"`);
    const existing = sections.findIndex((entry) => entry.id === normalized.id);
    if (existing >= 0) sections[existing] = normalized; else sections.push(normalized);
    notify();
    return () => {
      const index = sections.findIndex((entry) => entry.id === normalized.id && entry === normalized);
      if (index >= 0) { sections.splice(index, 1); notify(); }
    };
  },
  navigation: (item) => register(navigation, item),
  topBar: (item) => register(topBar, item),
  slot: (item) => register(slots, item),
};
export class DashboardContext {
  private effects: Array<() => void> = [];
  constructor(private readonly api = dashboardExtension) {}
  route(route: DashboardRoute) { this.effects.push(this.api.route(route)); }
  section(section: DashboardSection) { this.effects.push(this.api.section(section)); }
  navigation(item: DashboardNavigationItem) { this.effects.push(this.api.navigation(item)); }
  topBar(item: DashboardTopBarItem) { this.effects.push(this.api.topBar(item)); }
  slot(item: DashboardSlotItem) { this.effects.push(this.api.slot(item)); }
  dispose() { for (const effect of this.effects.splice(0).reverse()) effect(); }
}
export function defineExtension(setup: (ctx: DashboardContext) => void) { return setup; }
export function registeredRoutes() { return [...routes]; }
export function registeredNavigation() { return [...navigation].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); }
export function registeredTopBar() { return [...topBar].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); }
export function registeredSlots(slot: string) { return slots.filter((item) => item.slot === slot).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); }
export function subscribeExtensions(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }
export function useRoutes() { useSyncExternalStore(subscribeExtensions, () => revision, () => revision); return registeredRoutes(); }
export function useNavigation() { useSyncExternalStore(subscribeExtensions, () => revision, () => revision); return registeredNavigation(); }
/** Sidebar sections ordered by their configured order, then registration order. */
export function registeredSections() {
  return sections
    .map((section, index) => ({ section, index }))
    .sort((a, b) => (a.section.order ?? 100) - (b.section.order ?? 100) || a.index - b.index)
    .map(({ section }) => section);
}
export function useSections() { useSyncExternalStore(subscribeExtensions, () => revision, () => revision); return registeredSections(); }
/** The sidebar owning `pathname`; the longest matching section prefix wins. */
export function sidebarState(pathname: string) { return resolveSidebar(pathname, registeredSections(), registeredNavigation()); }
export function sectionFor(pathname: string) { return sidebarState(pathname).section; }
/**
 * Navigation entries whose `visible` rule (when present) currently allows them.
 * Rules are evaluated once per registration; the dependency is the set of rule ids,
 * so resolving a rule never re-triggers the effect.
 */
export function useVisibleNavigation() {
  const items = useNavigation();
  const [allowed, setAllowed] = useState<Record<string, boolean>>({});
  const ruleIds = items.filter((item) => item.visible).map((item) => item.id).join("|");
  useEffect(() => {
    let active = true;
    for (const item of registeredNavigation()) {
      if (!item.visible || item.id in allowed) continue;
      void Promise.resolve(item.visible()).then((result) => { if (active) setAllowed((current) => ({ ...current, [item.id]: Boolean(result) })); })
        .catch(() => { if (active) setAllowed((current) => ({ ...current, [item.id]: false })); });
    }
    return () => { active = false; };
  }, [ruleIds]);
  return items.filter((item) => !item.visible || allowed[item.id]);
}
export function useTopBar() { useSyncExternalStore(subscribeExtensions, () => revision, () => revision); return registeredTopBar(); }
export function useSlot(slot: string) { useSyncExternalStore(subscribeExtensions, () => revision, () => revision); return registeredSlots(slot); }
