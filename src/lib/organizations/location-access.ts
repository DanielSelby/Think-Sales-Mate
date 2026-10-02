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

export function getPosRegisterLocation<T extends { id: string }>(
  context: CurrentOrgContext,
  locations: T[]
): T | null {
  if (context.isBranchScoped) {
    return locations.find((location) => location.id === context.locationId) ?? null;
  }

  const selectedLocation = context.masterLocationId
    ? locations.find((location) => location.id === context.masterLocationId)
    : null;
  return selectedLocation ?? locations[0] ?? null;
}
