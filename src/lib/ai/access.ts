import type { CurrentOrgContext } from "@/lib/organizations/current";
import type { MemberRole } from "@/lib/rbac";

export function canReadAiBusinessModule(
  role: MemberRole,
  permissionMatrix: Record<string, readonly string[]>,
  module: string
): boolean {
  return role === "owner" || permissionMatrix[module]?.includes("view") === true;
}

export function aiLocationScope(
  context: Pick<CurrentOrgContext, "isBranchScoped" | "allowedLocationIds">
): string[] | undefined {
  return context.isBranchScoped ? [...context.allowedLocationIds] : undefined;
}
