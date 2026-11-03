import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeValue {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setMode(mode: ThemeMode): void;
}

const storageKey = "theme-mode";
const ThemeContext = createContext<ThemeValue | null>(null);

function storedMode(): ThemeMode {
  try {
    const value = localStorage.getItem(storageKey);
    if (value === "light" || value === "dark" || value === "system") return value;
  } catch { /* Use the system theme when storage is unavailable. */ }
  return "system";
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(storedMode);
  const [system, setSystem] = useState<ResolvedTheme>(systemTheme);
  const resolvedTheme = mode === "system" ? system : mode;

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystem = () => setSystem(media.matches ? "dark" : "light");
    const updateStoredMode = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) setModeState(storedMode());
    };
    updateSystem();
    media.addEventListener("change", updateSystem);
    window.addEventListener("storage", updateStoredMode);
    return () => {
      media.removeEventListener("change", updateSystem);
      window.removeEventListener("storage", updateStoredMode);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  const value = useMemo<ThemeValue>(() => ({
    mode,
    resolvedTheme,
    setMode(nextMode) {
      try { localStorage.setItem(storageKey, nextMode); }
      catch { /* Keep the selected theme for this session when storage is unavailable. */ }
      setModeState(nextMode);
    },
  }), [mode, resolvedTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}
