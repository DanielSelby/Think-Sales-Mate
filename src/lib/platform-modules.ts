import { NAV_ITEMS } from "@/components/nav/navigation";

export const PLATFORM_MODULES = NAV_ITEMS.map((item) => ({
  key: item.label,
  label: item.label,
  href: item.href,
}));

export type PlatformModuleKey = (typeof PLATFORM_MODULES)[number]["key"];
