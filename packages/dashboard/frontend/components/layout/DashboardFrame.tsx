import { Link, NavLink, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useNavigation, useTopBar } from "@mirelia/dashboard/frontend";
import { Cloud } from "lucide-react";

export function DashboardFrame({ children }: { children: ReactNode }) {
  const items = useNavigation();
  const tools = useTopBar();
  const { pathname } = useLocation();
  function matchPath(pattern: string) {
    const segments = pattern.split("/").filter(Boolean);
    const current = pathname.split("/").filter(Boolean);
    if (segments.length !== current.length) return false;
    return segments.every((part, index) => part.startsWith(":") || part === current[index]);
  }
  function resolvePath(path: string) {
    const pattern = path.split("/").filter(Boolean);
    const current = pathname.split("/").filter(Boolean);
    return `/${pattern.map((part, index) => part.startsWith(":") ? current[index] : part).join("/")}`;
  }
  const visibleTools = tools.filter(({ paths }) => !paths || paths.some(matchPath));
  const visibleItems = items.filter(({ paths }) => !paths || paths.some(matchPath));
  const navigationGroup = visibleItems.find(({ group }) => group)?.group ?? "Workspace";
  return (
    <div className="flex h-dvh min-h-[480px] flex-col overflow-hidden bg-background text-foreground">
      <header className="z-20 flex h-14 shrink-0 items-center border-b border-border bg-card">
        <Link to="/" className="flex h-full w-60 shrink-0 items-center gap-2.5 border-r border-border px-5 text-sm font-semibold text-foreground">
          <Cloud className="size-5 text-primary" />
          <span>Mirelia Cloud</span>
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-3 px-4">
          {visibleTools.map(({ id, component: Component }) => <Component key={id} />)}
        </div>
        <Link to="/account/profile" className="mr-4 grid size-8 shrink-0 place-items-center rounded-full border border-border text-xs font-medium text-muted-foreground" aria-label="Account profile">ME</Link>
      </header>
      <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-card px-3 py-1.5 sm:hidden" aria-label="Main navigation">
        {visibleItems.map(({ id, label, path, icon: Icon }) => <NavLink key={id} to={resolvePath(path)} end className={({ isActive }) => `flex h-8 shrink-0 items-center gap-2 rounded-md px-2.5 text-xs ${isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}><Icon className="size-3.5" />{label}</NavLink>)}
      </nav>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 border-r border-border bg-card px-3 py-4 sm:block">
          <div className="px-2 pb-2 text-xs font-medium uppercase text-muted-foreground">{navigationGroup}</div>
          <nav className="space-y-1" aria-label="Main navigation">
            {visibleItems.map(({ id, label, path, icon: Icon }) => (
              <NavLink
                key={id}
                to={resolvePath(path)}
                end
                className={({ isActive }) => `flex h-9 items-center gap-3 rounded-md px-2.5 text-sm transition-colors ${isActive ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{label}</span>
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
