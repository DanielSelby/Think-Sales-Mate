import "server-only";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPlatformAdminClient } from "@/lib/supabase/platform-admin";

export interface LoginExperience {
  themeId: string;
  themeType: "existing" | "modern-green";
  themeName: string;
  artworkUrl: string | null;
  organizationName: string | null;
}

const SYSTEM_DEFAULT: LoginExperience = {
  themeId: "default-thinksales-login",
  themeType: "existing",
  themeName: "Default ThinkSales Login",
  artworkUrl: null,
  organizationName: null,
};

function inferOrganizationSlug(host: string) {
  const hostname = host.split(":")[0].toLowerCase();
  const labels = hostname.split(".");
  if (labels.length < 3 || ["www", "global", "app"].includes(labels[0])) return null;
  return labels[0];
}

export async function getLoginExperience(requestedSlug?: string): Promise<LoginExperience> {
  try {
    const requestHeaders = await headers();
    const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
    const slug = requestedSlug?.trim().toLowerCase() || inferOrganizationSlug(host);
    const platform = createPlatformAdminClient();
    const [{ data: themes, error: themesError }, { data: globalSetting, error: globalError }] = await Promise.all([
      platform.from("login_themes").select("id, name, theme_type, is_active, preview_image"),
      platform.from("platform_settings").select("value").eq("key", "global_login_theme").maybeSingle(),
    ]);
    if (themesError) throw themesError;
    if (globalError) throw globalError;

    const activeThemes = new Map((themes ?? []).filter((theme) => theme.is_active).map((theme) => [theme.id, theme]));
    const selectedGlobalId = typeof globalSetting?.value?.theme_id === "string"
      ? globalSetting.value.theme_id
      : SYSTEM_DEFAULT.themeId;
    let selectedTheme = activeThemes.get(selectedGlobalId) ?? activeThemes.get(SYSTEM_DEFAULT.themeId);
    let organizationName: string | null = null;

    if (slug) {
      const organizationClient = createAdminClient();
      const { data: organization, error: organizationError } = await organizationClient
        .from("organizations")
        .select("id, name")
        .eq("slug", slug)
        .maybeSingle();
      if (organizationError) throw organizationError;
      if (organization) {
        organizationName = organization.name;
        const { data: assignment, error: assignmentError } = await platform
          .from("platform_organizations")
          .select("use_global_login_theme, login_theme_id")
          .eq("organization_id", organization.id)
          .maybeSingle();
        if (assignmentError) throw assignmentError;
        if (assignment && !assignment.use_global_login_theme && assignment.login_theme_id) {
          selectedTheme = activeThemes.get(assignment.login_theme_id) ?? selectedTheme;
        }
      }
    }

    if (!selectedTheme) return { ...SYSTEM_DEFAULT, organizationName };
    const themeType = selectedTheme.theme_type === "modern-green" ? "modern-green" : "existing";
    return {
      themeId: selectedTheme.id,
      themeType,
      themeName: selectedTheme.name,
      artworkUrl: selectedTheme.preview_image,
      organizationName,
    };
  } catch (error) {
    console.error("Login theme resolution failed; using the system default theme:", error);
    return SYSTEM_DEFAULT;
  }
}
