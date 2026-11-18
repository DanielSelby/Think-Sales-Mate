import { redirect } from "next/navigation";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import GoogleClassroomIntegration from "./google-classroom-integration";

export default async function GoogleClassroomSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  const [canEditInstitution, scope, params] = await Promise.all([
    canTabPermission("education_settings", "settings", "institution", "edit", context.orgId),
    getAccessibleEducationCampuses(context.orgId, context.userId),
    searchParams,
  ]);
  if (!canEditInstitution || !scope.hasOrganizationScope) {
    redirect("/dashboard?accessDenied=think-education.google-classroom");
  }
  const queryError = params.error;
  const error = typeof queryError !== "string" ? null
    : queryError === "google_access_denied" ? "Google authorization was cancelled. No connection was changed."
      : queryError === "invalid_state" ? "Google authorization expired or could not be validated. Restart the connection."
        : queryError === "missing_code" ? "Google did not return an authorization code. Restart the connection."
          : queryError;
  const connected = params.connected === "1";
  return <GoogleClassroomIntegration callbackError={error} justConnected={connected} />;
}
