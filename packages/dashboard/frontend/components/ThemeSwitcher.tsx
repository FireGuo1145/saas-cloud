import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { useI18n } from "../lib/i18n";
import { useTheme, type ThemeMode } from "../lib/theme";

const options = [
  { id: "light", icon: Sun },
  { id: "dark", icon: Moon },
  { id: "system", icon: Monitor },
] satisfies Array<{ id: ThemeMode; icon: typeof Sun }>;

export function ThemeSwitcher() {
  const { t } = useI18n();
  const { mode, resolvedTheme, setMode } = useTheme();
  const CurrentIcon = mode === "system" ? Monitor : resolvedTheme === "dark" ? Moon : Sun;

  return (
    <DropdownMenuTrigger>
      <Button type="button" variant="ghost" size="icon" aria-label={t("cloud.theme.switch")} title={t("cloud.theme.switch")}>
        <CurrentIcon />
      </Button>
      <DropdownMenu placement="bottom end" className="min-w-40" aria-label={t("cloud.theme.switch")} selectionMode="single" selectedKeys={[mode]} disallowEmptySelection>
        {options.map(({ id, icon: Icon }) => <DropdownMenuItem key={id} id={id} textValue={t(`cloud.theme.${id}`)} onAction={() => setMode(id)}>
          <Icon /><span>{t(`cloud.theme.${id}`)}</span>
        </DropdownMenuItem>)}
      </DropdownMenu>
    </DropdownMenuTrigger>
  );
}
