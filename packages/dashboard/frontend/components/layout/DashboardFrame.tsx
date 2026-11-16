import { Link, NavLink, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { pathWithin, sidebarState, useI18n, useTopBar, useVisibleNavigation } from "@mirelia/dashboard/frontend";
import { LanguageSwitcher, ThemeSwitcher } from "@mirelia/dashboard/frontend";
import { ArrowLeft, Cloud } from "lucide-react";

export function DashboardFrame({ children }: { children: ReactNode }) {
  const items = useVisibleNavigation();
  const tools = useTopBar();
  const { pathname } = useLocation();
  const { t } = useI18n();

  /** Fill `:params` of an entry path from the current location. */
  function resolvePath(path: string) {
    const pattern = path.split("/").filter(Boolean);
    const current = pathname.split("/").filter(Boolean);
    return `/${pattern.map((part, index) => part.startsWith(":") ? current[index] ?? "" : part).join("/")}`;
  }
  function matchesPattern(pattern: string) {
    const segments = pattern.split("/").filter(Boolean);
    const current = pathname.split("/").filter(Boolean);
    return segments.length === current.length && segments.every((part, index) => part.startsWith(":") || part === current[index]);
  }

  // The sidebar is chosen by the route prefix of the current path; the section declares
  // which entries it shows, so /projects and /projects/2 never disagree about ownership.
  const { section, entries, isLanding } = sidebarState(pathname);
  // Visibility rules (administrator-only entries) apply on top of the section.
  const allowed = new Set(items.map((item) => item.id));
  const sectionEntries = entries.filter((entry) => allowed.has(entry.id));
  // An entry that points at the current page is redundant: the project list keeps
  // "Projects", a single project drops it.
  const visibleItems = sectionEntries.filter((entry) => !entry.matched);
  const activeId = sectionEntries.find((entry) => entry.matched)?.id;

  const visibleTools = tools.filter(({ paths }) => !paths || paths.some(matchesPattern));
  const renderTool = ({ id, component: Component }: (typeof visibleTools)[number]) => <Component key={id} />;
  const renderItem = ({ id, label, labelKey, path, icon: Icon }: (typeof visibleItems)[number]) => (
    <NavLink key={id} to={resolvePath(path)} end className={() => `flex h-9 items-center gap-3 rounded-md px-2.5 text-sm transition-colors ${activeId === id ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{labelKey ? t(labelKey) : t(label)}</span>
    </NavLink>
  );

  const sectionLabel = section ? (section.labelKey ? t(section.labelKey) : section.label) : undefined;
  const backLabel = section?.backLabelKey ? t(section.backLabelKey) : t("cloud.nav.backHome");
  void pathWithin;

  return (
    <div className="flex h-dvh min-h-[480px] flex-col overflow-hidden bg-background text-foreground">
      <header className="z-20 flex h-14 shrink-0 items-center border-b border-border bg-card">
        <Link to="/" className="flex h-full w-60 shrink-0 items-center gap-2.5 border-r border-border px-5 text-sm font-semibold text-foreground">
          <Cloud className="size-5 text-primary" />
          <span>Mirelia Cloud</span>
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-3 px-4">
          {visibleTools.filter((tool) => (tool.placement ?? "start") === "start").map(renderTool)}
        </div>
        <div className="flex shrink-0 items-center gap-1 pl-2">
          {visibleTools.filter((tool) => tool.placement === "end").map(renderTool)}
        </div>
        <ThemeSwitcher />
        <LanguageSwitcher />
        <Link to="/account/profile" className="mr-4 grid size-8 shrink-0 place-items-center rounded-full border border-border text-xs font-medium text-muted-foreground" aria-label={t("cloud.account.profile")}>ME</Link>
      </header>
      <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-card px-3 py-1.5 sm:hidden" aria-label={t("cloud.nav.mainNavigation")}>
        {visibleItems.map(({ id, label, labelKey, path, icon: Icon }) => <NavLink key={id} to={resolvePath(path)} end className={({ isActive }) => `flex h-8 shrink-0 items-center gap-2 rounded-md px-2.5 text-xs ${isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}><Icon className="size-3.5" />{labelKey ? t(labelKey) : t(label)}</NavLink>)}
      </nav>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 overflow-y-auto border-r border-border bg-card px-3 py-4 sm:block">
          {section?.backPath && !isLanding && <Link to={section.backPath} className="mb-3 flex h-9 items-center gap-2 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><ArrowLeft className="size-4 shrink-0" />{backLabel}</Link>}
          {sectionLabel && <div className="px-2 pb-2 text-xs font-medium uppercase text-muted-foreground">{sectionLabel}</div>}
          <nav className="space-y-1" aria-label={t("cloud.nav.mainNavigation")}>
            {visibleItems.map(renderItem)}
          </nav>
        </aside>
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
