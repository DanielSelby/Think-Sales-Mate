import type { CurrentOrgContext } from "./current";

/** Returns whether a location-bound record may be read or changed by a user. */
export function canAccessLocation(context: CurrentOrgContext, locationId: string | null | undefined): boolean {
  if (!context.isBranchScoped) return true;
  return Boolean(locationId && context.allowedLocationIds.includes(locationId));
}

/** Validate a submitted location before inserting or moving a record. */
export function canUseLocation(context: CurrentOrgContext, locationId: string | null | undefined): boolean {
  return canAccessLocation(context, locationId);
}
