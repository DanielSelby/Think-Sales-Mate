import {
  Briefcase, Zap, Users, Car, UtensilsCrossed, Laptop, Building2, GraduationCap,
  CreditCard, Tag, Wifi, Megaphone, Wrench, Package,
} from "lucide-react";
import type { ExpenseCategoryStatus } from "@/types/database";

export const CATEGORY_ICONS = {
  Briefcase, Zap, Users, Car, UtensilsCrossed, Laptop, Building2, GraduationCap,
  CreditCard, Tag, Wifi, Megaphone, Wrench, Package,
} as const;

export type CategoryIconKey = keyof typeof CATEGORY_ICONS;

export const CATEGORY_ICON_OPTIONS = Object.keys(CATEGORY_ICONS) as CategoryIconKey[];

export const CATEGORY_COLORS = {
  blue: { bg: "bg-blue-500", soft: "bg-blue-50 dark:bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", hex: "#3b82f6" },
  green: { bg: "bg-signal", soft: "bg-signal-soft dark:bg-signal/10", text: "text-signal", hex: "#1d8f5e" },
  amber: { bg: "bg-amber", soft: "bg-amber-soft dark:bg-amber/10", text: "text-amber", hex: "#a8781f" },
  purple: { bg: "bg-purple-500", soft: "bg-purple-50 dark:bg-purple-500/10", text: "text-purple-600 dark:text-purple-400", hex: "#a855f7" },
  pink: { bg: "bg-pink-500", soft: "bg-pink-50 dark:bg-pink-500/10", text: "text-pink-600 dark:text-pink-400", hex: "#ec4899" },
  red: { bg: "bg-alert", soft: "bg-alert-soft dark:bg-alert/10", text: "text-alert", hex: "#b8402f" },
  neutral: { bg: "bg-ledger-500", soft: "bg-ledger-100 dark:bg-white/[0.06]", text: "text-ledger-600 dark:text-ledger-300", hex: "#68655c" },
} as const;

export type CategoryColorKey = keyof typeof CATEGORY_COLORS;

export const CATEGORY_COLOR_OPTIONS = Object.keys(CATEGORY_COLORS) as CategoryColorKey[];

export const CATEGORY_STATUS_LABEL: Record<ExpenseCategoryStatus, string> = {
  active: "Active",
  inactive: "Inactive",
};

export const CATEGORY_STATUS_TONE: Record<ExpenseCategoryStatus, "signal" | "neutral"> = {
  active: "signal",
  inactive: "neutral",
};