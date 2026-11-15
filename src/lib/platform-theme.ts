import type { ThemeKey } from "@/store/useAppStore";

export const PLATFORM_THEME_KEYS = [
  "green",
  "navy",
  "teal",
  "plum",
  "fintech",
  "royal",
  "harvest",
  "eclipse",
  "orangeBlack",
  "emberOnyx",
  "greenWhite",
] as const satisfies readonly ThemeKey[];

export type PlatformThemeKey = (typeof PLATFORM_THEME_KEYS)[number];
export const DEFAULT_PLATFORM_THEME_KEY: PlatformThemeKey = "green";

export function isPlatformThemeKey(value: unknown): value is PlatformThemeKey {
  return typeof value === "string" && (PLATFORM_THEME_KEYS as readonly string[]).includes(value);
}
