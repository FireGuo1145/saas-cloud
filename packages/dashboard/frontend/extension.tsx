import { useSyncExternalStore, type ComponentType } from "react";

export interface DashboardRoute { path: string; component: ComponentType; shell?: "owned" | "dashboard" }
export interface DashboardNavigationItem { id: string; label: string; path: string; icon: ComponentType<{ className?: string }>; order?: number }
export interface DashboardTopBarItem { id: string; component: ComponentType; paths?: string[] }
export interface DashboardExtensionApi {
  route(route: DashboardRoute): () => void;
  navigation(item: DashboardNavigationItem): () => void;
  topBar(item: DashboardTopBarItem): () => void;
}
const routes: DashboardRoute[] = [];
const navigation: DashboardNavigationItem[] = [];
const topBar: DashboardTopBarItem[] = [];
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
  navigation: (item) => register(navigation, item),
  topBar: (item) => register(topBar, item),
};
export class DashboardContext {
  private effects: Array<() => void> = [];
  constructor(private readonly api = dashboardExtension) {}
  route(route: DashboardRoute) { this.effects.push(this.api.route(route)); }
  navigation(item: DashboardNavigationItem) { this.effects.push(this.api.navigation(item)); }
  topBar(item: DashboardTopBarItem) { this.effects.push(this.api.topBar(item)); }
  dispose() { for (const effect of this.effects.splice(0).reverse()) effect(); }
}
export function defineExtension(setup: (ctx: DashboardContext) => void) { return setup; }
export function registeredRoutes() { return [...routes]; }
export function registeredNavigation() { return [...navigation].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); }
export function registeredTopBar() { return [...topBar]; }
export function subscribeExtensions(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }
export function useRoutes() { useSyncExternalStore(subscribeExtensions, () => revision, () => revision); return registeredRoutes(); }
export function useNavigation() { useSyncExternalStore(subscribeExtensions, () => revision, () => revision); return registeredNavigation(); }
export function useTopBar() { useSyncExternalStore(subscribeExtensions, () => revision, () => revision); return registeredTopBar(); }
