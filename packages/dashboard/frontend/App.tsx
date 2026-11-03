import { BrowserRouter, Route, Routes, DashboardContext, I18nProvider, ThemeProvider, useRoutes, type I18nDictionary } from "@mirelia/dashboard/frontend";
import { useEffect, useState, type ReactNode } from "react";
import { DashboardFrame } from "./components/layout/DashboardFrame";
import "./index.css";
interface Manifest { entries?: Array<{ id: string; files: Array<{ url: string }> }>; i18n?: I18nDictionary }
export default function App() {
  const routes = useRoutes();
  const [loaded, setLoaded] = useState(false);
  const [dictionary, setDictionary] = useState<I18nDictionary>({});
  useEffect(() => {
    let active = true;
    const contexts: DashboardContext[] = [];
    const savedLanguage = localStorage.getItem("language");
    const browserLanguage = navigator.language.slice(0, 2).toLowerCase();
    const requestLanguage = savedLanguage || (["zh", "en", "ja"].includes(browserLanguage) ? browserLanguage : "zh");
    void fetch("/api/dashboard/manifest", { headers: { "accept-language": requestLanguage } }).then((response) => response.json()).then(async (manifest: Manifest) => {
      if (active) setDictionary(manifest.i18n ?? {});
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
  return <ThemeProvider><I18nProvider dictionary={dictionary}><BrowserRouter>{loaded ? <Routes>{routes.map(({ path, component: Component, shell }) => {
    const page = <Component />;
    const content: ReactNode = shell === "dashboard" ? <DashboardFrame>{page}</DashboardFrame> : page;
    return <Route key={path} path={path} element={content} />;
  })}</Routes> : null}</BrowserRouter></I18nProvider></ThemeProvider>;
}
