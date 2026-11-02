import { useSyncExternalStore, type ComponentType } from "react";

export interface DashboardRoute { path: string; component: ComponentType; shell?: "owned" | "dashboard" }
export interface DashboardExtensionApi { route(route: DashboardRoute): () => void }
const routes: DashboardRoute[] = [];
const listeners = new Set<() => void>();
let revision = 0;
const notify = () => { revision += 1; listeners.forEach((listener) => listener()); };
export const dashboardExtension: DashboardExtensionApi = {
  route(route) { routes.push(route); notify(); return () => { const index = routes.indexOf(route); if (index >= 0) routes.splice(index, 1); notify(); }; },
};
export class DashboardContext {
  private effects: Array<() => void> = [];
  constructor(private readonly api = dashboardExtension) {}
  route(route: DashboardRoute) { this.effects.push(this.api.route(route)); }
  dispose() { for (const effect of this.effects.splice(0).reverse()) effect(); }
}
export function defineExtension(setup: (ctx: DashboardContext) => void) { return setup; }
export function registeredRoutes() { return [...routes]; }
export function subscribeExtensions(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }
export function useRoutes() { useSyncExternalStore(subscribeExtensions, () => revision, () => revision); return registeredRoutes(); }
