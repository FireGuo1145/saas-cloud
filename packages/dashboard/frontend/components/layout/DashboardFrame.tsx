import { Link, NavLink, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useI18n, useSections, useTopBar, useVisibleNavigation } from "@mirelia/dashboard/frontend";
import { LanguageSwitcher, ThemeSwitcher } from "@mirelia/dashboard/frontend";
import { ArrowLeft, Cloud } from "lucide-react";

export function DashboardFrame({ children }: { children: ReactNode }) {
  const items = useVisibleNavigation();
  const sections = useSections();
  const tools = useTopBar();
  const { pathname } = useLocation();
  const { t } = useI18n();
  function matchPath(pattern: string) {
    const segments = pattern.split("/").filter(Boolean);
    const current = pathname.split("/").filter(Boolean);
    if (segments.at(-1) === "*") {
      if (current.length < segments.length - 1) return false;
      return segments.slice(0, -1).every((part, index) => part.startsWith(":") || part === current[index]);
    }
    if (segments.length !== current.length) return false;
    return segments.every((part, index) => part.startsWith(":") || part === current[index]);
  }
  function resolvePath(path: string) {
    const pattern = path.split("/").filter(Boolean);
    const current = pathname.split("/").filter(Boolean);
    return `/${pattern.map((part, index) => part.startsWith(":") ? current[index] : part).join("/")}`;
  }
  const visibleTools = tools.filter(({ paths }) => !paths || paths.some(matchPath));
  const renderTool = ({ id, component: Component }: (typeof visibleTools)[number]) => <Component key={id} />;
  // The most specific section wins: a project page is part of the projects section
  // even though the store also lists it as reachable. Sections are ordered by their
  // first entry, so deeper matches are found by scanning every path of each section.
  const activeSection = sections.find((section) => items.some((item) => item.section === section.id && item.paths?.some(matchPath)));
  const sectionItems = activeSection ? items.filter((item) => item.section === activeSection.id) : [];
  // A section that lists its own entry point (the home sidebar, the store catalogue)
  // keeps that entry visible; deeper sections such as a single project do not repeat it.
  const sectionRoot = activeSection ? sectionItems.find((item) => !item.paths || item.paths.includes(item.path)) : undefined;
  const subPaths = activeSection ? sectionItems.filter((item) => item !== sectionRoot) : [];
  const repeatedEntry = Boolean(sectionRoot && sectionRoot.paths?.some(matchPath));
  const visibleItems = activeSection
    ? sectionItems.filter((item) => item !== sectionRoot || repeatedEntry)
    : items.filter((item) => !item.section && (!item.paths || item.paths.some(matchPath)));
  const sectionEntry = activeSection ? items.find((item) => item.section === activeSection.id) : undefined;
  const sectionLabel = sectionEntry ? (sectionEntry.labelKey ? t(sectionEntry.labelKey) : sectionEntry.label) : undefined;
  // The home sidebar is a set of global destinations: render it as a plain list without
  // the section heading or a back link, which would only point at itself.
  const isGlobalSection = Boolean(activeSection && sectionRoot && !subPaths.length && sectionRoot.path === "/");
  const projectMatch = pathname.match(/^\/projects\/([^/]+)/);
  const backTarget = activeSection ? `/projects/${projectMatch?.[1] ?? ""}` : "/";
  const current = pathname.split("/").filter(Boolean);
  const exactItem = visibleItems.find((item) => {
    const pattern = resolvePath(item.path).split("/").filter(Boolean);
    return pattern.length === current.length && pattern.every((part, index) => part === current[index]);
  });
  const renderItem = ({ id, label, labelKey, path, icon: Icon }: (typeof visibleItems)[number]) => (
    <NavLink
      key={id}
      to={resolvePath(path)}
      end
      className={(state) => `flex h-9 items-center gap-3 rounded-md px-2.5 text-sm transition-colors ${(exactItem ? exactItem.id === id : state.isActive) ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{labelKey ? t(labelKey) : t(label)}</span>
    </NavLink>
  );
  const backLink = (
    <Link to={backTarget} className="mb-3 flex h-9 items-center gap-2 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
      <ArrowLeft className="size-4 shrink-0" />{projectMatch ? t("cloud.project.backToList") : t("cloud.nav.backHome")}
    </Link>
  );
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
          {activeSection && !isGlobalSection && backLink}
          {!isGlobalSection && <div className="px-2 pb-2 text-xs font-medium uppercase text-muted-foreground">{sectionLabel}</div>}
          <nav className="space-y-1" aria-label={t("cloud.nav.mainNavigation")}>
            {visibleItems.map(renderItem)}
          </nav>
        </aside>
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
