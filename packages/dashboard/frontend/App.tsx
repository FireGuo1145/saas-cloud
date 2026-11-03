import { BrowserRouter, Route, Routes, DashboardContext, useRoutes } from "@mirelia/dashboard/frontend";
import { useEffect, useState, type ReactNode } from "react";
import { DashboardFrame } from "./components/layout/DashboardFrame";
import "./index.css";
interface Manifest { entries?: Array<{ id: string; files: Array<{ url: string }> }> }
export default function App() {
  const routes = useRoutes();
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    const contexts: DashboardContext[] = [];
    void fetch("/api/dashboard/manifest").then((response) => response.json()).then(async (manifest: Manifest) => {
      for (const entry of manifest.entries ?? []) {
        const asset = entry.files[0];
        if (!asset) continue;
        const mod = await import(/* @vite-ignore */ asset.url) as { default?: (ctx: DashboardContext) => void; apply?: (ctx: DashboardContext) => void };
        if (!active) break;
        const context = new DashboardContext();
        (mod.default ?? mod.apply)?.(context);
        contexts.push(context);
      }
      if (active) setLoaded(true);
    }).catch((error) => console.error("Could not load dashboard plugins", error));
    return () => { active = false; contexts.forEach((context) => context.dispose()); };
  }, []);
  return <BrowserRouter>{loaded ? <Routes>{routes.map(({ path, component: Component, shell }) => {
    const page = <Component />;
    const content: ReactNode = shell === "dashboard" ? <DashboardFrame>{page}</DashboardFrame> : page;
    return <Route key={path} path={path} element={content} />;
  })}</Routes> : null}</BrowserRouter>;
}
