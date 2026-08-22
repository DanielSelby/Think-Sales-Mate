"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export const THEMES = {
  green: {
    name: "Forest Green",
    colors: { primary: "#004b23", primaryMid: "#005c2b", primaryLight: "#006e34", primaryPale: "#e8f5ee", accent: "#ff6700", accentLight: "rgba(255,102,0,0.15)", background: "#F2F7F4", surface: "#FFFFFF", text: "#002A14", textMuted: "#3A6B4E" },
    sidebar: { background: "#004b23", text: "#FFFFFF", textMuted: "rgba(255,255,255,0.6)", activeBackground: "rgba(255,102,0,0.18)", activeText: "#ff6700", borderColor: "rgba(255,255,255,0.12)", hoverBackground: "rgba(255,255,255,0.08)" },
    topbar: { background: "#004b23", text: "#FFFFFF" },
  },
  navy: {
    name: "Navy & Gold",
    colors: { primary: "#1B2A6B", primaryMid: "#223380", primaryLight: "#2A3D99", primaryPale: "#EEF0FA", accent: "#C9A84C", accentLight: "rgba(201,168,76,0.15)", background: "#F4F5FB", surface: "#FFFFFF", text: "#0D1540", textMuted: "#4A5490" },
    sidebar: { background: "#1B2A6B", text: "#FFFFFF", textMuted: "rgba(255,255,255,0.6)", activeBackground: "rgba(201,168,76,0.20)", activeText: "#C9A84C", borderColor: "rgba(255,255,255,0.10)", hoverBackground: "rgba(255,255,255,0.08)" },
    topbar: { background: "#1B2A6B", text: "#FFFFFF" },
  },
  teal: {
    name: "Teal & Sand",
    colors: { primary: "#006d77", primaryMid: "#00838f", primaryLight: "#0a9396", primaryPale: "#e6f5f5", accent: "#dccca3", accentLight: "rgba(220,204,163,0.20)", background: "#F4F8F8", surface: "#FFFFFF", text: "#013237", textMuted: "#3D6B6F" },
    sidebar: { background: "#006d77", text: "#FFFFFF", textMuted: "rgba(255,255,255,0.6)", activeBackground: "rgba(220,204,163,0.22)", activeText: "#dccca3", borderColor: "rgba(255,255,255,0.12)", hoverBackground: "rgba(255,255,255,0.08)" },
    topbar: { background: "#006d77", text: "#FFFFFF" },
  },
  plum: {
    name: "Plum & Blush",
    colors: { primary: "#412234", primaryMid: "#522a41", primaryLight: "#65334f", primaryPale: "#fbf3f3", accent: "#ead7d7", accentLight: "rgba(234,215,215,0.25)", background: "#F8F4F5", surface: "#FFFFFF", text: "#28141F", textMuted: "#6B4A5A" },
    sidebar: { background: "#412234", text: "#FFFFFF", textMuted: "rgba(255,255,255,0.6)", activeBackground: "rgba(234,215,215,0.22)", activeText: "#ead7d7", borderColor: "rgba(255,255,255,0.12)", hoverBackground: "rgba(255,255,255,0.08)" },
    topbar: { background: "#412234", text: "#FFFFFF" },
  },
  fintech: {
    name: "Fintech Blue",
    colors: { primary: "#153361", primaryMid: "#102B54", primaryLight: "#1E4A8A", primaryPale: "#EEF2FA", accent: "#C99A32", accentLight: "rgba(201,154,50,0.15)", background: "#F8F9FC", surface: "#FFFFFF", text: "#153361", textMuted: "#6B7280" },
    sidebar: { background: "#153361", text: "#FFFFFF", textMuted: "rgba(255,255,255,0.6)", activeBackground: "rgba(201,154,50,0.20)", activeText: "#C99A32", borderColor: "rgba(255,255,255,0.10)", hoverBackground: "rgba(255,255,255,0.08)" },
    topbar: { background: "#153361", text: "#FFFFFF" },
  },
  royal: {
    name: "Royal Blue",
    colors: { primary: "#003fbd", primaryMid: "#0048d4", primaryLight: "#0052eb", primaryPale: "#eef2ff", accent: "#FFFFFF", accentLight: "rgba(255,255,255,0.15)", background: "#F5F7FF", surface: "#FFFFFF", text: "#001a57", textMuted: "#4a5a8a" },
    sidebar: { background: "#003fbd", text: "#FFFFFF", textMuted: "rgba(255,255,255,0.6)", activeBackground: "rgba(255,255,255,0.18)", activeText: "#FFFFFF", borderColor: "rgba(255,255,255,0.12)", hoverBackground: "rgba(255,255,255,0.10)" },
    topbar: { background: "#003fbd", text: "#FFFFFF" },
  },
  harvest: {
    name: "Harvest",
    colors: { primary: "#283618", primaryMid: "#344a20", primaryLight: "#405d28", primaryPale: "#f5f7ee", accent: "#FEFAE0", accentLight: "rgba(254,250,224,0.40)", background: "#F7F8F2", surface: "#FFFFFF", text: "#1a2410", textMuted: "#4a5c35" },
    sidebar: { background: "#283618", text: "#FFFFFF", textMuted: "rgba(255,255,255,0.6)", activeBackground: "rgba(254,250,224,0.18)", activeText: "#FEFAE0", borderColor: "rgba(255,255,255,0.10)", hoverBackground: "rgba(255,255,255,0.08)" },
    topbar: { background: "#283618", text: "#FFFFFF" },
  },
  eclipse: {
    name: "Eclipse",
    colors: { primary: "#1b4332", primaryMid: "#2d6a4f", primaryLight: "#40916c", primaryPale: "#eef5f0", accent: "#95b8a0", accentLight: "rgba(149,184,160,0.20)", background: "#F3F6F4", surface: "#FFFFFF", text: "#0E2A1F", textMuted: "#4A6B57" },
    sidebar: { background: "#95b8a0", text: "#0E2A1F", textMuted: "rgba(14,42,31,0.6)", activeBackground: "rgba(27,67,50,0.18)", activeText: "#1b4332", borderColor: "rgba(14,42,31,0.12)", hoverBackground: "rgba(14,42,31,0.08)" },
    topbar: { background: "#1b4332", text: "#FFFFFF" },
  },
} as const;

export type ThemeKey = keyof typeof THEMES;

interface AppState {
  sidebarCollapsed:  boolean;
  toggleSidebar:     () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  activeOrgId:       string | null;
  setActiveOrgId:    (orgId: string) => void;
  activeTheme:       ThemeKey;
  setTheme:          (theme: ThemeKey) => void;
  commandBarOpen:    boolean;
  setCommandBarOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      sidebarCollapsed:  false,
      toggleSidebar:     () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      activeOrgId:       null,
      setActiveOrgId:    (orgId) => set({ activeOrgId: orgId }),
      activeTheme:       "fintech",
      setTheme:          (theme) => set({ activeTheme: theme }),
      commandBarOpen:    false,
      setCommandBarOpen: (open) => set({ commandBarOpen: open }),
    }),
    { name: "salesmate-ui" }
  )
);