import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Language = "zh" | "en" | "ja";
export type I18nDictionary = Record<string, Record<string, string>>;
interface I18nValue {
  language: Language;
  setLanguage(language: Language): void;
  t(key: string, values?: Record<string, string | number>): string;
}

const I18nContext = createContext<I18nValue | null>(null);
const supportedLanguages: Language[] = ["zh", "en", "ja"];

function detectLanguage(): Language {
  const saved = localStorage.getItem("language");
  if (supportedLanguages.includes(saved as Language)) return saved as Language;
  const browser = navigator.language.slice(0, 2).toLowerCase();
  return supportedLanguages.includes(browser as Language) ? browser as Language : "zh";
}

export function I18nProvider({ children, dictionary }: { children: ReactNode; dictionary: I18nDictionary }) {
  const [language, setLanguageState] = useState<Language>(() => detectLanguage());
  useEffect(() => { document.documentElement.lang = language; }, [language]);

  const value = useMemo<I18nValue>(() => ({
    language,
    setLanguage(nextLanguage) {
      if (!supportedLanguages.includes(nextLanguage)) return;
      localStorage.setItem("language", nextLanguage);
      setLanguageState(nextLanguage);
    },
    t(key, values) {
      const translations = dictionary[key];
      let output = translations?.[language] ?? translations?.en ?? translations?.zh ?? key;
      for (const [name, replacement] of Object.entries(values ?? {})) output = output.replaceAll(`{${name}}`, String(replacement));
      return output;
    },
  }), [dictionary, language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}
