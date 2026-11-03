import { Check, Languages } from "lucide-react";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { useI18n, type Language } from "../lib/i18n";

const options: Array<{ id: Language; label: string }> = [
  { id: "zh", label: "简体中文" },
  { id: "en", label: "English" },
  { id: "ja", label: "日本語" },
];

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useI18n();
  return (
    <DropdownMenuTrigger>
      <Button type="button" variant="ghost" size="icon" aria-label={t("cloud.common.language")} title={t("cloud.common.language")}>
        <Languages />
      </Button>
      <DropdownMenu placement="bottom end" className="min-w-40">
        {options.map((option) => <DropdownMenuItem key={option.id} onAction={() => setLanguage(option.id)} aria-current={language === option.id ? "true" : undefined}>
          <span className="flex-1">{option.label}</span>{language === option.id && <Check className="size-4" aria-hidden="true" />}
        </DropdownMenuItem>)}
      </DropdownMenu>
    </DropdownMenuTrigger>
  );
}
