export function getEducationInstitutionDisplayName(
  institutionName: string | null | undefined,
  organizationName: string,
) {
  return institutionName?.trim() || organizationName;
}

export function getEducationInstitutionLogoUrl(
  institutionLogoUrl: string | null | undefined,
  organizationLogoUrl: string | null | undefined,
) {
  return institutionLogoUrl?.trim() || organizationLogoUrl?.trim() || null;
}
