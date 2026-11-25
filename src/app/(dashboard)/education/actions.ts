"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canPermission, canTabPermission } from "@/lib/rbac/permissions";
import { isOrganizationSuperAdminMember } from "@/lib/organizations/member-access";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProductAppPath } from "@/lib/product-app-routes";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getEducationRolePreset } from "@/lib/rbac/education-roles";
import { withOrganizationCapacity } from "@/lib/organizations/capacity";
import {
  createStaffAccount,
  setMemberProductRole,
  setOrganizationProductAssignments,
} from "@/app/(dashboard)/settings/organization/actions";
import { EDUCATION_COMMUNICATION_AUDIENCES } from "@/lib/education/communications";
import {
  EDUCATION_EXPENSE_CATEGORIES,
  EDUCATION_EXPENSE_PAYMENT_METHODS,
  isValidEducationExpenseDate,
} from "@/lib/education/expenses";
import { educationStudentProfileInputSchema } from "@/lib/education/student-profile";
import { educationStudentConsentInputSchema } from "@/lib/education/student-consent";
import { educationResultScoreInputSchema } from "@/lib/education/result-score";
import { educationCommunicationDraftInputSchema } from "@/lib/education/communications";
import { educationLessonAttendanceInputSchema } from "@/lib/education/lesson-attendance";
import {
  calculateEducationWeightedScore,
  educationAssessmentComponentsSchema,
  educationAssessmentComponentScoresSchema,
} from "@/lib/education/assessment-components";
import {
  educationGradeBandInputSchema,
  getEducationResultGrade,
} from "@/lib/education/grading";
import {
  getActiveEducationSubject,
  isValidEducationSubjectName,
} from "@/lib/education/subjects";
import {
  educationStudentPromotionInputSchema,
  educationStudentTransferInputSchema,
} from "@/lib/education/student-progression";
import { dispatchEducationAnnouncementDeliveries } from "@/lib/education/announcement-delivery";
import { findDuplicateEducationStudentNumberRows } from "@/lib/education/student-import";
import { isEducationFeePaymentMethod } from "@/lib/education/fee-payment-methods";

export type EducationImportEntity = "students" | "staff" | "campuses";

const EDUCATION_COMMUNICATION_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EDUCATION_STUDENT_IMAGE_BUCKET = "education-student-images";
const generateEducationRecordNumber = (prefix: "APP" | "STU" | "STF") =>
  `${prefix}-${new Date().getFullYear()}-${randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`;
const EDUCATION_STAFF_IMAGE_BUCKET = "education-staff-images";
const EDUCATION_STUDENT_IMAGE_MAX_SIZE = 5 * 1024 * 1024;
const EDUCATION_STAFF_IMAGE_MAX_SIZE = 5 * 1024 * 1024;
const EDUCATION_STUDENT_IMAGE_TYPES = {
  "image/jpeg": { extension: "jpg", signature: (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  "image/png": { extension: "png", signature: (bytes: Uint8Array) => bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a },
  "image/webp": { extension: "webp", signature: (bytes: Uint8Array) => bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP" },
} as const;

async function getEducationStudentPhoto(formData: FormData): Promise<{ file: File | null; error?: string }> {
  const value = formData.get("student_photo");
  if (value === null || typeof value === "string" || value.size === 0) return { file: null };
  if (!(value instanceof File)) return { file: null, error: "Choose a valid student photo." };
  if (value.size > EDUCATION_STUDENT_IMAGE_MAX_SIZE) {
    return { file: null, error: "Student photos must be 5 MB or smaller." };
  }
  if (!(value.type in EDUCATION_STUDENT_IMAGE_TYPES)) {
    return { file: null, error: "Student photos must be JPEG, PNG, or WebP images." };
  }
  const imageType = EDUCATION_STUDENT_IMAGE_TYPES[value.type as keyof typeof EDUCATION_STUDENT_IMAGE_TYPES];
  const header = new Uint8Array(await value.slice(0, 12).arrayBuffer());
  if (!imageType.signature(header)) return { file: null, error: "The selected file is not a valid image." };
  return { file: value };
}

async function uploadEducationStudentPhoto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  studentId: string,
  file: File,
): Promise<{ path: string } | { error: string }> {
  const imageType = EDUCATION_STUDENT_IMAGE_TYPES[file.type as keyof typeof EDUCATION_STUDENT_IMAGE_TYPES];
  if (!imageType) return { error: "Student photos must be JPEG, PNG, or WebP images." };
  const path = `${orgId}/${studentId}/${randomUUID()}.${imageType.extension}`;
  const { error } = await supabase.storage.from(EDUCATION_STUDENT_IMAGE_BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
  if (error) {
    console.error("Could not upload Think Education student photo:", error.message);
    return { error: "The student record was saved, but the photo could not be uploaded." };
  }
  return { path };
}

async function getEducationStaffPhoto(formData: FormData): Promise<{ file: File | null; error?: string }> {
  const value = formData.get("staff_photo");
  if (value === null || typeof value === "string" || value.size === 0) return { file: null };
  if (!(value instanceof File)) return { file: null, error: "Choose a valid staff photo." };
  if (value.size > EDUCATION_STAFF_IMAGE_MAX_SIZE) {
    return { file: null, error: "Staff photos must be 5 MB or smaller." };
  }
  if (!(value.type in EDUCATION_STUDENT_IMAGE_TYPES)) {
    return { file: null, error: "Staff photos must be JPEG, PNG, or WebP images." };
  }
  const imageType = EDUCATION_STUDENT_IMAGE_TYPES[value.type as keyof typeof EDUCATION_STUDENT_IMAGE_TYPES];
  const header = new Uint8Array(await value.slice(0, 12).arrayBuffer());
  if (!imageType.signature(header)) return { file: null, error: "The selected file is not a valid image." };
  return { file: value };
}

async function uploadEducationStaffPhoto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  staffId: string,
  file: File,
): Promise<{ path: string } | { error: string }> {
  const imageType = EDUCATION_STUDENT_IMAGE_TYPES[file.type as keyof typeof EDUCATION_STUDENT_IMAGE_TYPES];
  if (!imageType) return { error: "Staff photos must be JPEG, PNG, or WebP images." };
  const path = `${orgId}/${staffId}/${randomUUID()}.${imageType.extension}`;
  const { error } = await supabase.storage.from(EDUCATION_STAFF_IMAGE_BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
  if (error) {
    console.error("Could not upload Think Education staff photo:", error.message);
    return { error: "The staff profile was saved, but the photo could not be uploaded." };
  }
  return { path };
}

function educationExpenseReturnPath(pettyCash: boolean, query?: string) {
  const path = getProductAppPath("think-education", pettyCash ? "/accounting/petty-cash" : "/expenses");
  return query ? `${path}?${query}&notice_id=${randomUUID()}` : path;
}

function isValidEducationStaffDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === value
    && value <= new Date().toISOString().slice(0, 10);
}

function isValidEducationISODate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

async function syncEducationResultGrade(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  resultId: string,
  score: number,
  maximumScore: number,
  gradeOverride: string,
) {
  const { data: bandRows, error: bandError } = await supabase.from("education_grade_bands")
    .select("label, minimum_percentage")
    .eq("org_id", orgId)
    .order("minimum_percentage");
  if (bandError) {
    const missingTableCode = bandError.code ?? "";
    if (missingTableCode === "42P01" || missingTableCode === "42703") return;
    throw new Error(`Could not load Think Education grade bands: ${bandError.message}`);
  }

  const bands = (bandRows ?? []).map((band) => ({
    label: band.label,
    minimumPercentage: Number(band.minimum_percentage),
  }));
  const computedGrade = getEducationResultGrade(gradeOverride, score, maximumScore, bands);
  if (computedGrade === null) return;

  const { error: updateError } = await supabase.from("education_results")
    .update({
      grade: computedGrade,
      grade_override: gradeOverride.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("org_id", orgId)
    .eq("id", resultId);

  if (updateError) {
    console.error("Could not sync Think Education result grade:", updateError.message);
    throw new Error(`The result grade could not be synced: ${updateError.message}`);
  }
}

export async function grantOwnEducationOrganizationScope() {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (context.role !== "owner") {
    throw new Error("Only an organization owner can grant organization-wide Think Education access.");
  }
  if (!await canTabPermission("education_user_management", "users", "branch_access", "edit")) {
    throw new Error("You do not have permission to manage Think Education campus access.");
  }

  const supabase = await createClient();
  const { data: existingScope, error: scopeError } = await supabase
    .from("education_member_branch_scopes")
    .select("org_id")
    .eq("org_id", context.orgId)
    .eq("user_id", context.userId)
    .eq("scope_type", "organization")
    .maybeSingle();
  if (scopeError) throw new Error(`Could not verify existing Think Education access: ${scopeError.message}`);
  if (existingScope) redirect(getProductAppPath("think-education", "/dashboard"));

  const { error: insertError } = await supabase.from("education_member_branch_scopes").insert({
    org_id: context.orgId,
    user_id: context.userId,
    scope_type: "organization",
    granted_by: context.userId,
  });
  if (insertError) throw new Error(`Could not grant organization-wide Think Education access: ${insertError.message}`);

  revalidatePath("/education");
  redirect(getProductAppPath("think-education", "/dashboard"));
}

export async function grantEducationMemberBranchScope(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_user_management", "users", "branch_access", "edit")) {
    throw new Error("You do not have permission to manage Think Education campus access.");
  }

  const userId = String(formData.get("user_id") ?? "");
  const scopeType = String(formData.get("scope_type") ?? "");
  const branchId = String(formData.get("branch_id") ?? "");
  if (!userId || (scopeType !== "organization" && scopeType !== "branch")) {
    redirect(`${getProductAppPath("think-education", "/settings/users")}?error=invalid`);
  }

  const { campuses, hasOrganizationScope } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (scopeType === "organization" && (!hasOrganizationScope || branchId)) {
    throw new Error("Only a member with organization-wide Think Education access can grant that scope.");
  }
  if (scopeType === "branch" && !campuses.some((campus) => campus.id === branchId)) {
    throw new Error("You can only grant campus access within your assigned Think Education campuses.");
  }

  const supabase = await createClient();
  const { data: member, error: memberError } = await supabase.from("organization_members")
    .select("user_id")
    .eq("org_id", context.orgId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (memberError) throw new Error(`Could not verify the Think Education member: ${memberError.message}`);
  if (!member) redirect(`${getProductAppPath("think-education", "/settings/users")}?error=invalid`);

  const { error } = await supabase.from("education_member_branch_scopes").insert({
    org_id: context.orgId,
    user_id: userId,
    scope_type: scopeType,
    branch_id: scopeType === "branch" ? branchId : null,
    granted_by: context.userId,
  });
  if (error) {
    if (error.code === "23505") redirect(`${getProductAppPath("think-education", "/settings/users")}?error=duplicate`);
    console.error("Could not grant Think Education campus access:", error.message);
    redirect(`${getProductAppPath("think-education", "/settings/users")}?error=save`);
  }
  revalidatePath("/education/settings/users");
  redirect(`${getProductAppPath("think-education", "/settings/users")}?updated=1`);
}

export async function revokeEducationMemberBranchScope(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_user_management", "users", "branch_access", "edit")) {
    throw new Error("You do not have permission to manage Think Education campus access.");
  }

  const userId = String(formData.get("user_id") ?? "");
  const scopeType = String(formData.get("scope_type") ?? "");
  const branchId = String(formData.get("branch_id") ?? "");
  if (!userId || (scopeType !== "organization" && scopeType !== "branch")
    || (scopeType === "organization" && branchId)
    || (scopeType === "branch" && !branchId)) {
    redirect(`${getProductAppPath("think-education", "/settings/users")}?error=invalid`);
  }
  if (scopeType === "organization" && userId === context.userId) {
    throw new Error("You cannot revoke your own organization-wide Think Education access.");
  }

  const { campuses, hasOrganizationScope } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (scopeType === "organization" && context.role !== "owner") {
    throw new Error("Only an organization owner can revoke organization-wide Think Education access.");
  }
  if (scopeType === "branch" && !hasOrganizationScope && !campuses.some((campus) => campus.id === branchId)) {
    throw new Error("You can only revoke campus access within your assigned Think Education campuses.");
  }

  const supabase = await createClient();
  let query = supabase.from("education_member_branch_scopes").delete()
    .eq("org_id", context.orgId)
    .eq("user_id", userId)
    .eq("scope_type", scopeType);
  query = scopeType === "branch" ? query.eq("branch_id", branchId) : query.is("branch_id", null);
  const { data, error } = await query.select("user_id").maybeSingle();
  if (error) {
    console.error("Could not revoke Think Education campus access:", error.message);
    redirect(`${getProductAppPath("think-education", "/settings/users")}?error=save`);
  }
  if (!data) redirect(`${getProductAppPath("think-education", "/settings/users")}?error=not-found`);
  revalidatePath("/education/settings/users");
  redirect(`${getProductAppPath("think-education", "/settings/users")}?updated=1`);
}

export async function saveEducationInstitutionSettings(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");

  const supabase = await createClient();
  const { hasOrganizationScope } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!hasOrganizationScope) {
    throw new Error("Institution settings require explicit organization-wide Think Education access.");
  }

  const institutionName = String(formData.get("institution_name") ?? "").trim();
  const institutionCode = String(formData.get("institution_code") ?? "").trim().toUpperCase();
  const institutionType = String(formData.get("institution_type") ?? "");
  const terminologyKeys = ["student", "staff", "class", "academic_year"] as const;
  const terminology = Object.fromEntries(terminologyKeys.map((key) => [
    key,
    String(formData.get(`terminology_${key}`) ?? "").trim(),
  ]));
  const allowedTypes = [
    "basic", "primary", "junior_high", "senior_high", "college", "university",
    "technical_vocational", "training", "multi_level", "other",
  ];
  if (!institutionName || institutionName.length > 160 || !/^[A-Z0-9._/-]{1,32}$/.test(institutionCode)
    || !allowedTypes.includes(institutionType)
    || Object.values(terminology).some((value) => value.length > 40)) {
    redirect(`${getProductAppPath("think-education", "/settings")}?error=invalid`);
  }

  const { data: existing, error: existingError } = await supabase.from("education_institution_settings")
    .select("org_id")
    .eq("org_id", context.orgId)
    .maybeSingle();
  if (existingError) throw new Error(`Could not load institution settings: ${existingError.message}`);

  const action = existing ? "edit" : "create";
  if (!await canTabPermission("education_settings", "settings", "institution", action)
    || !await canTabPermission("education_settings", "settings", "institution", "edit")) {
    throw new Error(`You need ${action} and edit access to save Think Education institution settings.`);
  }

  const values = {
    org_id: context.orgId,
    institution_name: institutionName,
    institution_code: institutionCode,
    institution_type: institutionType as "basic" | "primary" | "junior_high" | "senior_high" | "college" | "university" | "technical_vocational" | "training" | "multi_level" | "other",
    terminology,
    updated_by: context.userId,
    updated_at: new Date().toISOString(),
  };
  const result = existing
    ? await supabase.from("education_institution_settings").update(values).eq("org_id", context.orgId)
    : await supabase.from("education_institution_settings").insert(values);
  if (result.error) {
    console.error("Could not save Think Education institution settings:", result.error.message);
    redirect(`${getProductAppPath("think-education", "/settings")}?error=save`);
  }
  revalidatePath("/education/settings");
  redirect(`${getProductAppPath("think-education", "/settings")}?updated=1`);
}

export async function uploadEducationInstitutionLogo(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");

  const { hasOrganizationScope } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!hasOrganizationScope) {
    throw new Error("Institution logos require explicit organization-wide Think Education access.");
  }
  if (!await canTabPermission("education_settings", "settings", "institution", "edit")) {
    throw new Error("You need edit access to upload the Think Education institution logo.");
  }

  const supabase = await createClient();
  const { data: institution, error: institutionError } = await supabase.from("education_institution_settings")
    .select("org_id")
    .eq("org_id", context.orgId)
    .maybeSingle();
  if (institutionError) throw new Error(`Could not load institution settings: ${institutionError.message}`);
  const settingsPath = getProductAppPath("think-education", "/settings");
  if (!institution) redirect(`${settingsPath}?logo=save-settings-first`);

  const file = formData.get("institution_logo");
  if (!(file instanceof File) || file.size === 0) redirect(`${settingsPath}?logo=invalid`);
  if (file.size > 2 * 1024 * 1024) redirect(`${settingsPath}?logo=too-large`);

  const imageTypes = {
    "image/jpeg": {
      isValid: (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
    },
    "image/png": {
      isValid: (bytes: Uint8Array) => bytes.length >= 8
        && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
        && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a,
    },
    "image/webp": {
      isValid: (bytes: Uint8Array) => bytes.length >= 12
        && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
        && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP",
    },
  } as const;
  if (!(file.type in imageTypes)) redirect(`${settingsPath}?logo=invalid`);
  const imageType = imageTypes[file.type as keyof typeof imageTypes];
  if (!imageType.isValid(new Uint8Array(await file.slice(0, 12).arrayBuffer()))) {
    redirect(`${settingsPath}?logo=invalid`);
  }

  const logoPath = `${context.orgId}/institution-logo`;
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage.from("education-institution-logos").upload(logoPath, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: true,
  });
  if (uploadError) {
    console.error("Could not upload Think Education institution logo:", uploadError.message);
    redirect(`${settingsPath}?logo=error`);
  }

  const { data: publicUrl } = admin.storage.from("education-institution-logos").getPublicUrl(logoPath);
  const logoUrl = `${publicUrl.publicUrl}?v=${Date.now()}`;
  const { error } = await supabase.from("education_institution_settings")
    .update({
      institution_logo_url: logoUrl,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("org_id", context.orgId);
  if (error) {
    console.error("Could not save Think Education institution logo:", error.message);
    redirect(`${settingsPath}?logo=error`);
  }

  revalidatePath("/education/settings");
  revalidatePath("/education");
  redirect(`${settingsPath}?logo=updated`);
}

export async function clearEducationInstitutionLogo() {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");

  const { hasOrganizationScope } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!hasOrganizationScope) {
    throw new Error("Institution logos require explicit organization-wide Think Education access.");
  }
  if (!await canTabPermission("education_settings", "settings", "institution", "edit")) {
    throw new Error("You need edit access to change the Think Education institution logo.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("education_institution_settings")
    .update({
      institution_logo_url: null,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("org_id", context.orgId);
  if (error) {
    console.error("Could not clear Think Education institution logo:", error.message);
    redirect(`${getProductAppPath("think-education", "/settings")}?logo=error`);
  }

  revalidatePath("/education/settings");
  revalidatePath("/education");
  redirect(`${getProductAppPath("think-education", "/settings")}?logo=cleared`);
}

export async function createEducationFeeCharge(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_finance", "finance", "charges", "create")) {
    throw new Error("You do not have permission to create Think Education fee charges.");
  }
  if (!await canTabPermission("education_students", "students", "list", "view")
    || !await canTabPermission("education_academics", "academics", "calendar", "view")) {
    throw new Error("Student directory and academic calendar access are required to create fee charges.");
  }

  const branchId = String(formData.get("branch_id") ?? "");
  const studentId = String(formData.get("student_id") ?? "");
  const academicYearId = String(formData.get("academic_year_id") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const amountText = String(formData.get("amount") ?? "").trim();
  const dueOn = String(formData.get("due_on") ?? "").trim();
  const amount = Number(amountText);
  if (!branchId || !studentId || !academicYearId || !description || description.length > 160
    || !/^\d{1,10}(?:\.\d{1,2})?$/.test(amountText) || !Number.isFinite(amount) || amount <= 0
    || (dueOn && (!/^\d{4}-\d{2}-\d{2}$/.test(dueOn) || Number.isNaN(Date.parse(`${dueOn}T00:00:00Z`))))) {
    redirect(`${getProductAppPath("think-education", "/finance")}?error=invalid`);
  }

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === branchId)) {
    throw new Error("You cannot create fee charges outside your assigned Think Education campuses.");
  }

  const supabase = await createClient();
  const { data: academicYear, error: yearError } = await supabase.from("education_academic_years")
    .select("id, status")
    .eq("org_id", context.orgId)
    .eq("id", academicYearId)
    .maybeSingle();
  if (yearError) throw new Error(`Could not verify the selected academic year: ${yearError.message}`);
  if (!academicYear || !["planned", "active"].includes(academicYear.status)) {
    redirect(`${getProductAppPath("think-education", "/finance")}?error=invalid`);
  }
  const { data: student, error: studentError } = await supabase.from("education_students")
    .select("id")
    .eq("org_id", context.orgId)
    .eq("branch_id", branchId)
    .eq("id", studentId)
    .eq("status", "active")
    .maybeSingle();
  if (studentError) throw new Error(`Could not verify the selected student: ${studentError.message}`);
  if (!student) redirect(`${getProductAppPath("think-education", "/finance")}?error=invalid`);

  const { error } = await supabase.from("education_fee_charges").insert({
    org_id: context.orgId,
    branch_id: branchId,
    student_id: studentId,
    academic_year_id: academicYearId,
    description,
    amount,
    due_on: dueOn || null,
  });
  if (error) {
    if (error.code === "23514") redirect(`${getProductAppPath("think-education", "/finance")}?error=accounting-mapping`);
    if (error.message.includes("open fiscal period")) redirect(`${getProductAppPath("think-education", "/finance")}?error=accounting-period`);
    console.error("Could not create Think Education fee charge:", error.message);
    redirect(`${getProductAppPath("think-education", "/finance")}?error=save`);
  }
  revalidatePath("/education/finance");
  revalidatePath("/education/accounting");
  revalidatePath("/education/accounting/journal-entries");
  revalidatePath("/education/accounting/general-ledger");
  revalidatePath("/education/accounting/reports");
  redirect(`${getProductAppPath("think-education", "/finance")}?created=1`);
}

export async function recordEducationFeePayment(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_finance", "finance", "payments", "create")) {
    throw new Error("You do not have permission to record Think Education fee payments.");
  }

  const chargeId = String(formData.get("charge_id") ?? "");
  const requestedStudentId = String(formData.get("student_id") ?? "");
  const returnTo = String(formData.get("return_to") ?? "");
  const returnToFinance = returnTo === "finance" || returnTo === "payments";
  const amountText = String(formData.get("amount") ?? "").trim();
  const paymentMethod = String(formData.get("payment_method") ?? "");
  const reference = String(formData.get("reference") ?? "").trim();
  const amount = Number(amountText);
  const supabase = await createClient();
  let returnStudentId = "";
  if (!returnToFinance && EDUCATION_COMMUNICATION_UUID_PATTERN.test(requestedStudentId) && chargeId) {
    const { data: charge, error: chargeError } = await supabase.from("education_fee_charges")
      .select("student_id, branch_id")
      .eq("org_id", context.orgId)
      .eq("id", chargeId)
      .maybeSingle();
    if (chargeError) throw new Error(`Could not verify the student fee charge: ${chargeError.message}`);
    if (charge?.student_id === requestedStudentId) {
      const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
      if (campuses.some((campus) => campus.id === charge.branch_id)) returnStudentId = requestedStudentId;
    }
  }
  const financePath = getProductAppPath("think-education", "/finance");
  const paymentsPath = getProductAppPath("think-education", "/finance/payments");
  const returnPath = (error?: string) => {
    const path = returnStudentId
      ? getProductAppPath("think-education", `/students/${returnStudentId}`)
      : returnTo === "payments" ? paymentsPath : financePath;
    const query = new URLSearchParams(returnStudentId ? { tab: "fees" } : {});
    if (error) query.set("error", error);
    const queryString = query.toString();
    return queryString ? `${path}?${queryString}` : path;
  };
  if (!chargeId || !/^\d{1,10}(?:\.\d{1,2})?$/.test(amountText) || !Number.isFinite(amount)
    || amount <= 0 || !isEducationFeePaymentMethod(paymentMethod) || reference.length > 120) {
    redirect(returnPath("invalid"));
  }

  const { error } = await supabase.rpc("education_record_fee_payment", {
    p_org_id: context.orgId,
    p_charge_id: chargeId,
    p_amount: amount,
    p_payment_method: paymentMethod,
    p_reference: reference || null,
  });
  if (error) {
    if (error.code === "23514") redirect(returnPath("accounting-mapping"));
    if (error.message.includes("open fiscal period")) redirect(returnPath("accounting-period"));
    if (error.code === "22023") redirect(returnPath("payment"));
    if (error.code === "P0002") redirect(returnPath("not-found"));
    if (error.code === "42501") throw new Error("You are not authorized to record a payment for this charge.");
    console.error("Could not record Think Education fee payment:", error.message);
    redirect(returnPath("save"));
  }
  revalidatePath("/education/finance");
  revalidatePath("/education/accounting");
  revalidatePath("/education/accounting/journal-entries");
  revalidatePath("/education/accounting/general-ledger");
  revalidatePath("/education/accounting/cashbook");
  revalidatePath("/education/accounting/reports");
  if (returnStudentId) revalidatePath(`/education/students/${returnStudentId}`);
  const successPath = returnPath();
  redirect(`${successPath}${successPath.includes("?") ? "&" : "?"}paid=1`);
}

type EducationPortalCredentialActionResult = {
  success?: boolean;
  error?: string;
  email?: string;
  temporaryPassword?: string;
  warning?: string;
};

export async function createEducationGuardianLink(
  formData: FormData,
): Promise<EducationPortalCredentialActionResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { error: "Session expired. Sign in again." };
  const canProvisionPortalAccounts = isOrganizationSuperAdminMember({
    role: context.role,
    userId: context.userId,
    accessPermissions: context.accessPermissions,
  });
  if (!await canTabPermission("education_guardians", "guardians", "directory", "create")
    || !await canTabPermission("education_students", "students", "list", "view")) {
    return { error: "Guardian creation requires guardian create and student directory view access." };
  }

  const studentId = String(formData.get("student_id") ?? "");
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const relationship = String(formData.get("relationship") ?? "").trim();
  const isPrimary = formData.get("is_primary") === "on";
  if (!studentId || !firstName || firstName.length > 100 || !lastName || lastName.length > 100
    || (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))
    || phone.length > 40 || !relationship || relationship.length > 60) {
    return { error: "Check the student, guardian name, email, phone, and relationship fields." };
  }

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusIds = campuses.map((campus) => campus.id);
  if (!campusIds.length) return { error: "You need an assigned Think Education campus to create guardian relationships." };
  const admin = email && canProvisionPortalAccounts ? createAdminClient() : null;
  if (admin) {
    const { data: existingGuardian, error: existingGuardianError } = await admin.from("education_guardians")
      .select("id")
      .eq("org_id", context.orgId)
      .ilike("email", email.replace(/[\\%_]/g, "\\$&"))
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (existingGuardianError) return { error: `Could not check for an existing guardian profile: ${existingGuardianError.message}` };
    if (existingGuardian) return { error: "A guardian profile already uses this email. Use the existing guardian profile to link another student." };
  }
  const supabase = await createClient();
  const { data: student, error: studentError } = await supabase.from("education_students")
    .select("id, branch_id")
    .eq("org_id", context.orgId)
    .eq("id", studentId)
    .in("branch_id", campusIds)
    .eq("status", "active")
    .maybeSingle();
  if (studentError) return { error: `Could not verify the selected student: ${studentError.message}` };
  if (!student) return { error: "The selected student is not available at your assigned campus." };

  const { data: relationshipId, error } = await supabase.rpc("education_create_guardian_link", {
    p_org_id: context.orgId,
    p_branch_id: student.branch_id,
    p_student_id: studentId,
    p_first_name: firstName,
    p_last_name: lastName,
    p_email: email || null,
    p_phone: phone || null,
    p_relationship: relationship,
    p_is_primary: isPrimary,
  });
  if (error) {
    if (error.code === "23505") return { error: "This guardian relationship already exists." };
    if (error.code === "22023") return { error: "Check the student, guardian name, email, phone, and relationship fields." };
    if (error.code === "42501") return { error: "You are not authorized to create guardian relationships at this campus." };
    console.error("Could not create Think Education guardian relationship:", error.message);
    return { error: "The guardian relationship could not be created. Please try again." };
  }

  let temporaryPassword: string | undefined;
  if (admin) {
    const { data: link, error: linkError } = await admin.from("education_student_guardians")
      .select("guardian_id")
      .eq("org_id", context.orgId)
      .eq("id", String(relationshipId))
      .single();
    if (linkError || !link) {
      console.error("Could not find the new Think Education guardian relationship:", linkError?.message);
      const { error: cleanupError } = await admin.from("education_student_guardians")
        .delete().eq("org_id", context.orgId).eq("id", String(relationshipId));
      if (cleanupError) console.error("Could not clean up the new guardian relationship:", cleanupError.message);
      return { error: "The guardian link could not be prepared for portal access. Please try again." };
    }

    temporaryPassword = `${randomBytes(20).toString("hex")}Aa1!`;
    const portalAccount = await setEducationPortalTemporaryPassword({
      admin,
      email,
      fullName: `${firstName} ${lastName}`,
      password: temporaryPassword,
      userId: null,
    });
    if (!portalAccount.userId) {
      const { error: relationshipCleanupError } = await admin.from("education_student_guardians")
        .delete().eq("org_id", context.orgId).eq("id", String(relationshipId));
      const { error: guardianCleanupError } = await admin.from("education_guardians")
        .delete().eq("org_id", context.orgId).eq("id", link.guardian_id);
      if (relationshipCleanupError || guardianCleanupError) {
        console.error("Could not clean up the guardian link after account creation failed:", relationshipCleanupError?.message ?? guardianCleanupError?.message);
      }
      return { error: portalAccount.error ?? "The guardian relationship could not be saved with a portal account. Please try again." };
    }

    const { data: linkedGuardian, error: guardianUpdateError } = await admin.from("education_guardians")
      .update({ user_id: portalAccount.userId, updated_at: new Date().toISOString() })
      .eq("org_id", context.orgId)
      .eq("id", link.guardian_id)
      .is("user_id", null)
      .select("id")
      .maybeSingle();
    if (guardianUpdateError || !linkedGuardian) {
      const { error: authCleanupError } = portalAccount.created
        ? await admin.auth.admin.deleteUser(portalAccount.userId)
        : { error: null };
      const { error: relationshipCleanupError } = await admin.from("education_student_guardians")
        .delete().eq("org_id", context.orgId).eq("id", String(relationshipId));
      const { error: guardianCleanupError } = await admin.from("education_guardians")
        .delete().eq("org_id", context.orgId).eq("id", link.guardian_id);
      if (authCleanupError || relationshipCleanupError || guardianCleanupError) {
        console.error("Could not clean up the guardian link after account linking failed:", authCleanupError?.message ?? relationshipCleanupError?.message ?? guardianCleanupError?.message);
      }
      if (guardianUpdateError) console.error("Could not link the Think Education guardian account:", guardianUpdateError.message);
      return { error: "The guardian portal account could not be linked. Please try again." };
    }
  }

  revalidatePath("/education/guardians");
  return {
    success: true,
    email: email || undefined,
    temporaryPassword,
    warning: !email
      ? "No email was provided, so a guardian portal account was not created."
      : canProvisionPortalAccounts ? undefined : "Ask an organization owner or super administrator to issue this guardian's portal password.",
  };
}

export async function linkEducationGuardianToStudent(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_guardians", "guardians", "directory", "create")
    || !await canTabPermission("education_students", "students", "list", "view")) {
    throw new Error("Guardian relationship creation requires guardian create and student directory view access.");
  }

  const guardianId = String(formData.get("guardian_id") ?? "");
  const studentId = String(formData.get("student_id") ?? "");
  const relationship = String(formData.get("relationship") ?? "").trim();
  if (!guardianId || !studentId || !relationship || relationship.length > 60) {
    redirect(`${getProductAppPath("think-education", "/guardians")}?error=invalid`);
  }

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusIds = campuses.map((campus) => campus.id);
  if (!campusIds.length) throw new Error("You need an assigned Think Education campus to link a guardian.");
  const supabase = await createClient();
  const { data: student, error: studentError } = await supabase.from("education_students")
    .select("id, branch_id")
    .eq("org_id", context.orgId)
    .eq("id", studentId)
    .in("branch_id", campusIds)
    .eq("status", "active")
    .maybeSingle();
  if (studentError) throw new Error(`Could not verify the selected student: ${studentError.message}`);
  if (!student) redirect(`${getProductAppPath("think-education", "/guardians")}?error=invalid`);

  const { data: relationshipId, error } = await supabase.rpc("education_link_existing_guardian", {
    p_org_id: context.orgId,
    p_branch_id: student.branch_id,
    p_student_id: studentId,
    p_guardian_id: guardianId,
    p_relationship: relationship,
  });
  if (error) {
    if (error.code === "23505") redirect(`${getProductAppPath("think-education", "/guardians")}?error=duplicate`);
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/guardians")}?error=invalid`);
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/guardians")}?error=not-found`);
    if (error.code === "42501") throw new Error("You are not authorized to link this guardian at the selected campus.");
    console.error("Could not link existing Think Education guardian:", error.message);
    redirect(`${getProductAppPath("think-education", "/guardians")}?error=save`);
  }
  revalidatePath("/education/guardians");
  redirect(`${getProductAppPath("think-education", "/guardians")}?linked=1&relationship_id=${encodeURIComponent(String(relationshipId))}`);
}

export async function verifyEducationGuardianLink(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_guardians", "guardians", "relationships", "edit")) {
    throw new Error("You do not have permission to verify Think Education guardian relationships.");
  }
  const relationshipId = String(formData.get("relationship_id") ?? "");
  if (!relationshipId) redirect(`${getProductAppPath("think-education", "/guardians")}?error=invalid`);

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_verify_guardian_link", {
    p_org_id: context.orgId,
    p_relationship_id: relationshipId,
  });
  if (error) {
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/guardians")}?error=verify-blocked`);
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/guardians")}?error=not-found`);
    if (error.code === "42501") throw new Error("You are not authorized to verify this relationship at its campus.");
    console.error("Could not verify Think Education guardian relationship:", error.message);
    redirect(`${getProductAppPath("think-education", "/guardians")}?error=save`);
  }
  revalidatePath("/education/guardians");
  redirect(`${getProductAppPath("think-education", "/guardians")}?verified=1`);
}

export async function saveEducationGuardianRecord(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_guardians", "guardians", "directory", "edit")
    || !await canTabPermission("education_guardians", "guardians", "relationships", "edit")) {
    throw new Error("You do not have permission to edit Think Education guardian records.");
  }

  const relationshipId = String(formData.get("relationship_id") ?? "");
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const relationship = String(formData.get("relationship") ?? "").trim();
  if (!relationshipId || !firstName || firstName.length > 100 || !lastName || lastName.length > 100
    || email.length > 254 || phone.length > 40 || relationship.length < 1 || relationship.length > 60
    || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    redirect(`${getProductAppPath("think-education", "/guardians")}?error=invalid`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_update_guardian_relationship", {
    p_org_id: context.orgId,
    p_relationship_id: relationshipId,
    p_first_name: firstName,
    p_last_name: lastName,
    p_email: email || null,
    p_phone: phone || null,
    p_relationship: relationship,
    p_is_primary: formData.get("is_primary") === "on",
  });
  if (error) {
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/guardians")}?error=invalid`);
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/guardians")}?error=not-found`);
    if (error.code === "42501") throw new Error("You are not authorized to edit this guardian relationship.");
    console.error("Could not save Think Education guardian record:", error.message);
    redirect(`${getProductAppPath("think-education", "/guardians")}?error=save`);
  }

  revalidatePath("/education/guardians");
  revalidatePath("/education/students");
  redirect(`${getProductAppPath("think-education", "/guardians")}?updated=1&relationship_id=${encodeURIComponent(relationshipId)}`);
}

export async function deleteEducationGuardianRecord(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  const deleteMode = String(formData.get("delete_mode") ?? "");
  const supabase = await createClient();

  if (deleteMode === "relationship") {
    if (!await canTabPermission("education_guardians", "guardians", "relationships", "delete")) {
      throw new Error("You do not have permission to remove Think Education guardian relationships.");
    }
    const relationshipId = String(formData.get("relationship_id") ?? "");
    if (!relationshipId) redirect(`${getProductAppPath("think-education", "/guardians")}?error=invalid`);
    const { error } = await supabase.rpc("education_delete_guardian_relationship", {
      p_org_id: context.orgId,
      p_relationship_id: relationshipId,
    });
    if (error) {
      if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/guardians")}?error=not-found`);
      if (error.code === "42501") throw new Error("You are not authorized to remove this guardian relationship.");
      console.error("Could not remove Think Education guardian relationship:", error.message);
      redirect(`${getProductAppPath("think-education", "/guardians")}?error=save`);
    }
    revalidatePath("/education/guardians");
    revalidatePath("/education/students");
    redirect(`${getProductAppPath("think-education", "/guardians")}?deleted=relationship`);
  }

  if (deleteMode === "guardian") {
    if (!await canTabPermission("education_guardians", "guardians", "directory", "delete")) {
      throw new Error("You do not have permission to delete Think Education guardian profiles.");
    }
    const guardianId = String(formData.get("guardian_id") ?? "");
    if (!guardianId) redirect(`${getProductAppPath("think-education", "/guardians")}?error=invalid`);
    const { error } = await supabase.rpc("education_delete_guardian_profile", {
      p_org_id: context.orgId,
      p_guardian_id: guardianId,
    });
    if (error) {
      if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/guardians")}?error=not-found`);
      if (error.code === "42501") throw new Error("You need delete access to every campus linked to this guardian.");
      if (error.code === "23503") redirect(`${getProductAppPath("think-education", "/guardians")}?error=linked-payment`);
      console.error("Could not delete Think Education guardian profile:", error.message);
      redirect(`${getProductAppPath("think-education", "/guardians")}?error=save`);
    }
    revalidatePath("/education/guardians");
    revalidatePath("/education/students");
    redirect(`${getProductAppPath("think-education", "/guardians")}?deleted=guardian`);
  }

  redirect(`${getProductAppPath("think-education", "/guardians")}?error=invalid`);
}

export async function voidEducationFeeCharge(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_finance", "finance", "charges", "edit")) {
    throw new Error("You do not have permission to void Think Education fee charges.");
  }

  const chargeId = String(formData.get("charge_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!chargeId || reason.length < 3 || reason.length > 500) {
    redirect(`${getProductAppPath("think-education", "/finance")}?error=void-invalid`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_void_unpaid_fee_charge", {
    p_org_id: context.orgId,
    p_charge_id: chargeId,
    p_reason: reason,
  });
  if (error) {
    if (error.message.includes("open fiscal period")) redirect(`${getProductAppPath("think-education", "/finance")}?error=accounting-period`);
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/finance")}?error=void-blocked`);
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/finance")}?error=not-found`);
    if (error.code === "42501") throw new Error("You are not authorized to void fee charges at this campus.");
    console.error("Could not void Think Education fee charge:", error.message);
    redirect(`${getProductAppPath("think-education", "/finance")}?error=save`);
  }
  revalidatePath("/education/finance");
  redirect(`${getProductAppPath("think-education", "/finance")}?voided=1`);
}

export async function createEducationFeeSchedule(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_finance", "finance", "charges", "create")
    || !await canTabPermission("education_students", "students", "list", "view")
    || !await canTabPermission("education_academics", "academics", "calendar", "view")) {
    throw new Error("Fee, student directory, and academic calendar access are required to create a fee schedule.");
  }

  const branchId = String(formData.get("branch_id") ?? "");
  const classId = String(formData.get("class_id") ?? "");
  const academicYearId = String(formData.get("academic_year_id") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const amountText = String(formData.get("amount") ?? "").trim();
  const dueOn = String(formData.get("due_on") ?? "").trim();
  const amount = Number(amountText);
  if (!branchId || !classId || !academicYearId || !description || description.length > 160
    || !/^\d{1,10}(?:\.\d{1,2})?$/.test(amountText) || !Number.isFinite(amount) || amount <= 0
    || (dueOn && (!/^\d{4}-\d{2}-\d{2}$/.test(dueOn)
      || Number.isNaN(Date.parse(`${dueOn}T00:00:00Z`))
      || new Date(`${dueOn}T00:00:00Z`).toISOString().slice(0, 10) !== dueOn))) {
    redirect(`${getProductAppPath("think-education", "/finance")}?error=invalid`);
  }

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === branchId)) {
    throw new Error("You cannot create fee schedules outside your assigned Think Education campuses.");
  }
  const supabase = await createClient();
  const { data: classroom, error: classError } = await supabase.from("education_classes")
    .select("id")
    .eq("org_id", context.orgId)
    .eq("branch_id", branchId)
    .eq("academic_year_id", academicYearId)
    .eq("id", classId)
    .eq("status", "active")
    .maybeSingle();
  if (classError) throw new Error(`Could not verify the selected class: ${classError.message}`);
  if (!classroom) redirect(`${getProductAppPath("think-education", "/finance")}?error=invalid`);

  const { error } = await supabase.from("education_fee_schedules").insert({
    org_id: context.orgId,
    branch_id: branchId,
    class_id: classId,
    academic_year_id: academicYearId,
    description,
    amount,
    due_on: dueOn || null,
  });
  if (error) {
    if (error.code === "23514") redirect(`${getProductAppPath("think-education", "/finance")}?error=accounting-mapping`);
    if (error.message.includes("open fiscal period")) redirect(`${getProductAppPath("think-education", "/finance")}?error=accounting-period`);
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/finance")}?error=invalid`);
    console.error("Could not create Think Education fee schedule:", error.message);
    redirect(`${getProductAppPath("think-education", "/finance")}?error=save`);
  }
  revalidatePath("/education/finance");
  redirect(`${getProductAppPath("think-education", "/finance")}?scheduleCreated=1`);
}

export async function applyEducationFeeSchedule(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_finance", "finance", "charges", "create")) {
    throw new Error("You do not have permission to apply Think Education fee schedules.");
  }
  const scheduleId = String(formData.get("schedule_id") ?? "");
  if (!scheduleId) redirect(`${getProductAppPath("think-education", "/finance")}?error=invalid`);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("education_apply_fee_schedule", {
    p_org_id: context.orgId,
    p_schedule_id: scheduleId,
  });
  if (error) {
    if (error.code === "23514") redirect(`${getProductAppPath("think-education", "/finance")}?error=accounting-mapping`);
    if (error.message.includes("open fiscal period")) redirect(`${getProductAppPath("think-education", "/finance")}?error=accounting-period`);
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/finance")}?error=schedule`);
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/finance")}?error=not-found`);
    if (error.code === "42501") throw new Error("You are not authorized to apply that fee schedule.");
    console.error("Could not apply Think Education fee schedule:", error.message);
    redirect(`${getProductAppPath("think-education", "/finance")}?error=save`);
  }
  revalidatePath("/education/finance");
  revalidatePath("/education/accounting");
  revalidatePath("/education/accounting/journal-entries");
  revalidatePath("/education/accounting/general-ledger");
  revalidatePath("/education/accounting/reports");
  redirect(`${getProductAppPath("think-education", "/finance")}?applied=${data}`);
}

export async function archiveEducationFeeSchedule(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_finance", "finance", "charges", "edit")) {
    throw new Error("You do not have permission to archive Think Education fee schedules.");
  }

  const scheduleId = String(formData.get("schedule_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!scheduleId || reason.length < 3 || reason.length > 500) {
    redirect(`${getProductAppPath("think-education", "/finance")}?error=schedule-archive-invalid`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_archive_fee_schedule", {
    p_org_id: context.orgId,
    p_schedule_id: scheduleId,
    p_reason: reason,
  });
  if (error) {
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/finance")}?error=schedule-archive-blocked`);
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/finance")}?error=not-found`);
    if (error.code === "42501") throw new Error("You are not authorized to archive fee schedules at this campus.");
    console.error("Could not archive Think Education fee schedule:", error.message);
    redirect(`${getProductAppPath("think-education", "/finance")}?error=save`);
  }
  revalidatePath("/education/finance");
  redirect(`${getProductAppPath("think-education", "/finance")}?scheduleArchived=1`);
}

type CreatedEducationAccount = {
  memberId: string;
  userId: string;
  username: string;
  temporaryPassword: string;
};

async function removeCreatedEducationAccount(orgId: string, account: CreatedEducationAccount) {
  const admin = createAdminClient();
  const { error: memberError } = await admin.from("organization_members")
    .delete().eq("org_id", orgId).eq("id", account.memberId);
  const { error: userError } = await admin.auth.admin.deleteUser(account.userId);
  const cleanupError = memberError ?? userError;
  if (cleanupError) {
    console.error("Could not roll back a Think Education account:", cleanupError.message);
    return ` Account cleanup also failed: ${cleanupError.message}`;
  }
  return "";
}

async function setEducationPortalTemporaryPassword({
  admin,
  email,
  fullName,
  password,
  userId: linkedUserId,
}: {
  admin: ReturnType<typeof createAdminClient>;
  email: string;
  fullName: string;
  password: string;
  userId: string | null;
}): Promise<{ userId?: string; created?: boolean; error?: string }> {
  let userId = linkedUserId;
  if (!userId) {
    const { data: existingUserId, error: lookupError } = await admin.rpc("education_find_auth_user_id_by_email", {
      p_email: email,
    });
    if (lookupError) return { error: `Could not look up the portal account: ${lookupError.message}` };
    userId = existingUserId;
  }

  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        must_change_password: false,
        education_portal_user: true,
      },
      app_metadata: { must_change_password: true },
    });
    if (error || !data.user) {
      return { error: `Could not create the portal account: ${error?.message ?? "No account was returned."}` };
    }
    return { userId: data.user.id, created: true };
  }

  const { data, error: lookupError } = await admin.auth.admin.getUserById(userId);
  if (lookupError || !data.user || data.user.email?.trim().toLowerCase() !== email) {
    return { error: "The linked portal account does not match this record's email." };
  }
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
    app_metadata: { ...data.user.app_metadata, must_change_password: true },
    user_metadata: {
      ...data.user.user_metadata,
      full_name: data.user.user_metadata.full_name ?? fullName,
      must_change_password: false,
      education_portal_user: true,
    },
  });
  if (error) return { error: `Could not set the temporary password: ${error.message}` };
  return { userId, created: false };
}

async function ensureEducationPortalProductAccess({
  orgId,
  userId,
  email,
  roleKey,
  branchId,
}: {
  orgId: string;
  userId: string;
  email: string;
  roleKey: string;
  branchId?: string | null;
}): Promise<{ error?: string }> {
  const admin = createAdminClient();
  const { data: existingMember, error: memberError } = await admin.from("organization_members")
    .select("status")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (memberError) return { error: `Could not verify the portal account membership: ${memberError.message}` };
  if (existingMember && existingMember.status !== "active") {
    return { error: "This account has an inactive organization membership. Ask an organization owner to restore access before issuing portal credentials." };
  }

  const createdMember = !existingMember;
  if (createdMember) {
    try {
      await withOrganizationCapacity(orgId, "users", async () => {
        const { error } = await admin.from("organization_members").insert({
          org_id: orgId,
          user_id: userId,
          invited_email: email,
          role: "staff",
          status: "active",
          location_id: branchId ?? null,
          branch_scope: branchId ? "single" : "assigned",
          secondary_location_ids: [],
          access_permissions: {
            role_key: "staff",
            permissions_mode: "custom",
            permissions: {},
            role_defaults_fallback: {},
          },
          must_change_password: true,
        });
        if (error) throw new Error(error.message);
      });
    } catch (error) {
      return { error: `Could not add the portal account to this organization: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  const { data: assignmentRows, error: assignmentsError } = await admin
    .from("organization_product_access_assignments")
    .select("product_slug")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .eq("is_active", true);
  if (assignmentsError) return { error: `Could not load the portal account's product access: ${assignmentsError.message}` };
  const productSlugs = new Set((assignmentRows ?? []).map((assignment) => assignment.product_slug));
  productSlugs.add("think-education");

  const assignmentResult = await setOrganizationProductAssignments(userId, [...productSlugs]);
  if (assignmentResult.error) return { error: assignmentResult.error };

  if (createdMember) {
    const roleResult = await setMemberProductRole(userId, "think-education", roleKey);
    if (roleResult.error) return { error: roleResult.error };
  }

  if (createdMember && branchId) {
    const { data: scopes, error: scopesError } = await admin.from("education_member_branch_scopes")
      .select("scope_type, branch_id")
      .eq("org_id", orgId)
      .eq("user_id", userId);
    if (scopesError) return { error: `Could not load the portal account's campus access: ${scopesError.message}` };
    if (!scopes?.some((scope) => scope.scope_type === "organization" || scope.branch_id === branchId)) {
      const { error } = await admin.from("education_member_branch_scopes").insert({
        org_id: orgId,
        user_id: userId,
        scope_type: "branch",
        branch_id: branchId,
      });
      if (error) return { error: `Could not assign the portal account to its campus: ${error.message}` };
    }
  }

  return {};
}

async function createEducationAccountForRecord({
  orgId,
  branchId,
  fullName,
  email,
  phone,
  employeeId,
  roleKey,
  password,
}: {
  orgId: string;
  branchId: string;
  fullName: string;
  email: string;
  phone: string;
  employeeId: string;
  roleKey: string;
  password: string;
}): Promise<{ account?: CreatedEducationAccount; error?: string }> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
    return { error: "A valid email and an 8-character temporary password are required for a login account." };
  }
  if (!getEducationRolePreset(roleKey)) return { error: "Choose a valid Think Education role for the account." };

  const accountForm = new FormData();
  accountForm.set("full_name", fullName);
  accountForm.set("username", email);
  accountForm.set("password", password);
  accountForm.set("email", email);
  accountForm.set("phone", phone);
  accountForm.set("employee_id", employeeId);
  accountForm.set("department", "Think Education");
  accountForm.set("role", "staff");
  accountForm.set("product_role", roleKey);
  accountForm.set("location_id", branchId);
  accountForm.set("branch_scope", "single");
  accountForm.set("secondary_location_ids", "");

  const created = await createStaffAccount(accountForm);
  if (!("memberId" in created) || !created.memberId || !created.userId) {
    return { error: "error" in created ? created.error : "The login account could not be created." };
  }
  const account: CreatedEducationAccount = {
    memberId: created.memberId,
    userId: created.userId,
    username: created.username ?? email,
    temporaryPassword: created.temporaryPassword ?? password,
  };

  const supabase = await createClient();
  const { error: assignmentError } = await supabase.rpc("set_organization_product_assignments", {
    p_org_id: orgId,
    p_user_id: account.userId,
    p_product_slugs: ["think-education"],
  });
  if (assignmentError) {
    const cleanupMessage = await removeCreatedEducationAccount(orgId, account);
    return { error: `Could not assign the account to Think Education: ${assignmentError.message}.${cleanupMessage}` };
  }

  const roleResult = await setMemberProductRole(account.userId, "think-education", roleKey);
  if (roleResult.error) {
    const cleanupMessage = await removeCreatedEducationAccount(orgId, account);
    return { error: `${roleResult.error}.${cleanupMessage}` };
  }

  const { error: scopeError } = await supabase.from("education_member_branch_scopes").insert({
    org_id: orgId,
    user_id: account.userId,
    scope_type: "branch",
    branch_id: branchId,
  });
  if (scopeError) {
    const cleanupMessage = await removeCreatedEducationAccount(orgId, account);
    return { error: `Could not assign the account to its campus: ${scopeError.message}.${cleanupMessage}` };
  }
  return { account };
}

export async function issueEducationPortalTemporaryPassword(
  formData: FormData,
): Promise<EducationPortalCredentialActionResult> {
  const context = await getCurrentOrgContext();
  if (!context || !isOrganizationSuperAdminMember({
    role: context.role,
    userId: context.userId,
    accessPermissions: context.accessPermissions,
  })) {
    return { error: "Only an organization owner or super administrator can issue portal passwords." };
  }

  const portalType = String(formData.get("portal_type") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!["student", "staff", "guardian"].includes(portalType)
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || email.length > 254) {
    return { error: "Choose a portal and enter a valid email address." };
  }

  const admin = createAdminClient();
  const temporaryPassword = `${randomBytes(20).toString("hex")}Aa1!`;
  let userId: string | null = null;
  let branchId: string | null = null;
  let previousStaffUserId: string | null = null;
  let staffRecordId: string | null = null;

  if (portalType === "student") {
    const { data: rows, error } = await admin.from("education_students")
      .select("id, user_id, branch_id, student_number, first_name, last_name, other_names, phone, email")
      .eq("org_id", context.orgId).ilike("email", email.replace(/[\\%_]/g, "\\$&"))
      .eq("status", "active").limit(2);
    if (error) return { error: `Could not find the student record: ${error.message}` };
    const record = (rows ?? []).find((row) => row.email?.trim().toLowerCase() === email);
    if (!record || (rows ?? []).filter((row) => row.email?.trim().toLowerCase() === email).length !== 1) {
      return { error: "No unique active student with that email was found in this organization." };
    }

    userId = record.user_id;
    branchId = record.branch_id;
    if (!userId) {
      const portalAccount = await setEducationPortalTemporaryPassword({
        admin,
        email,
        fullName: [record.first_name, record.other_names, record.last_name].filter(Boolean).join(" "),
        password: temporaryPassword,
        userId: null,
      });
      if (!portalAccount.userId) return { error: portalAccount.error ?? "Could not create the student portal account." };
      const { data: linkedRecord, error: linkError } = await admin.from("education_students")
        .update({ user_id: portalAccount.userId, updated_at: new Date().toISOString() })
        .eq("org_id", context.orgId).eq("id", record.id).is("user_id", null).select("id").maybeSingle();
      if (linkError || !linkedRecord) {
        if (portalAccount.created) {
          const { error: cleanupError } = await admin.auth.admin.deleteUser(portalAccount.userId);
          if (cleanupError) console.error("Could not remove the unlinked student portal account:", cleanupError.message);
        }
        if (linkError) console.error("Could not link the student portal account:", linkError.message);
        return { error: "The student account could not be linked. Please try again." };
      }
      const accessResult = await ensureEducationPortalProductAccess({
        orgId: context.orgId,
        userId: portalAccount.userId,
        email,
        roleKey: "education_student",
        branchId,
      });
      if (accessResult.error) return { error: `The student account was linked, but portal access could not be prepared: ${accessResult.error}` };
      return { success: true, email, temporaryPassword };
    }
  } else if (portalType === "staff") {
    const { data: rows, error } = await admin.from("education_staff")
      .select("id, user_id, branch_id, first_name, last_name, email")
      .eq("org_id", context.orgId).ilike("email", email.replace(/[\\%_]/g, "\\$&"))
      .eq("status", "active").eq("staff_category", "teaching").limit(2);
    if (error) return { error: `Could not find the teaching staff record: ${error.message}` };
    const record = (rows ?? []).find((row) => row.email?.trim().toLowerCase() === email);
    if (!record || (rows ?? []).filter((row) => row.email?.trim().toLowerCase() === email).length !== 1) {
      return { error: "No unique active teaching staff profile with that email was found in this organization." };
    }

    staffRecordId = record.id;
    userId = record.user_id;
    branchId = record.branch_id;
    if (userId) {
      const { data: linkedAccount, error: linkedAccountError } = await admin.auth.admin.getUserById(userId);
      if (linkedAccountError || !linkedAccount.user) {
        return { error: "Could not verify the account linked to this teaching staff profile." };
      }
      if (linkedAccount.user.email?.trim().toLowerCase() !== email) {
        const { data: matchingUserId, error: matchingUserError } = await admin.rpc("education_find_auth_user_id_by_email", {
          p_email: email,
        });
        if (matchingUserError) return { error: `Could not look up the account for this email: ${matchingUserError.message}` };
        if (!matchingUserId) {
          return { error: "This staff profile is linked to a different login, and no account exists for the profile email. Correct the staff email or account link before issuing a password." };
        }

        const { data: otherStaff, error: otherStaffError } = await admin.from("education_staff")
          .select("id")
          .eq("org_id", context.orgId)
          .eq("user_id", matchingUserId)
          .neq("id", record.id)
          .maybeSingle();
        if (otherStaffError) return { error: `Could not verify the account's staff profile link: ${otherStaffError.message}` };
        if (otherStaff) {
          return { error: "The account for this email is already linked to another staff profile. Ask an administrator to resolve the duplicate link." };
        }

        const { data: relinkedStaff, error: relinkError } = await admin.from("education_staff")
          .update({ user_id: matchingUserId, updated_at: new Date().toISOString() })
          .eq("org_id", context.orgId)
          .eq("id", record.id)
          .eq("user_id", userId)
          .select("id")
          .maybeSingle();
        if (relinkError || !relinkedStaff) {
          if (relinkError) console.error("Could not reconnect the Think Education staff profile to its email account:", relinkError.message);
          return { error: "The staff profile could not be connected to the existing account for this email. Please try again." };
        }
        previousStaffUserId = userId;
        userId = matchingUserId;
      }
    }

    if (!userId) {
      const portalAccount = await setEducationPortalTemporaryPassword({
        admin,
        email,
        fullName: `${record.first_name} ${record.last_name}`,
        password: temporaryPassword,
        userId: null,
      });
      if (!portalAccount.userId) return { error: portalAccount.error ?? "Could not create the teacher portal account." };
      const { data: linkedRecord, error: linkError } = await admin.from("education_staff")
        .update({ user_id: portalAccount.userId, updated_at: new Date().toISOString() })
        .eq("org_id", context.orgId).eq("id", record.id).is("user_id", null).select("id").maybeSingle();
      if (linkError || !linkedRecord) {
        if (portalAccount.created) {
          const { error: cleanupError } = await admin.auth.admin.deleteUser(portalAccount.userId);
          if (cleanupError) console.error("Could not remove the unlinked teacher portal account:", cleanupError.message);
        }
        if (linkError) console.error("Could not link the teacher portal account:", linkError.message);
        return { error: "The staff account could not be linked. Please try again." };
      }
      const accessResult = await ensureEducationPortalProductAccess({
        orgId: context.orgId,
        userId: portalAccount.userId,
        email,
        roleKey: "education_teacher",
        branchId,
      });
      if (accessResult.error) return { error: `The teacher account was linked, but portal access could not be prepared: ${accessResult.error}` };
      return { success: true, email, temporaryPassword };
    }
  } else {
    const { data: rows, error } = await admin.from("education_guardians")
      .select("id, user_id, first_name, last_name, email")
      .eq("org_id", context.orgId).ilike("email", email.replace(/[\\%_]/g, "\\$&"))
      .eq("status", "active").limit(2);
    if (error) return { error: `Could not find the guardian record: ${error.message}` };
    const record = (rows ?? []).find((row) => row.email?.trim().toLowerCase() === email);
    if (!record || (rows ?? []).filter((row) => row.email?.trim().toLowerCase() === email).length !== 1) {
      return { error: "No unique active guardian profile with that email was found in this organization." };
    }

    userId = record.user_id;
    if (!userId) {
      const portalAccount = await setEducationPortalTemporaryPassword({
        admin,
        email,
        fullName: `${record.first_name} ${record.last_name}`,
        password: temporaryPassword,
        userId: null,
      });
      if (!portalAccount.userId) return { error: portalAccount.error ?? "Could not create the guardian account." };
      const { data: linkedRecord, error: linkError } = await admin.from("education_guardians")
        .update({ user_id: portalAccount.userId, updated_at: new Date().toISOString() })
        .eq("org_id", context.orgId).eq("id", record.id).is("user_id", null).select("id").maybeSingle();
      if (linkError || !linkedRecord) {
        if (portalAccount.created) {
          const { error: cleanupError } = await admin.auth.admin.deleteUser(portalAccount.userId);
          if (cleanupError) console.error("Could not remove the unlinked guardian portal account:", cleanupError.message);
        }
        if (linkError) console.error("Could not link the guardian portal account:", linkError.message);
        return { error: "The guardian account could not be linked. Please try again." };
      }
      const accessResult = await ensureEducationPortalProductAccess({
        orgId: context.orgId,
        userId: portalAccount.userId,
        email,
        roleKey: "education_guardian",
      });
      if (accessResult.error) return { error: `The guardian account was linked, but portal access could not be prepared: ${accessResult.error}` };
      return { success: true, email, temporaryPassword };
    }
  }

  const portalAccount = await setEducationPortalTemporaryPassword({
    admin,
    email,
    fullName: "Think Education portal user",
    password: temporaryPassword,
    userId,
  });
  if (!portalAccount.userId) {
    if (previousStaffUserId && staffRecordId && userId) {
      const { error: restoreError } = await admin.from("education_staff")
        .update({ user_id: previousStaffUserId, updated_at: new Date().toISOString() })
        .eq("org_id", context.orgId)
        .eq("id", staffRecordId)
        .eq("user_id", userId);
      if (restoreError) console.error("Could not restore the previous Think Education staff account link:", restoreError.message);
    }
    return { error: portalAccount.error ?? "Could not set the temporary portal password." };
  }

  const roleKey = portalType === "student"
    ? "education_student"
    : portalType === "staff"
      ? "education_teacher"
      : "education_guardian";
  const accessResult = await ensureEducationPortalProductAccess({
    orgId: context.orgId,
    userId: portalAccount.userId,
    email,
    roleKey,
    branchId,
  });
  if (accessResult.error) return { error: `The password was set, but portal access could not be prepared: ${accessResult.error}` };

  return { success: true, email, temporaryPassword };
}

export async function createEducationStudent(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) return { error: "Session expired. Sign in again." };
  if (!await canTabPermission("education_students", "students", "list", "create")) {
    return { error: "You do not have permission to create Think Education student records." };
  }

  const branchId = String(formData.get("branch_id") ?? "");
  const studentNumber = String(formData.get("student_number") ?? "").trim() || generateEducationRecordNumber("STU");
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const otherNames = String(formData.get("other_names") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const dateOfBirth = String(formData.get("date_of_birth") ?? "").trim();
  const gender = String(formData.get("gender") ?? "").trim();
  const homeAddress = String(formData.get("home_address") ?? "").trim();
  const createAccount = formData.get("create_account") === "true";
  const photoResult = await getEducationStudentPhoto(formData);
  if (photoResult.error) return { error: photoResult.error };
  if (!branchId || !/^[A-Za-z0-9._/-]{1,32}$/.test(studentNumber) || !firstName || !lastName) {
    return { error: "Check the name and campus fields." };
  }
  if (firstName.length > 100 || lastName.length > 100 || otherNames.length > 100
    || email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    || phone.length > 32
    || gender.length > 50
    || homeAddress.length > 500
    || (dateOfBirth && !isValidEducationStaffDate(dateOfBirth))) {
    return { error: "Enter a valid email address, date of birth, gender, and address." };
  }

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === branchId)) {
    return { error: "You cannot create a student record outside your assigned Think Education campuses." };
  }

  const supabase = await createClient();
  const { data: existingStudent, error: duplicateCheckError } = await supabase.from("education_students")
    .select("id")
    .eq("org_id", context.orgId)
    .in("branch_id", campuses.map((campus) => campus.id))
    .eq("student_number", studentNumber)
    .limit(1)
    .maybeSingle();
  if (duplicateCheckError) {
    console.error("Could not check for duplicate Think Education student numbers:", duplicateCheckError.message);
    return { error: "Could not check whether that student number is already in use. Please try again." };
  }
  if (existingStudent) return { error: "A student with this number already exists in this organization." };

  let account: CreatedEducationAccount | undefined;
  if (createAccount) {
    if (!isOrganizationSuperAdminMember({
      role: context.role,
      userId: context.userId,
      accessPermissions: context.accessPermissions,
    })) {
      return { error: "Only an organization owner or super administrator can create linked login accounts." };
    }
    const accountResult = await createEducationAccountForRecord({
      orgId: context.orgId,
      branchId,
      fullName: [firstName, otherNames, lastName].filter(Boolean).join(" "),
      email,
      phone,
      employeeId: studentNumber,
      roleKey: "education_student",
      password: String(formData.get("account_password") ?? ""),
    });
    if (accountResult.error) return { error: accountResult.error };
    account = accountResult.account;
  }

  const { data: student, error } = await supabase.from("education_students").insert({
    org_id: context.orgId,
    branch_id: branchId,
    user_id: account?.userId ?? null,
    student_number: studentNumber,
    first_name: firstName,
    last_name: lastName,
    other_names: otherNames || null,
    email: email || null,
    phone: phone || null,
    date_of_birth: dateOfBirth || null,
    gender: gender || null,
    home_address: homeAddress || null,
    created_by: context.userId,
  }).select("id").single();
  if (error) {
    const cleanupMessage = account ? await removeCreatedEducationAccount(context.orgId, account) : "";
    if (error.code === "23505") return { error: `A student with this number already exists in this organization.${cleanupMessage}` };
    console.error("Could not create Think Education student:", error.message);
    return { error: `The student record could not be saved: ${error.message}.${cleanupMessage}` };
  }

  let warning: string | undefined;
  if (photoResult.file) {
    const uploadResult = await uploadEducationStudentPhoto(supabase, context.orgId, student.id, photoResult.file);
    if ("error" in uploadResult) {
      warning = uploadResult.error;
    } else {
      const { error: photoPathError } = await supabase.from("education_students")
        .update({ photo_path: uploadResult.path, updated_at: new Date().toISOString() })
        .eq("org_id", context.orgId)
        .eq("id", student.id);
      if (photoPathError) {
        console.error("Could not save Think Education student photo path:", photoPathError.message);
        const { error: cleanupError } = await supabase.storage.from(EDUCATION_STUDENT_IMAGE_BUCKET).remove([uploadResult.path]);
        if (cleanupError) console.error("Could not remove unlinked Think Education student photo:", cleanupError.message);
        warning = "The student record was saved, but the photo could not be attached. Edit the student profile to try again.";
      }
    }
  }

  revalidatePath("/education/students");
  revalidatePath("/education/settings/users");
  return {
    success: true,
    username: account?.username,
    temporaryPassword: account?.temporaryPassword,
    warning,
  };
}

export async function updateEducationStudent(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) return { error: "Session expired. Sign in again." };
  if (!await canTabPermission("education_students", "students", "list", "edit")) {
    return { error: "You do not have permission to edit Think Education student records." };
  }

  const parsed = educationStudentProfileInputSchema.safeParse({
    studentId: String(formData.get("student_id") ?? ""),
    firstName: String(formData.get("first_name") ?? ""),
    lastName: String(formData.get("last_name") ?? ""),
    otherNames: String(formData.get("other_names") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    dateOfBirth: String(formData.get("date_of_birth") ?? ""),
    gender: String(formData.get("gender") ?? ""),
    homeAddress: String(formData.get("home_address") ?? ""),
  });
  if (!parsed.success) {
    return { error: "Check the student name, email, phone, and date of birth." };
  }
  const photoResult = await getEducationStudentPhoto(formData);
  if (photoResult.error) return { error: photoResult.error };

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const branchIds = campuses.map((campus) => campus.id);
  if (!branchIds.length) {
    return { error: "You do not have access to the campus containing this student." };
  }

  const supabase = await createClient();
  const { data: updatedStudent, error } = await supabase.from("education_students")
    .update({
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      other_names: parsed.data.otherNames || null,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      date_of_birth: parsed.data.dateOfBirth || null,
      gender: parsed.data.gender || null,
      home_address: parsed.data.homeAddress || null,
      updated_at: new Date().toISOString(),
    })
    .eq("org_id", context.orgId)
    .eq("id", parsed.data.studentId)
    .in("branch_id", branchIds)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Could not update Think Education student profile:", error.message);
    return { error: `The student profile could not be saved: ${error.message}` };
  }
  if (!updatedStudent) {
    return { error: "The student could not be found in your assigned Think Education campuses." };
  }

  let warning: string | undefined;
  if (photoResult.file) {
    const { data: currentStudent, error: currentStudentError } = await supabase.from("education_students")
      .select("photo_path")
      .eq("org_id", context.orgId)
      .eq("id", parsed.data.studentId)
      .in("branch_id", branchIds)
      .maybeSingle();
    if (currentStudentError || !currentStudent) {
      console.error("Could not load current Think Education student photo:", currentStudentError?.message ?? "Student not found.");
      warning = "The profile was saved, but the current photo could not be replaced.";
    } else {
      const uploadResult = await uploadEducationStudentPhoto(supabase, context.orgId, parsed.data.studentId, photoResult.file);
      if ("error" in uploadResult) {
        warning = uploadResult.error;
      } else {
        const { error: photoPathError } = await supabase.from("education_students")
          .update({ photo_path: uploadResult.path, updated_at: new Date().toISOString() })
          .eq("org_id", context.orgId)
          .eq("id", parsed.data.studentId)
          .in("branch_id", branchIds);
        if (photoPathError) {
          console.error("Could not save Think Education student photo path:", photoPathError.message);
          const { error: cleanupError } = await supabase.storage.from(EDUCATION_STUDENT_IMAGE_BUCKET).remove([uploadResult.path]);
          if (cleanupError) console.error("Could not remove unlinked Think Education student photo:", cleanupError.message);
          warning = "The profile was saved, but the new photo could not be attached.";
        } else if (currentStudent.photo_path) {
          const { error: removeError } = await supabase.storage.from(EDUCATION_STUDENT_IMAGE_BUCKET).remove([currentStudent.photo_path]);
          if (removeError) {
            console.error("Could not remove the previous Think Education student photo:", removeError.message);
            warning = "The new photo was saved, but the previous photo could not be removed.";
          }
        }
      }
    }
  }

  revalidatePath("/education/students");
  revalidatePath(`/education/students/${parsed.data.studentId}`);
  return { success: true, warning };
}

export async function recordEducationStudentConsent(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) return { error: "Session expired. Sign in again." };
  if (!await canTabPermission("education_students", "students", "list", "edit")) {
    return { error: "You do not have permission to record student consent." };
  }

  const parsed = educationStudentConsentInputSchema.safeParse({
    studentId: String(formData.get("student_id") ?? ""),
    consentType: String(formData.get("consent_type") ?? ""),
    disclosureVersion: String(formData.get("disclosure_version") ?? ""),
    decision: String(formData.get("decision") ?? ""),
    signerName: String(formData.get("signer_name") ?? ""),
    signerRelationship: String(formData.get("signer_relationship") ?? ""),
    evidenceNote: String(formData.get("evidence_note") ?? ""),
  });
  if (!parsed.success) return { error: "Check the consent category, disclosure version, signer, and evidence note." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_record_student_consent", {
    p_org_id: context.orgId,
    p_student_id: parsed.data.studentId,
    p_consent_type: parsed.data.consentType,
    p_disclosure_version: parsed.data.disclosureVersion,
    p_decision: parsed.data.decision,
    p_signer_name: parsed.data.signerName,
    p_signer_relationship: parsed.data.signerRelationship,
    p_evidence_note: parsed.data.evidenceNote || null,
  });
  if (error) {
    console.error("Could not record Think Education student consent:", error.message);
    return { error: `Consent could not be recorded: ${error.message}` };
  }

  revalidatePath(`/education/students/${parsed.data.studentId}`);
  return { success: true };
}

export async function createEducationCampus(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) return { error: "Session expired. Sign in again." };
  if (!await canTabPermission("education_organization", "organization", "campuses", "create")) {
    return { error: "You do not have permission to create Think Education campuses." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const region = String(formData.get("region") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  if (!name || name.length > 120 || !/^[A-Za-z0-9-]{1,32}$/.test(code)
    || address.length > 200 || city.length > 100 || region.length > 100 || country.length > 100
    || phone.length > 32 || email.length > 254
    || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return { error: "Enter a campus name, a unique code, and a valid email address." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_create_campus", {
    p_org_id: context.orgId,
    p_name: name,
    p_code: code,
    p_address: address || null,
    p_city: city || null,
    p_region: region || null,
    p_country: country || null,
    p_phone: phone || null,
    p_email: email || null,
  });
  if (error) {
    if (error.code === "23505") return { error: `Campus code "${code}" is already in use.` };
    console.error("Could not create Think Education campus:", error.message);
    return { error: `The campus could not be saved: ${error.message}` };
  }
  revalidatePath("/education/organization");
  return { success: true };
}

export async function updateEducationCampus(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_organization", "organization", "campuses", "edit")) {
    throw new Error("You do not have permission to edit Think Education campuses.");
  }

  const branchId = String(formData.get("branch_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const region = String(formData.get("region") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const administratorUserId = String(formData.get("administrator_user_id") ?? "") || null;
  const status = String(formData.get("status") ?? "");
  const organizationPath = getProductAppPath("think-education", "/organization");
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(branchId) || !name || name.length > 120 || !/^[A-Za-z0-9-]{1,32}$/.test(code)
    || address.length > 200 || city.length > 100 || region.length > 100 || country.length > 100
    || phone.length > 32 || email.length > 254
    || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    || (administratorUserId && !uuidPattern.test(administratorUserId))
    || !["active", "inactive", "archived"].includes(status)) {
    redirect(`${organizationPath}?error=invalid`);
  }

  const supabase = await createClient();
  const { data: currentCampus, error: campusError } = await supabase.from("education_campuses")
    .select("administrator_user_id")
    .eq("org_id", context.orgId)
    .eq("branch_id", branchId)
    .maybeSingle();
  if (campusError) throw new Error(`Could not verify the Think Education campus: ${campusError.message}`);
  if (!currentCampus) redirect(`${organizationPath}?error=not-found`);
  if (administratorUserId !== currentCampus.administrator_user_id
    && !await canTabPermission("education_user_management", "users", "branch_access", "edit")) {
    throw new Error("You do not have permission to assign Think Education campus administrators.");
  }

  const { error } = await supabase.rpc("education_update_campus", {
    p_org_id: context.orgId,
    p_branch_id: branchId,
    p_name: name,
    p_code: code,
    p_address: address || null,
    p_city: city || null,
    p_region: region || null,
    p_country: country || null,
    p_phone: phone || null,
    p_email: email || null,
    p_administrator_user_id: administratorUserId,
    p_status: status,
  });
  if (error) {
    if (error.code === "23505") redirect(`${organizationPath}?error=duplicate`);
    if (error.code === "22023") redirect(`${organizationPath}?error=invalid`);
    if (error.code === "P0002") redirect(`${organizationPath}?error=not-found`);
    if (error.code === "42501") throw new Error(`Campus update was not authorized: ${error.message}`);
    console.error("Could not update Think Education campus:", error.message);
    redirect(`${organizationPath}?error=save`);
  }

  revalidatePath("/education/organization");
  revalidatePath("/education/staff");
  revalidatePath("/education/dashboard");
  revalidatePath("/education/reports/campus-comparison");
  redirect(`${organizationPath}?updated=1`);
}

export async function saveEducationDepartment(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");

  const departmentId = String(formData.get("department_id") ?? "") || null;
  const branchId = String(formData.get("branch_id") ?? "") || null;
  const name = String(formData.get("name") ?? "").trim();
  const departmentType = String(formData.get("department_type") ?? "");
  const isActive = formData.get("is_active") === "true";
  const departmentsPath = getProductAppPath("think-education", "/academics/departments");
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if ((departmentId && !uuidPattern.test(departmentId))
    || (branchId && !uuidPattern.test(branchId))
    || !name || name.length > 120
    || !["academic", "administrative", "support"].includes(departmentType)
    || !["true", "false"].includes(String(formData.get("is_active") ?? ""))) {
    redirect(`${departmentsPath}?error=invalid`);
  }

  const { campuses, hasOrganizationScope } = await getAccessibleEducationCampuses(
    context.orgId,
    context.userId,
    { includeInactive: true },
  );
  const campus = branchId ? campuses.find((item) => item.id === branchId) : null;
  if ((branchId && !campus) || (!branchId && !hasOrganizationScope)) {
    throw new Error("You cannot manage an Education department outside your assigned scope.");
  }

  const action = departmentId ? "edit" : "create";
  if (!await canTabPermission("education_academics", "academics", "departments", action)) {
    throw new Error(`You do not have permission to ${action} Think Education departments.`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_department_save", {
    p_org_id: context.orgId,
    p_department_id: departmentId,
    p_branch_id: branchId,
    p_name: name,
    p_department_type: departmentType,
    p_is_active: isActive,
  });
  if (error) {
    if (error.code === "23505") redirect(`${departmentsPath}?error=duplicate`);
    if (error.code === "22023") redirect(`${departmentsPath}?error=invalid`);
    if (error.code === "42501") throw new Error(`Department update was not authorized: ${error.message}`);
    if (error.code === "P0002") redirect(`${departmentsPath}?error=not-found`);
    console.error("Could not save Think Education department:", error.message);
    redirect(`${departmentsPath}?error=save`);
  }

  revalidatePath("/education/academics/departments");
  revalidatePath("/education/academics");
  revalidatePath("/education/staff");
  redirect(`${departmentsPath}?saved=1`);
}

export async function saveEducationStaffQualification(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_staff", "staff", "directory", "edit")) {
    throw new Error("You do not have permission to edit Think Education staff records.");
  }

  const staffId = String(formData.get("staff_id") ?? "");
  const qualificationId = String(formData.get("qualification_id") ?? "") || null;
  const qualification = String(formData.get("qualification") ?? "").trim();
  const institution = String(formData.get("institution") ?? "").trim();
  const fieldOfStudy = String(formData.get("field_of_study") ?? "").trim();
  const awardedOn = String(formData.get("awarded_on") ?? "");
  const expiresOn = String(formData.get("expires_on") ?? "");
  const staffPath = getProductAppPath("think-education", `/staff/${staffId}`);
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(staffId) || (qualificationId && !uuidPattern.test(qualificationId))
    || !qualification || qualification.length > 160 || institution.length > 160 || fieldOfStudy.length > 160
    || (awardedOn && !isValidEducationISODate(awardedOn))
    || (expiresOn && !isValidEducationISODate(expiresOn))
    || (awardedOn && expiresOn && expiresOn < awardedOn)) {
    redirect(`${staffPath}?error=invalid`);
  }

  const supabase = await createClient();
  const { data: staff, error: staffError } = await supabase.from("education_staff")
    .select("id, branch_id")
    .eq("org_id", context.orgId).eq("id", staffId).maybeSingle();
  if (staffError) throw new Error(`Could not verify the Think Education staff record: ${staffError.message}`);
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!staff || !campuses.some((campus) => campus.id === staff.branch_id)) {
    redirect(`${staffPath}?error=not-found`);
  }

  const { error } = await supabase.rpc("education_staff_qualification_save", {
    p_org_id: context.orgId,
    p_staff_id: staffId,
    p_qualification_id: qualificationId,
    p_qualification: qualification,
    p_institution: institution || null,
    p_field_of_study: fieldOfStudy || null,
    p_awarded_on: awardedOn || null,
    p_expires_on: expiresOn || null,
  });
  if (error) {
    if (error.code === "22023") redirect(`${staffPath}?error=invalid`);
    if (error.code === "P0002") redirect(`${staffPath}?error=not-found`);
    if (error.code === "42501") throw new Error(`Qualification update was not authorized: ${error.message}`);
    console.error("Could not save Think Education staff qualification:", error.message);
    redirect(`${staffPath}?error=save`);
  }

  revalidatePath(staffPath);
  redirect(`${staffPath}?qualification=1`);
}

export async function saveEducationStaffContract(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_staff", "staff", "directory", "edit")) {
    throw new Error("You do not have permission to edit Think Education staff records.");
  }

  const staffId = String(formData.get("staff_id") ?? "");
  const contractId = String(formData.get("contract_id") ?? "") || null;
  const contractType = String(formData.get("contract_type") ?? "");
  const referenceNumber = String(formData.get("reference_number") ?? "").trim();
  const positionTitle = String(formData.get("position_title") ?? "").trim();
  const startOn = String(formData.get("start_on") ?? "");
  const endOn = String(formData.get("end_on") ?? "");
  const status = String(formData.get("status") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  const staffPath = getProductAppPath("think-education", `/staff/${staffId}`);
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(staffId) || (contractId && !uuidPattern.test(contractId))
    || !["permanent", "fixed_term", "temporary", "casual", "consultant"].includes(contractType)
    || referenceNumber.length > 80 || !positionTitle || positionTitle.length > 120
    || !isValidEducationISODate(startOn)
    || (endOn && !isValidEducationISODate(endOn))
    || (endOn && endOn < startOn)
    || !["draft", "active", "completed", "terminated"].includes(status)
    || notes.length > 1000) {
    redirect(`${staffPath}?error=invalid`);
  }

  const supabase = await createClient();
  const { data: staff, error: staffError } = await supabase.from("education_staff")
    .select("id, branch_id")
    .eq("org_id", context.orgId).eq("id", staffId).maybeSingle();
  if (staffError) throw new Error(`Could not verify the Think Education staff record: ${staffError.message}`);
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!staff || !campuses.some((campus) => campus.id === staff.branch_id)) {
    redirect(`${staffPath}?error=not-found`);
  }

  const { error } = await supabase.rpc("education_staff_contract_save", {
    p_org_id: context.orgId,
    p_staff_id: staffId,
    p_contract_id: contractId,
    p_contract_type: contractType,
    p_reference_number: referenceNumber || null,
    p_position_title: positionTitle,
    p_start_on: startOn,
    p_end_on: endOn || null,
    p_status: status,
    p_notes: notes || null,
  });
  if (error) {
    if (error.code === "22023") redirect(`${staffPath}?error=invalid`);
    if (error.code === "P0002") redirect(`${staffPath}?error=not-found`);
    if (error.code === "42501") throw new Error(`Contract update was not authorized: ${error.message}`);
    console.error("Could not save Think Education staff contract:", error.message);
    redirect(`${staffPath}?error=save`);
  }

  revalidatePath(staffPath);
  redirect(`${staffPath}?contract=1`);
}

export async function createEducationStaff(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) return { error: "Session expired. Sign in again." };
  if (!await canTabPermission("education_staff", "staff", "directory", "create")) {
    return { error: "You do not have permission to create Think Education staff records." };
  }

  const branchId = String(formData.get("branch_id") ?? "");
  const staffNumber = String(formData.get("staff_number") ?? "").trim() || generateEducationRecordNumber("STF");
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const category = String(formData.get("staff_category") ?? "");
  const jobTitle = String(formData.get("job_title") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const createAccount = formData.get("create_account") === "true";
  const accountRole = String(formData.get("account_role") ?? "education_teacher");
  if (!branchId || !/^[A-Za-z0-9._/-]{1,32}$/.test(staffNumber)
    || !firstName || firstName.length > 100 || !lastName || lastName.length > 100
    || !["teaching", "non_teaching"].includes(category)
    || jobTitle.length > 120 || email.length > 254
    || phone.length > 32 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return { error: "Check the name, category, and email fields." };
  }

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === branchId)) {
    return { error: "You cannot create a staff record outside your assigned Think Education campuses." };
  }

  let account: CreatedEducationAccount | undefined;
  if (createAccount) {
    if (!isOrganizationSuperAdminMember({
      role: context.role,
      userId: context.userId,
      accessPermissions: context.accessPermissions,
    })) {
      return { error: "Only an organization owner or super administrator can create linked login accounts." };
    }
    const accountResult = await createEducationAccountForRecord({
      orgId: context.orgId,
      branchId,
      fullName: `${firstName} ${lastName}`,
      email,
      phone,
      employeeId: staffNumber,
      roleKey: accountRole,
      password: String(formData.get("account_password") ?? ""),
    });
    if (accountResult.error) return { error: accountResult.error };
    account = accountResult.account;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("education_staff").insert({
    org_id: context.orgId,
    branch_id: branchId,
    user_id: account?.userId ?? null,
    staff_number: staffNumber,
    first_name: firstName,
    last_name: lastName,
    staff_category: category as "teaching" | "non_teaching",
    job_title: jobTitle || null,
    email: email || null,
    phone: phone || null,
    created_by: context.userId,
  });
  if (error) {
    const cleanupMessage = account ? await removeCreatedEducationAccount(context.orgId, account) : "";
    if (error.code === "23505") return { error: `That staff number or linked account is already in use.${cleanupMessage}` };
    console.error("Could not create Think Education staff record:", error.message);
    return { error: `The staff record could not be saved: ${error.message}.${cleanupMessage}` };
  }

  revalidatePath("/education/staff");
  revalidatePath("/education/settings/users");
  return {
    success: true,
    username: account?.username,
    temporaryPassword: account?.temporaryPassword,
  };
}

export async function importEducationRecords(
  entity: EducationImportEntity,
  rows: Array<Record<string, string>>,
): Promise<{ created: number; skipped: Array<{ row: number; reason: string }> }> {
  const context = await getCurrentOrgContext();
  if (!context) throw new Error("Session expired. Sign in again.");
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 500) {
    throw new Error("Import between 1 and 500 records at a time.");
  }

  const isCampusImport = entity === "campuses";
  if (!isCampusImport && entity !== "students" && entity !== "staff") {
    throw new Error("This Think Education import type is not supported.");
  }
  const canImport = isCampusImport
    ? await canTabPermission("education_organization", "organization", "campuses", "create")
    : await canPermission(entity === "students" ? "education_students" : "education_staff", "import");
  const canCreate = entity === "campuses"
    ? canImport
    : entity === "students"
      ? await canTabPermission("education_students", "students", "list", "create")
      : await canTabPermission("education_staff", "staff", "directory", "create");
  if (!canImport || !canCreate) throw new Error("You do not have permission to import these Think Education records.");

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusesByLookup = new Map<string, string | null>();
  for (const campus of campuses) {
    for (const value of [campus.id, campus.name, campus.code]) {
      if (value) {
        const key = value.trim().toLowerCase();
        const previous = campusesByLookup.get(key);
        if (!campusesByLookup.has(key)) campusesByLookup.set(key, campus.id);
        else if (previous !== campus.id) campusesByLookup.set(key, null);
      }
    }
  }

  const skipped: Array<{ row: number; reason: string }> = [];
  const duplicateStudentRows = entity === "students" ? findDuplicateEducationStudentNumberRows(rows) : new Set<number>();
  let created = 0;
  const getValue = (row: Record<string, string>, key: string) =>
    typeof row?.[key] === "string" ? row[key].trim() : "";
  const emailIsValid = (email: string) => !email || (email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  const runRowAction = async <T extends { error?: string }>(row: number, action: () => Promise<T>) => {
    try {
      return { row, result: await action() };
    } catch (error) {
      return {
        row,
        error: error instanceof Error ? error.message : "The record could not be saved.",
      };
    }
  };

  for (let start = 0; start < rows.length; start += 10) {
    const results = await Promise.all(rows.slice(start, start + 10).map(async (row, batchIndex) => {
      const rowNumber = start + batchIndex + 2;
      const formData = new FormData();
      const values = Object.fromEntries(Object.entries(row ?? {}).map(([key, value]) => [
        key,
        typeof value === "string" ? value.trim() : "",
      ]));
      for (const [key, value] of Object.entries(values)) formData.set(key, value);

      if (entity === "campuses") {
        const name = getValue(values, "name");
        const code = getValue(values, "code");
        const email = getValue(values, "email");
        if (!name || name.length > 120 || !/^[A-Za-z0-9-]{1,32}$/.test(code)
          || !emailIsValid(email) || getValue(values, "address").length > 200
          || getValue(values, "city").length > 100 || getValue(values, "region").length > 100
          || getValue(values, "country").length > 100 || getValue(values, "phone").length > 32) {
          return { row: rowNumber, error: "Check the campus name, code, and contact fields." };
        }
        return runRowAction(rowNumber, () => createEducationCampus(formData));
      }

      const campusValue = getValue(values, "campus");
      const branchId = campusesByLookup.get(campusValue.toLowerCase());
      if (!branchId) return { row: rowNumber, error: "Campus was not found in your assigned Think Education campuses." };
      formData.set("branch_id", branchId);

      if (entity === "students") {
        if (duplicateStudentRows.has(start + batchIndex)) {
          return { row: rowNumber, error: "Student number duplicates another row in this import file." };
        }
        const studentNumber = getValue(values, "student_number");
        const firstName = getValue(values, "first_name");
        const lastName = getValue(values, "last_name");
        const otherNames = getValue(values, "other_names");
        const email = getValue(values, "email");
        const phone = getValue(values, "phone");
        const dateOfBirth = getValue(values, "date_of_birth");
        if ((studentNumber && !/^[A-Za-z0-9._/-]{1,32}$/.test(studentNumber))
          || !firstName || firstName.length > 100 || !lastName || lastName.length > 100
          || otherNames.length > 100 || !emailIsValid(email) || phone.length > 32
        ) {
          return { row: rowNumber, error: "Check the student number (if supplied), name, and contact fields." };
        }
        if (dateOfBirth && !isValidEducationStaffDate(dateOfBirth)) {
          return { row: rowNumber, error: "Date of birth must use DD-MM-YYYY (or YYYY-MM-DD) and cannot be in the future." };
        }
        return runRowAction(rowNumber, () => createEducationStudent(formData));
      }

      const staffNumber = getValue(values, "staff_number");
      const firstName = getValue(values, "first_name");
      const lastName = getValue(values, "last_name");
      const category = getValue(values, "staff_category");
      const email = getValue(values, "email");
      if ((staffNumber && !/^[A-Za-z0-9._/-]{1,32}$/.test(staffNumber))
        || !firstName || firstName.length > 100 || !lastName || lastName.length > 100
        || !["teaching", "non_teaching"].includes(category)
        || getValue(values, "job_title").length > 120
        || !emailIsValid(email) || getValue(values, "phone").length > 32) {
        return { row: rowNumber, error: "Check the staff number (if supplied), name, category, and contact fields." };
      }
      return runRowAction(rowNumber, () => createEducationStaff(formData));
    }));

    for (const outcome of results) {
      if ("error" in outcome && outcome.error) {
        skipped.push({ row: outcome.row, reason: outcome.error });
      } else if ("result" in outcome && outcome.result.error) {
        skipped.push({ row: outcome.row, reason: outcome.result.error });
      } else {
        created += 1;
      }
    }
  }

  return { created, skipped };
}

export async function updateEducationStaffProfile(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_staff", "staff", "directory", "edit")) {
    throw new Error("You do not have permission to edit Think Education staff profiles.");
  }

  const staffId = String(formData.get("staff_id") ?? "");
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const otherNames = String(formData.get("other_names") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const dateOfBirth = String(formData.get("date_of_birth") ?? "");
  const address = String(formData.get("address") ?? "").trim();
  const emergencyContactName = String(formData.get("emergency_contact_name") ?? "").trim();
  const emergencyContactPhone = String(formData.get("emergency_contact_phone") ?? "").trim();
  const photoResult = await getEducationStaffPhoto(formData);
  if (photoResult.error) redirect(`${getProductAppPath("think-education", `/staff/${staffId}`)}?error=photo-invalid`);
  const validDate = !dateOfBirth || isValidEducationStaffDate(dateOfBirth);
  if (!staffId || !firstName || firstName.length > 100 || !lastName || lastName.length > 100
    || otherNames.length > 100 || email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    || phone.length > 32 || !validDate || address.length > 500
    || emergencyContactName.length > 120 || emergencyContactPhone.length > 32) {
    redirect(`${getProductAppPath("think-education", `/staff/${staffId}`)}?error=invalid`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_staff_update_profile", {
    p_org_id: context.orgId,
    p_staff_id: staffId,
    p_first_name: firstName,
    p_last_name: lastName,
    p_other_names: otherNames || null,
    p_email: email || null,
    p_phone: phone || null,
    p_date_of_birth: dateOfBirth || null,
    p_address: address || null,
    p_emergency_contact_name: emergencyContactName || null,
    p_emergency_contact_phone: emergencyContactPhone || null,
  });
  if (error) {
    if (error.code === "42501") throw new Error(`Staff profile update was not authorized: ${error.message}`);
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", `/staff/${staffId}`)}?error=invalid`);
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/staff")}?error=staff`);
    console.error("Could not update Think Education staff profile:", error.message);
    redirect(`${getProductAppPath("think-education", `/staff/${staffId}`)}?error=save`);
  }

  let photoStatus: "upload" | "save" | "cleanup" | null = null;
  if (photoResult.file) {
    const { data: currentStaff, error: currentStaffError } = await supabase.from("education_staff")
      .select("branch_id, photo_path")
      .eq("org_id", context.orgId)
      .eq("id", staffId)
      .maybeSingle();
    if (currentStaffError || !currentStaff) {
      console.error("Could not load current Think Education staff photo:", currentStaffError?.message ?? "Staff member not found.");
      photoStatus = "save";
    } else {
      const uploadResult = await uploadEducationStaffPhoto(supabase, context.orgId, staffId, photoResult.file);
      if ("error" in uploadResult) {
        photoStatus = "upload";
      } else {
        const { data: updatedPhoto, error: photoPathError } = await supabase.from("education_staff")
          .update({ photo_path: uploadResult.path })
          .eq("org_id", context.orgId)
          .eq("id", staffId)
          .eq("branch_id", currentStaff.branch_id)
          .select("id")
          .maybeSingle();
        if (photoPathError || !updatedPhoto) {
          console.error("Could not save Think Education staff photo path:", photoPathError?.message ?? "Staff member not found.");
          const { error: cleanupError } = await supabase.storage.from(EDUCATION_STAFF_IMAGE_BUCKET).remove([uploadResult.path]);
          if (cleanupError) console.error("Could not remove unlinked Think Education staff photo:", cleanupError.message);
          photoStatus = "save";
        } else if (currentStaff.photo_path) {
          const { error: removeError } = await supabase.storage.from(EDUCATION_STAFF_IMAGE_BUCKET).remove([currentStaff.photo_path]);
          if (removeError) {
            console.error("Could not remove previous Think Education staff photo:", removeError.message);
            photoStatus = "cleanup";
          }
        }
      }
    }
  }

  revalidatePath("/education/staff");
  revalidatePath(`/education/staff/${staffId}`);
  const photoQuery = photoStatus ? `&photo=${photoStatus}` : "";
  redirect(`${getProductAppPath("think-education", `/staff/${staffId}`)}?saved=1${photoQuery}`);
}

export async function recordEducationStaffEmployment(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_staff", "staff", "directory", "edit")) {
    throw new Error("You do not have permission to edit Think Education employment details.");
  }

  const staffId = String(formData.get("staff_id") ?? "");
  const employmentType = String(formData.get("employment_type") ?? "");
  const jobTitle = String(formData.get("job_title") ?? "").trim();
  const departmentId = String(formData.get("department_id") ?? "");
  const effectiveOn = String(formData.get("effective_on") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const validDate = isValidEducationStaffDate(effectiveOn);
  if (!staffId || !["full_time", "part_time", "contract", "temporary", "casual"].includes(employmentType)
    || !jobTitle || jobTitle.length > 120 || (departmentId && !/^[0-9a-f-]{36}$/i.test(departmentId))
    || !validDate || !reason || reason.length > 1000) {
    redirect(`${getProductAppPath("think-education", `/staff/${staffId}`)}?error=invalid`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_staff_record_employment", {
    p_org_id: context.orgId,
    p_staff_id: staffId,
    p_employment_type: employmentType,
    p_job_title: jobTitle,
    p_department_id: departmentId || null,
    p_effective_on: effectiveOn,
    p_reason: reason,
  });
  if (error) {
    if (error.code === "42501") throw new Error(`Employment update was not authorized: ${error.message}`);
    if (error.code === "23514" || error.code === "23505") {
      redirect(`${getProductAppPath("think-education", `/staff/${staffId}`)}?error=history`);
    }
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", `/staff/${staffId}`)}?error=department`);
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/staff")}?error=staff`);
    console.error("Could not record Think Education staff employment:", error.message);
    redirect(`${getProductAppPath("think-education", `/staff/${staffId}`)}?error=save`);
  }
  revalidatePath("/education/staff");
  revalidatePath(`/education/staff/${staffId}`);
  revalidatePath("/education/activity");
  redirect(`${getProductAppPath("think-education", `/staff/${staffId}`)}?employment=1`);
}

export async function createEducationAdmission(formData: FormData): Promise<
  { success: true; applicationNumber: string }
  | { error: "invalid" | "permission" | "database_permission" | "campus" | "duplicate" | "class" | "save" }
> {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_admissions", "admissions", "applications", "create")) {
    return { error: "permission" };
  }

  const branchId = String(formData.get("branch_id") ?? "");
  const applicationNumber = String(formData.get("application_number") ?? "").trim() || generateEducationRecordNumber("APP");
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const otherNames = String(formData.get("other_names") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const dateOfBirth = String(formData.get("date_of_birth") ?? "").trim();
  const gender = String(formData.get("gender") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const guardianFirstName = String(formData.get("guardian_first_name") ?? "").trim();
  const guardianLastName = String(formData.get("guardian_last_name") ?? "").trim();
  const guardianEmail = String(formData.get("guardian_email") ?? "").trim();
  const guardianPhone = String(formData.get("guardian_phone") ?? "").trim();
  const guardianRelationship = String(formData.get("guardian_relationship") ?? "").trim();
  const hasGuardianDetails = Boolean(
    guardianFirstName || guardianLastName || guardianEmail || guardianPhone || guardianRelationship,
  );
  const requestedClassId = String(formData.get("requested_class_id") ?? "").trim();
  if (!branchId || !/^[A-Za-z0-9._/-]{1,32}$/.test(applicationNumber)
    || !firstName || firstName.length > 100 || !lastName || lastName.length > 100
    || otherNames.length > 100
    || email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    || phone.length > 32
    || (dateOfBirth && !isValidEducationStaffDate(dateOfBirth))
    || gender.length > 50 || address.length > 500
    || (hasGuardianDetails && (
      !guardianFirstName || guardianFirstName.length > 100
      || !guardianLastName || guardianLastName.length > 100
      || !guardianRelationship || guardianRelationship.length > 60
      || (!guardianEmail && !guardianPhone)
    ))
    || guardianEmail.length > 254 || (guardianEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guardianEmail))
    || guardianPhone.length > 40
    || (requestedClassId && !/^[0-9a-f-]{36}$/i.test(requestedClassId))) {
    return { error: "invalid" };
  }

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === branchId)) {
    return { error: "campus" };
  }

  const supabase = await createClient();
  if (requestedClassId) {
    if (!await canTabPermission("education_academics", "academics", "classes", "view")) {
      return { error: "permission" };
    }
    const { data: requestedClass, error: classError } = await supabase.from("education_classes")
      .select("id, academic_year_id")
      .eq("org_id", context.orgId).eq("id", requestedClassId)
      .eq("branch_id", branchId).eq("status", "active").maybeSingle();
    if (classError) {
      console.error("Could not verify the requested admission class:", classError.message);
      return { error: "save" };
    }
    if (!requestedClass) return { error: "class" };
    const { data: academicYear, error: yearError } = await supabase.from("education_academic_years")
      .select("id").eq("org_id", context.orgId)
      .eq("id", requestedClass.academic_year_id).eq("status", "active").maybeSingle();
    if (yearError) {
      console.error("Could not verify the requested class academic year:", yearError.message);
      return { error: "save" };
    }
    if (!academicYear) return { error: "class" };
  }
  const { error } = await supabase.from("education_admissions").insert({
    org_id: context.orgId,
    branch_id: branchId,
    application_number: applicationNumber,
    applicant_first_name: firstName,
    applicant_last_name: lastName,
    applicant_other_names: otherNames || null,
    applicant_email: email || null,
    applicant_phone: phone || null,
    applicant_date_of_birth: dateOfBirth || null,
    applicant_gender: gender || null,
    applicant_address: address || null,
    guardian_first_name: guardianFirstName || null,
    guardian_last_name: guardianLastName || null,
    guardian_email: guardianEmail || null,
    guardian_phone: guardianPhone || null,
    guardian_relationship: guardianRelationship || null,
    requested_class_id: requestedClassId || null,
  });
  if (error) {
    if (error.code === "23505") return { error: "duplicate" };
    if (error.code === "42501") return { error: "database_permission" };
    if (error.code === "23514" || error.code === "23502") return { error: "invalid" };
    console.error("Could not create Think Education application:", error.message);
    return { error: "save" };
  }

  revalidatePath("/education/admissions");
  return { success: true, applicationNumber };
}

export async function recordEducationAdmissionOffer(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_admissions", "admissions", "applications", "edit")
    || !await canTabPermission("education_admissions", "admissions", "applications", "approve")) {
    throw new Error("You need application edit and approval access to issue an admission offer.");
  }

  const admissionId = String(formData.get("admission_id") ?? "");
  const expiresOn = String(formData.get("expires_on") ?? "");
  const terms = String(formData.get("terms") ?? "").trim();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const today = new Date().toISOString().slice(0, 10);
  const maximumExpiry = new Date(`${today}T00:00:00.000Z`);
  maximumExpiry.setUTCDate(maximumExpiry.getUTCDate() + 365);
  if (!uuidPattern.test(admissionId) || !isValidEducationISODate(expiresOn)
    || expiresOn < today || expiresOn > maximumExpiry.toISOString().slice(0, 10) || terms.length > 2000) {
    redirect(`${getProductAppPath("think-education", "/admissions")}?error=offer`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_issue_admission_offer", {
    p_org_id: context.orgId,
    p_admission_id: admissionId,
    p_expires_on: expiresOn,
    p_terms: terms || null,
  });
  if (error) {
    if (error.code === "42501") throw new Error(`Admission offer was not authorized: ${error.message}`);
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/admissions")}?error=not-found`);
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/admissions")}?error=offer`);
    console.error("Could not issue Think Education admission offer:", error.message);
    redirect(`${getProductAppPath("think-education", "/admissions")}?error=save`);
  }

  revalidatePath("/education/admissions");
  revalidatePath("/education/activity");
  redirect(`${getProductAppPath("think-education", "/admissions")}?offer=1`);
}

export async function updateEducationAdmissionStatus(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");

  const returnToApprovals = formData.get("return_to") === "approvals";
  const admissionsPath = getProductAppPath("think-education", returnToApprovals ? "/approvals" : "/admissions");
  const admissionsReturn = (query: string) => `${admissionsPath}?${query}`;
  const admissionId = String(formData.get("admission_id") ?? "");
  const status = String(formData.get("status") ?? "");
  const decisionNote = String(formData.get("decision_note") ?? "").trim();
  const studentNumber = status === "enrolled"
    ? String(formData.get("student_number") ?? "").trim() || generateEducationRecordNumber("STU")
    : "";
  const classId = String(formData.get("class_id") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(admissionId)
    || !["under_review", "admitted", "rejected", "withdrawn", "enrolled"].includes(status)
    || decisionNote.length > 1000
    || (["rejected", "withdrawn"].includes(status) && !decisionNote)
    || (status === "enrolled" && (!/^[A-Za-z0-9._/-]{1,32}$/.test(studentNumber) || !/^[0-9a-f-]{36}$/i.test(classId)))
    || (status !== "enrolled" && (studentNumber || classId))) {
    redirect(admissionsReturn("error=invalid"));
  }
  const action = ["admitted", "rejected", "enrolled"].includes(status) ? "approve" : "edit";
  if (!await canTabPermission("education_admissions", "admissions", "applications", action)) {
    throw new Error(`You do not have permission to ${action} Think Education applications.`);
  }
  if (action === "approve" && !await canTabPermission("education_admissions", "admissions", "applications", "edit")) {
    throw new Error("You need edit access as well as approval access to update Think Education applications.");
  }
  if (status === "enrolled"
    && (!await canTabPermission("education_students", "students", "list", "create")
      || !await canTabPermission("education_academics", "academics", "classes", "view"))) {
    throw new Error("Student creation and academic class access are required to enroll an applicant.");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("education_process_admission", {
    p_org_id: context.orgId,
    p_admission_id: admissionId,
    p_status: status,
    p_decision_note: decisionNote || null,
    p_student_number: status === "enrolled" ? studentNumber : null,
    p_class_id: status === "enrolled" ? classId : null,
  });
  if (error) {
    if (error.code === "42501") throw new Error(`Admission workflow was not authorized: ${error.message}`);
    if (error.code === "23505") {
      redirect(admissionsReturn("error=student-number"));
    }
    if (error.code === "23514") {
      redirect(admissionsReturn("error=capacity"));
    }
    if (error.code === "22023") {
      if (error.message.includes("selected class")) {
        redirect(admissionsReturn("error=class"));
      }
      if (error.message.includes("offer")) {
        redirect(admissionsReturn("error=offer"));
      }
      redirect(admissionsReturn("error=transition"));
    }
    if (error.code === "P0002") {
      redirect(admissionsReturn("error=not-found"));
    }
    console.error("Could not process Think Education application:", error.message);
    redirect(admissionsReturn("error=save"));
  }
  revalidatePath("/education/students");
  if (status === "enrolled") revalidatePath("/education/guardians");
  revalidatePath("/education/academics");
  revalidatePath("/education/attendance");
  revalidatePath("/education/finance");
  revalidatePath("/education/admissions");
  revalidatePath("/education/approvals");
  redirect(admissionsReturn(`updated=1${status === "enrolled" ? "&enrolled=1" : ""}`));
}

export async function createEducationSubject(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_academics", "academics", "calendar", "create")) {
    throw new Error("You do not have permission to add Think Education subjects.");
  }
  const { hasOrganizationScope } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!hasOrganizationScope) {
    throw new Error("Adding subjects requires explicit organization-wide Think Education access.");
  }

  const name = String(formData.get("name") ?? "");
  const subjectsPath = getProductAppPath("think-education", "/subjects");
  if (!isValidEducationSubjectName(name)) redirect(`${subjectsPath}?error=invalid`);

  const supabase = await createClient();
  const { error } = await supabase.from("education_subjects").insert({
    org_id: context.orgId,
    name,
  });
  if (error) {
    if (error.code === "23505") redirect(`${subjectsPath}?error=duplicate`);
    if (error.code === "42501") throw new Error(`Subject creation was not authorized: ${error.message}`);
    console.error("Could not create Think Education subject:", error.message);
    redirect(`${subjectsPath}?error=save`);
  }

  revalidatePath("/education/subjects");
  revalidatePath("/education/results");
  revalidatePath("/education/timetables");
  redirect(`${subjectsPath}?created=1`);
}

export async function setEducationSubjectStatus(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_academics", "academics", "calendar", "view")
    || !await canTabPermission("education_academics", "academics", "calendar", "edit")) {
    throw new Error("You need academic calendar view and edit access to change subject status.");
  }
  const { hasOrganizationScope } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!hasOrganizationScope) {
    throw new Error("Managing subjects requires explicit organization-wide Think Education access.");
  }

  const subjectId = String(formData.get("subject_id") ?? "");
  const requestedStatus = String(formData.get("status") ?? "");
  const subjectsPath = getProductAppPath("think-education", "/subjects");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(subjectId)
    || !["active", "inactive"].includes(requestedStatus)) {
    redirect(`${subjectsPath}?error=invalid`);
  }
  const status = requestedStatus as "active" | "inactive";

  const supabase = await createClient();
  const { data: current, error: loadError } = await supabase.from("education_subjects")
    .select("id, name, status")
    .eq("org_id", context.orgId).eq("id", subjectId)
    .maybeSingle();
  if (loadError) throw new Error(`Could not load Think Education subject: ${loadError.message}`);
  if (!current) redirect(`${subjectsPath}?error=subject`);

  const { data: updated, error } = await supabase.from("education_subjects")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("org_id", context.orgId).eq("id", current.id).eq("status", current.status)
    .select("id").maybeSingle();
  if (error) {
    if (error.code === "42501") throw new Error(`Subject status change was not authorized: ${error.message}`);
    console.error("Could not change Think Education subject status:", error.message);
    redirect(`${subjectsPath}?error=save`);
  }
  if (!updated) redirect(`${subjectsPath}?error=conflict`);

  revalidatePath("/education/subjects");
  revalidatePath("/education/results");
  revalidatePath("/education/timetables");
  redirect(`${subjectsPath}?updated=1`);
}

export async function createEducationGradeBand(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_academics", "academics", "calendar", "create")) {
    throw new Error("You do not have permission to add Think Education grade bands.");
  }
  const { hasOrganizationScope } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!hasOrganizationScope) {
    throw new Error("Managing grade bands requires explicit organization-wide Think Education access.");
  }

  const parsed = educationGradeBandInputSchema.safeParse({
    label: formData.get("label"),
    minimumPercentage: formData.get("minimum_percentage"),
  });
  const gradeBandsPath = getProductAppPath("think-education", "/grade-bands");
  if (!parsed.success) redirect(`${gradeBandsPath}?error=invalid`);

  const supabase = await createClient();
  const { error } = await supabase.from("education_grade_bands").insert({
    org_id: context.orgId,
    label: parsed.data.label,
    minimum_percentage: parsed.data.minimumPercentage,
  });
  if (error) {
    if (error.code === "23505") redirect(`${gradeBandsPath}?error=duplicate`);
    if (error.code === "42501") throw new Error(`Grade band creation was not authorized: ${error.message}`);
    console.error("Could not create Think Education grade band:", error.message);
    redirect(`${gradeBandsPath}?error=save`);
  }

  revalidatePath("/education/grade-bands");
  revalidatePath("/education/results");
  redirect(`${gradeBandsPath}?created=1`);
}

export async function updateEducationGradeBand(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_academics", "academics", "calendar", "edit")) {
    throw new Error("You do not have permission to edit Think Education grade bands.");
  }
  const { hasOrganizationScope } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!hasOrganizationScope) {
    throw new Error("Managing grade bands requires explicit organization-wide Think Education access.");
  }

  const id = String(formData.get("band_id") ?? "");
  const parsed = educationGradeBandInputSchema.safeParse({
    label: formData.get("label"),
    minimumPercentage: formData.get("minimum_percentage"),
  });
  const gradeBandsPath = getProductAppPath("think-education", "/grade-bands");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    || !parsed.success) {
    redirect(`${gradeBandsPath}?error=invalid`);
  }

  const supabase = await createClient();
  const { data: updated, error } = await supabase.from("education_grade_bands")
    .update({
      label: parsed.data.label,
      minimum_percentage: parsed.data.minimumPercentage,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("org_id", context.orgId).eq("id", id)
    .select("id").maybeSingle();
  if (error) {
    if (error.code === "23505") redirect(`${gradeBandsPath}?error=duplicate`);
    if (error.code === "42501") throw new Error(`Grade band update was not authorized: ${error.message}`);
    console.error("Could not update Think Education grade band:", error.message);
    redirect(`${gradeBandsPath}?error=save`);
  }
  if (!updated) redirect(`${gradeBandsPath}?error=not-found`);

  revalidatePath("/education/grade-bands");
  revalidatePath("/education/results");
  redirect(`${gradeBandsPath}?updated=1`);
}

export async function deleteEducationGradeBand(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_academics", "academics", "calendar", "edit")) {
    throw new Error("You do not have permission to remove Think Education grade bands.");
  }
  const { hasOrganizationScope } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!hasOrganizationScope) {
    throw new Error("Managing grade bands requires explicit organization-wide Think Education access.");
  }

  const id = String(formData.get("band_id") ?? "");
  const gradeBandsPath = getProductAppPath("think-education", "/grade-bands");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    redirect(`${gradeBandsPath}?error=invalid`);
  }

  const supabase = await createClient();
  const { data: deleted, error } = await supabase.from("education_grade_bands")
    .delete().eq("org_id", context.orgId).eq("id", id)
    .select("id").maybeSingle();
  if (error) {
    if (error.code === "42501") throw new Error(`Grade band removal was not authorized: ${error.message}`);
    console.error("Could not remove Think Education grade band:", error.message);
    redirect(`${gradeBandsPath}?error=save`);
  }
  if (!deleted) redirect(`${gradeBandsPath}?error=not-found`);

  revalidatePath("/education/grade-bands");
  revalidatePath("/education/results");
  redirect(`${gradeBandsPath}?updated=1`);
}

export async function createEducationAcademicYear(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_academics", "academics", "calendar", "create")) {
    throw new Error("You do not have permission to create Think Education academic years.");
  }
  const { hasOrganizationScope } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!hasOrganizationScope) {
    throw new Error("Academic years require explicit organization-wide Think Education access.");
  }

  const name = String(formData.get("name") ?? "").trim();
  const startsOn = String(formData.get("starts_on") ?? "");
  const endsOn = String(formData.get("ends_on") ?? "");
  if (!name || name.length > 80 || !/^\d{4}-\d{2}-\d{2}$/.test(startsOn)
    || !/^\d{4}-\d{2}-\d{2}$/.test(endsOn) || endsOn < startsOn) {
    redirect(`${getProductAppPath("think-education", "/academics")}?error=invalid`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("education_academic_years").insert({
    org_id: context.orgId,
    name,
    starts_on: startsOn,
    ends_on: endsOn,
  });
  if (error) {
    if (error.code === "23505") redirect(`${getProductAppPath("think-education", "/academics")}?error=duplicate`);
    console.error("Could not create Think Education academic year:", error.message);
    redirect(`${getProductAppPath("think-education", "/academics")}?error=save`);
  }
  revalidatePath("/education/academics");
  redirect(`${getProductAppPath("think-education", "/academics")}?created=1`);
}

export async function createEducationAcademicTerm(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_academics", "academics", "calendar", "create")) {
    throw new Error("You do not have permission to create Think Education academic terms.");
  }
  const { hasOrganizationScope } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!hasOrganizationScope) {
    throw new Error("Academic terms require explicit organization-wide Think Education access.");
  }

  const academicYearId = String(formData.get("academic_year_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const startsOn = String(formData.get("starts_on") ?? "");
  const endsOn = String(formData.get("ends_on") ?? "");
  const sequenceValue = String(formData.get("sequence_number") ?? "");
  const sequenceNumber = Number(sequenceValue);
  if (!/^[0-9a-f-]{36}$/i.test(academicYearId) || !name || name.length > 80
    || !isValidEducationISODate(startsOn) || !isValidEducationISODate(endsOn)
    || endsOn < startsOn || !/^[1-9]\d{0,3}$/.test(sequenceValue)
    || !Number.isSafeInteger(sequenceNumber)) {
    redirect(`${getProductAppPath("think-education", "/academics")}?error=invalid`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_create_academic_term", {
    p_org_id: context.orgId,
    p_academic_year_id: academicYearId,
    p_name: name,
    p_starts_on: startsOn,
    p_ends_on: endsOn,
    p_sequence_number: sequenceNumber,
  });
  if (error) {
    if (error.code === "42501") throw new Error(`Academic term creation was not authorized: ${error.message}`);
    if (error.code === "23505") redirect(`${getProductAppPath("think-education", "/academics")}?error=duplicate`);
    if (error.code === "23514") redirect(`${getProductAppPath("think-education", "/academics")}?error=overlap`);
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/academics")}?error=invalid`);
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/academics")}?error=year`);
    console.error("Could not create Think Education academic term:", error.message);
    redirect(`${getProductAppPath("think-education", "/academics")}?error=save`);
  }
  revalidatePath("/education/academics");
  revalidatePath("/education/timetables");
  revalidatePath("/education/examinations");
  redirect(`${getProductAppPath("think-education", "/academics")}?termCreated=1`);
}

export async function setEducationAcademicTermStatus(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  const termId = String(formData.get("term_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(termId) || !["active", "completed"].includes(status)) {
    redirect(`${getProductAppPath("think-education", "/academics")}?error=invalid`);
  }
  const requiredAction = status === "completed" ? "approve" : "edit";
  if (!await canTabPermission("education_academics", "academics", "calendar", requiredAction)
    || !await canTabPermission("education_academics", "academics", "calendar", "edit")) {
    throw new Error(`You need ${requiredAction} and edit access to change the academic term status.`);
  }
  const { hasOrganizationScope } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!hasOrganizationScope) {
    throw new Error("Organization-wide Think Education access is required to manage academic terms.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_transition_academic_term", {
    p_org_id: context.orgId,
    p_term_id: termId,
    p_status: status,
  });
  if (error) {
    if (error.code === "22023" || error.code === "P0002") {
      redirect(`${getProductAppPath("think-education", "/academics")}?error=term-transition`);
    }
    if (error.code === "42501") throw new Error(`Academic term status change was not authorized: ${error.message}`);
    console.error("Could not change Think Education academic term status:", error.message);
    redirect(`${getProductAppPath("think-education", "/academics")}?error=save`);
  }
  revalidatePath("/education/academics");
  revalidatePath("/education/timetables");
  revalidatePath("/education/examinations");
  redirect(`${getProductAppPath("think-education", "/academics")}?termUpdated=1`);
}

export async function setEducationAcademicYearStatus(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  const academicYearId = String(formData.get("academic_year_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!academicYearId || !["active", "completed"].includes(status)) {
    redirect(`${getProductAppPath("think-education", "/academics")}?error=invalid`);
  }
  const requiredAction = status === "completed" ? "approve" : "edit";
  if (!await canTabPermission("education_academics", "academics", "calendar", requiredAction)
    || !await canTabPermission("education_academics", "academics", "calendar", "edit")) {
    throw new Error(`You need ${requiredAction} and edit access to change the academic year status.`);
  }
  const { hasOrganizationScope } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!hasOrganizationScope) {
    throw new Error("Organization-wide Think Education access is required to manage academic years.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_set_academic_year_status", {
    p_org_id: context.orgId,
    p_academic_year_id: academicYearId,
    p_status: status,
  });
  if (error) {
    if (error.code === "22023" || error.code === "P0002") {
      redirect(`${getProductAppPath("think-education", "/academics")}?error=transition`);
    }
    if (error.code === "23514") {
      redirect(`${getProductAppPath("think-education", "/academics")}?error=terms-incomplete`);
    }
    if (error.code === "42501") throw new Error(`Academic year status change was not authorized: ${error.message}`);
    console.error("Could not change Think Education academic year status:", error.message);
    redirect(`${getProductAppPath("think-education", "/academics")}?error=save`);
  }
  revalidatePath("/education/academics");
  revalidatePath("/education/timetables");
  revalidatePath("/education/examinations");
  revalidatePath("/education/promotion");
  redirect(`${getProductAppPath("think-education", "/academics")}?updated=1`);
}

export async function createEducationClass(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_academics", "academics", "classes", "create")) {
    throw new Error("You do not have permission to create Think Education classes.");
  }

  const branchId = String(formData.get("branch_id") ?? "");
  const academicYearId = String(formData.get("academic_year_id") ?? "");
  const classTeacherId = String(formData.get("class_teacher_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const classCode = String(formData.get("class_code") ?? "").trim();
  const levelName = String(formData.get("level_name") ?? "").trim();
  const streamName = String(formData.get("stream_name") ?? "").trim();
  const curriculumStage = String(formData.get("curriculum_stage") ?? "").trim();
  const medium = String(formData.get("medium") ?? "").trim();
  const room = String(formData.get("room") ?? "").trim();
  const capacityValue = String(formData.get("capacity") ?? "").trim();
  const capacity = capacityValue ? Number(capacityValue) : null;
  if (!branchId || !academicYearId || !name || name.length > 100 || classCode.length > 40
    || levelName.length > 80 || streamName.length > 80
    || curriculumStage.length > 80 || medium.length > 80 || room.length > 80
    || (classTeacherId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(classTeacherId))
    || (capacity !== null && (!Number.isInteger(capacity) || capacity < 1))) {
    redirect(`${getProductAppPath("think-education", "/academics?tab=classes")}&error=invalid`);
  }
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === branchId)) {
    throw new Error("You cannot create a class outside your assigned Think Education campuses.");
  }

  const supabase = await createClient();
  if (classTeacherId) {
    if (!await canTabPermission("education_staff", "staff", "records", "view")) {
      throw new Error("Staff view permission is required to assign a class teacher.");
    }
    const { data: teacher, error: teacherError } = await supabase.from("education_staff")
      .select("id")
      .eq("org_id", context.orgId)
      .eq("branch_id", branchId)
      .eq("id", classTeacherId)
      .eq("staff_category", "teaching")
      .eq("status", "active")
      .maybeSingle();
    if (teacherError) {
      console.error("Could not validate the class teacher:", teacherError.message);
      redirect(`${getProductAppPath("think-education", "/academics?tab=classes")}&error=save`);
    }
    if (!teacher) redirect(`${getProductAppPath("think-education", "/academics?tab=classes")}&error=teacher`);
  }

  const { error } = await supabase.from("education_classes").insert({
    org_id: context.orgId,
    branch_id: branchId,
    academic_year_id: academicYearId,
    class_teacher_id: classTeacherId || null,
    name,
    class_code: classCode || null,
    level_name: levelName || null,
    stream_name: streamName || null,
    room: room || null,
    curriculum_stage: curriculumStage || null,
    medium: medium || null,
    capacity,
  });
  if (error) {
    if (error.code === "23505") {
      const duplicateCode = `${error.message} ${error.details ?? ""}`.includes("education_classes_class_code_unique");
      redirect(`${getProductAppPath("think-education", "/academics?tab=classes")}&error=${duplicateCode ? "duplicate-code" : "duplicate"}`);
    }
    console.error("Could not create Think Education class:", error.message);
    redirect(`${getProductAppPath("think-education", "/academics?tab=classes")}&error=save`);
  }
  revalidatePath("/education/academics");
  redirect(`${getProductAppPath("think-education", "/academics?tab=classes")}&created=1`);
}

export async function setEducationClassTeacher(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_academics", "academics", "classes", "edit")) {
    throw new Error("You do not have permission to update Think Education class teachers.");
  }
  if (!await canTabPermission("education_staff", "staff", "records", "view")) {
    throw new Error("Staff view permission is required to manage class teachers.");
  }

  const classId = String(formData.get("class_id") ?? "").trim();
  const classTeacherId = String(formData.get("class_teacher_id") ?? "").trim();
  const classPath = `${getProductAppPath("think-education", "/academics")}?tab=classes`;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(classId) || (classTeacherId && !uuidPattern.test(classTeacherId))) {
    redirect(`${classPath}&error=invalid`);
  }

  const supabase = await createClient();
  const { data: classroom, error: classError } = await supabase.from("education_classes")
    .select("id, branch_id, class_teacher_id")
    .eq("org_id", context.orgId)
    .eq("id", classId)
    .maybeSingle();
  if (classError) {
    console.error("Could not load the Think Education class for teacher assignment:", classError.message);
    redirect(`${classPath}&error=save`);
  }
  if (!classroom) redirect(`${classPath}&error=class`);

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === classroom.branch_id)) {
    redirect(`${classPath}&error=campus`);
  }

  if (classTeacherId && classTeacherId !== classroom.class_teacher_id) {
    const { data: teacher, error: teacherError } = await supabase.from("education_staff")
      .select("id")
      .eq("org_id", context.orgId)
      .eq("branch_id", classroom.branch_id)
      .eq("id", classTeacherId)
      .eq("staff_category", "teaching")
      .eq("status", "active")
      .maybeSingle();
    if (teacherError) {
      console.error("Could not validate the class teacher:", teacherError.message);
      redirect(`${classPath}&error=save`);
    }
    if (!teacher) redirect(`${classPath}&error=teacher`);
  }

  const { data: updatedClass, error: updateError } = await supabase.from("education_classes")
    .update({ class_teacher_id: classTeacherId || null, updated_at: new Date().toISOString() })
    .eq("org_id", context.orgId)
    .eq("id", classId)
    .eq("branch_id", classroom.branch_id)
    .select("id")
    .maybeSingle();
  if (updateError) {
    console.error("Could not update the Think Education class teacher:", updateError.message);
    redirect(`${classPath}&error=save`);
  }
  if (!updatedClass) redirect(`${classPath}&error=class`);

  revalidatePath("/education/academics");
  revalidatePath("/education/academics/curriculum");
  revalidatePath("/education/students", "layout");
  redirect(`${classPath}&classTeacherSaved=1`);
}

export async function saveEducationClassSubject(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  const [canCreate, canEdit] = await Promise.all([
    canTabPermission("education_academics", "academics", "classes", "create"),
    canTabPermission("education_academics", "academics", "classes", "edit"),
  ]);
  if (!canCreate && !canEdit) {
    throw new Error("You do not have permission to manage Think Education class subjects.");
  }

  const classId = String(formData.get("class_id") ?? "");
  const subjectId = String(formData.get("subject_id") ?? "");
  const leadStaffId = String(formData.get("lead_staff_id") ?? "").trim();
  const status = String(formData.get("status") ?? "");
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const returnPath = getProductAppPath("think-education", "/academics/curriculum");
  if (!uuidPattern.test(classId) || !uuidPattern.test(subjectId)
    || (leadStaffId && !uuidPattern.test(leadStaffId))
    || !["active", "inactive"].includes(status)) {
    redirect(`${returnPath}?error=invalid`);
  }

  const supabase = await createClient();
  const { data: classroom, error: classError } = await supabase.from("education_classes")
    .select("id, branch_id")
    .eq("org_id", context.orgId).eq("id", classId)
    .maybeSingle();
  if (classError) throw new Error(`Could not verify the selected Think Education class: ${classError.message}`);
  if (!classroom) redirect(`${returnPath}?error=class`);

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === classroom.branch_id)) {
    throw new Error("You cannot manage class subjects outside your assigned Think Education campuses.");
  }

  const { error } = await supabase.rpc("education_set_class_subject", {
    p_org_id: context.orgId,
    p_class_id: classId,
    p_subject_id: subjectId,
    p_lead_staff_id: leadStaffId || null,
    p_status: status,
  });
  if (error) {
    if (error.code === "42501") throw new Error(`Class-subject assignment was not authorized: ${error.message}`);
    if (error.code === "22023") {
      const errorType = error.message.includes("teacher") ? "teacher" : "subject";
      redirect(`${returnPath}?error=${errorType}`);
    }
    console.error("Could not save Think Education class-subject assignment:", error.message);
    redirect(`${returnPath}?error=save`);
  }

  revalidatePath("/education/academics");
  revalidatePath("/education/academics/curriculum");
  revalidatePath("/education/timetables");
  redirect(`${returnPath}?saved=1`);
}

export async function saveEducationAttendance(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");

  const branchId = String(formData.get("branch_id") ?? "");
  const studentId = String(formData.get("student_id") ?? "");
  const attendanceDate = String(formData.get("attendance_date") ?? "");
  const status = String(formData.get("status") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!branchId || !studentId || !/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate)
    || !["present", "absent", "late", "excused"].includes(status) || note.length > 500) {
    redirect(`${getProductAppPath("think-education", "/attendance")}?error=invalid`);
  }
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === branchId)) {
    throw new Error("You cannot record attendance outside your assigned Think Education campuses.");
  }
  const supabase = await createClient();
  const { data: student, error: studentError } = await supabase.from("education_students")
    .select("id")
    .eq("org_id", context.orgId).eq("branch_id", branchId).eq("id", studentId)
    .maybeSingle();
  if (studentError) throw new Error(`Could not verify student campus: ${studentError.message}`);
  if (!student) throw new Error("The selected student is not in your assigned campus.");

  const { data: existing, error: existingError } = await supabase.from("education_attendance")
    .select("id")
    .eq("org_id", context.orgId).eq("student_id", studentId).eq("attendance_date", attendanceDate)
    .maybeSingle();
  if (existingError) throw new Error(`Could not check existing student attendance: ${existingError.message}`);
  const action = existing ? "edit" : "create";
  if (!await canTabPermission("education_attendance", "attendance", "register", action)) {
    throw new Error(`You do not have permission to ${action} Think Education attendance.`);
  }

  const attendanceRecord = {
    org_id: context.orgId,
    branch_id: branchId,
    student_id: studentId,
    staff_id: null,
    attendance_date: attendanceDate,
    status: status as "present" | "absent" | "late" | "excused",
    note: note || null,
    recorded_by: context.userId,
  };
  const result = existing
    ? await supabase.from("education_attendance").update(attendanceRecord).eq("org_id", context.orgId).eq("id", existing.id)
    : await supabase.from("education_attendance").insert(attendanceRecord);
  if (result.error) {
    if (result.error.code === "23505") redirect(`${getProductAppPath("think-education", "/attendance")}?error=duplicate`);
    console.error("Could not save Think Education attendance:", result.error.message);
    redirect(`${getProductAppPath("think-education", "/attendance")}?error=save`);
  }
  revalidatePath("/education/attendance");
  redirect(`${getProductAppPath("think-education", "/attendance")}?saved=1&date=${encodeURIComponent(attendanceDate)}`);
}

export async function saveEducationLessonAttendance(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");

  const parsed = educationLessonAttendanceInputSchema.safeParse({
    timetableEntryId: String(formData.get("timetable_entry_id") ?? ""),
    studentId: String(formData.get("student_id") ?? ""),
    attendanceDate: String(formData.get("attendance_date") ?? ""),
    status: String(formData.get("status") ?? ""),
    note: String(formData.get("note") ?? "").trim(),
  });
  if (!parsed.success) {
    redirect(`${getProductAppPath("think-education", "/attendance/lessons")}?error=invalid`);
  }
  if (!await canTabPermission("education_attendance", "attendance", "register", "create")
    && !await canTabPermission("education_attendance", "attendance", "register", "edit")) {
    throw new Error("You do not have permission to record Think Education lesson attendance.");
  }

  const supabase = await createClient();
  const { data: timetableEntry, error: timetableError } = await supabase.from("education_timetable_entries")
    .select("id, branch_id, status")
    .eq("org_id", context.orgId).eq("id", parsed.data.timetableEntryId)
    .maybeSingle();
  if (timetableError) throw new Error(`Could not load timetable lesson for attendance: ${timetableError.message}`);
  if (!timetableEntry || timetableEntry.status !== "active") {
    redirect(`${getProductAppPath("think-education", "/attendance/lessons")}?error=lesson`);
  }
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === timetableEntry.branch_id)) {
    throw new Error("You cannot record lesson attendance outside your assigned campuses.");
  }

  const { error } = await supabase.rpc("education_record_lesson_attendance", {
    p_org_id: context.orgId,
    p_timetable_entry_id: parsed.data.timetableEntryId,
    p_student_id: parsed.data.studentId,
    p_attendance_date: parsed.data.attendanceDate,
    p_status: parsed.data.status,
    p_note: parsed.data.note || null,
  });
  if (error) {
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/attendance/lessons")}?error=invalid`);
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/attendance/lessons")}?error=lesson`);
    if (error.code === "42501") throw new Error(`Lesson attendance was not authorized: ${error.message}`);
    console.error("Could not save Think Education lesson attendance:", error.message);
    redirect(`${getProductAppPath("think-education", "/attendance/lessons")}?error=save`);
  }
  revalidatePath("/education/attendance/lessons");
  redirect(`${getProductAppPath("think-education", "/attendance/lessons")}?saved=1&date=${encodeURIComponent(parsed.data.attendanceDate)}&lesson=${encodeURIComponent(parsed.data.timetableEntryId)}`);
}

export async function saveEducationStaffAttendance(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");

  const branchId = String(formData.get("branch_id") ?? "");
  const staffId = String(formData.get("staff_id") ?? "");
  const attendanceDate = String(formData.get("attendance_date") ?? "");
  const status = String(formData.get("status") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(attendanceDate)
    ? new Date(`${attendanceDate}T00:00:00.000Z`)
    : null;
  const validDate = parsedDate !== null && Number.isFinite(parsedDate.getTime())
    && parsedDate.toISOString().slice(0, 10) === attendanceDate;
  if (!branchId || !staffId || !validDate
    || !["present", "absent", "late", "excused"].includes(status) || note.length > 500) {
    redirect(`${getProductAppPath("think-education", "/attendance/staff")}?error=invalid`);
  }
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === branchId)) {
    throw new Error("You cannot record staff attendance outside your assigned Think Education campuses.");
  }

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase.from("education_attendance")
    .select("id")
    .eq("org_id", context.orgId).eq("staff_id", staffId).eq("attendance_date", attendanceDate)
    .maybeSingle();
  if (existingError) throw new Error(`Could not check existing staff attendance: ${existingError.message}`);
  const action = existing ? "edit" : "create";
  if (!await canTabPermission("education_attendance", "attendance", "staff", action)) {
    throw new Error(`You do not have permission to ${action} Think Education staff attendance.`);
  }

  const { data: attendanceId, error } = await supabase.rpc("education_record_staff_attendance", {
    p_org_id: context.orgId,
    p_branch_id: branchId,
    p_staff_id: staffId,
    p_attendance_date: attendanceDate,
    p_status: status,
    p_note: note || null,
  });
  if (error) {
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/attendance/staff")}?error=invalid`);
    if (error.code === "42501") throw new Error("You do not have permission to record or correct staff attendance at this campus.");
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/attendance/staff")}?error=staff`);
    console.error("Could not save Think Education staff attendance:", error.message);
    redirect(`${getProductAppPath("think-education", "/attendance/staff")}?error=save`);
  }
  if (!attendanceId) throw new Error("The staff attendance record was not returned after saving.");

  revalidatePath("/education/attendance/staff");
  redirect(`${getProductAppPath("think-education", "/attendance/staff")}?saved=1&date=${encodeURIComponent(attendanceDate)}&branch=${encodeURIComponent(branchId)}`);
}

export async function createEducationStaffLeaveRequest(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_staff", "staff", "leave", "create")) {
    throw new Error("You do not have permission to request Think Education staff leave.");
  }

  const branchId = String(formData.get("branch_id") ?? "");
  const staffId = String(formData.get("staff_id") ?? "");
  const leaveType = String(formData.get("leave_type") ?? "");
  const startsOn = String(formData.get("starts_on") ?? "");
  const endsOn = String(formData.get("ends_on") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const isDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };
  if (!branchId || !staffId || !["annual", "sick", "personal", "maternity", "paternity", "unpaid", "other"].includes(leaveType)
    || !isDate(startsOn) || !isDate(endsOn) || endsOn < startsOn
    || !reason || reason.length > 2000) {
    redirect(`${getProductAppPath("think-education", "/staff/leave")}?error=invalid`);
  }
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === branchId)) {
    throw new Error("You cannot request leave for a staff member outside your assigned campuses.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_staff_leave_request", {
    p_org_id: context.orgId,
    p_branch_id: branchId,
    p_staff_id: staffId,
    p_leave_type: leaveType,
    p_starts_on: startsOn,
    p_ends_on: endsOn,
    p_reason: reason,
  });
  if (error) {
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/staff/leave")}?error=invalid`);
    if (error.code === "23505") redirect(`${getProductAppPath("think-education", "/staff/leave")}?error=overlap`);
    if (error.code === "42501") throw new Error("You do not have permission to request staff leave at this campus.");
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/staff/leave")}?error=staff`);
    console.error("Could not create Think Education staff leave request:", error.message);
    redirect(`${getProductAppPath("think-education", "/staff/leave")}?error=save`);
  }
  revalidatePath("/education/staff/leave");
  redirect(`${getProductAppPath("think-education", "/staff/leave")}?created=1`);
}

export async function decideEducationStaffLeaveRequest(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_staff", "staff", "leave", "approve")) {
    throw new Error("You do not have permission to decide Think Education staff leave requests.");
  }

  const returnToApprovals = formData.get("return_to") === "approvals";
  const leavePath = getProductAppPath("think-education", returnToApprovals ? "/approvals" : "/staff/leave");
  const leaveReturn = (query: string) => `${leavePath}?${query}`;
  const requestId = String(formData.get("request_id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const decisionNote = String(formData.get("decision_note") ?? "").trim();
  if (!EDUCATION_COMMUNICATION_UUID_PATTERN.test(requestId) || !["approved", "rejected"].includes(decision)
    || decisionNote.length > 1000 || (decision === "rejected" && !decisionNote)) {
    redirect(leaveReturn("error=invalid"));
  }
  const supabase = await createClient();
  const { data: request, error: requestError } = await supabase.from("education_staff_leave_requests")
    .select("requested_by").eq("org_id", context.orgId).eq("id", requestId).maybeSingle();
  if (requestError) throw new Error(`Could not load the Think Education leave request: ${requestError.message}`);
  if (!request) redirect(leaveReturn("error=transition"));
  if (request.requested_by === context.userId) redirect(leaveReturn("error=permission"));
  const { error } = await supabase.rpc("education_staff_leave_decide", {
    p_org_id: context.orgId,
    p_request_id: requestId,
    p_decision: decision,
    p_decision_note: decisionNote || null,
  });
  if (error) {
    if (error.code === "22023") redirect(leaveReturn("error=invalid"));
    if (error.code === "42501") redirect(leaveReturn("error=permission"));
    if (error.code === "23505") redirect(leaveReturn("error=overlap"));
    if (error.code === "P0002") redirect(leaveReturn("error=transition"));
    console.error("Could not decide Think Education staff leave request:", error.message);
    redirect(leaveReturn("error=save"));
  }
  revalidatePath("/education/staff/leave");
  revalidatePath("/education/approvals");
  redirect(leaveReturn("updated=1"));
}

export async function createEducationStaffTransfer(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_staff", "staff", "transfers", "create")) {
    throw new Error("You do not have permission to request Think Education staff transfers.");
  }

  const staffNumber = String(formData.get("staff_number") ?? "").trim();
  const sourceBranchId = String(formData.get("source_branch_id") ?? "");
  const destinationBranchId = String(formData.get("destination_branch_id") ?? "");
  const effectiveOn = String(formData.get("effective_on") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(effectiveOn)
    ? new Date(`${effectiveOn}T00:00:00.000Z`)
    : null;
  const validDate = parsedDate !== null && Number.isFinite(parsedDate.getTime())
    && parsedDate.toISOString().slice(0, 10) === effectiveOn;
  const requestPath = getProductAppPath("think-education", "/staff/transfers/request");
  if (!/^[A-Za-z0-9._/-]{1,32}$/.test(staffNumber) || !sourceBranchId || !destinationBranchId
    || sourceBranchId === destinationBranchId || !validDate || !reason || reason.length > 1000) {
    redirect(`${requestPath}?error=invalid`);
  }

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === sourceBranchId)
    || !campuses.some((campus) => campus.id === destinationBranchId)) {
    throw new Error("You must have assigned access to both campuses to request a staff transfer.");
  }
  const supabase = await createClient();
  const { data: staff, error: staffError } = await supabase.from("education_staff")
    .select("id")
    .eq("org_id", context.orgId).eq("branch_id", sourceBranchId)
    .eq("staff_number", staffNumber).eq("status", "active")
    .maybeSingle();
  if (staffError) throw new Error(`Could not verify staff for transfer: ${staffError.message}`);
  if (!staff) redirect(`${requestPath}?error=staff`);

  const { error } = await supabase.rpc("education_staff_transfer_request", {
    p_org_id: context.orgId,
    p_staff_id: staff.id,
    p_source_branch_id: sourceBranchId,
    p_destination_branch_id: destinationBranchId,
    p_effective_on: effectiveOn,
    p_reason: reason,
  });
  if (error) {
    if (error.code === "22023") redirect(`${requestPath}?error=invalid`);
    if (error.code === "23505") redirect(`${requestPath}?error=pending`);
    if (error.code === "23514") redirect(`${requestPath}?error=conflict`);
    if (error.code === "42501") throw new Error("You do not have permission to request that staff transfer.");
    if (error.code === "P0002") redirect(`${requestPath}?error=staff`);
    console.error("Could not create Think Education staff transfer:", error.message);
    redirect(`${requestPath}?error=save`);
  }
  revalidatePath("/education/staff/transfers");
  revalidatePath("/education/staff");
  redirect(`${requestPath}?created=1`);
}

export async function transitionEducationStaffTransfer(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  const transferId = String(formData.get("transfer_id") ?? "");
  const status = String(formData.get("status") ?? "");
  const reviewNote = String(formData.get("review_note") ?? "").trim();
  if (!transferId || !["approved", "rejected", "completed"].includes(status)
    || reviewNote.length > 1000 || (status === "rejected" && !reviewNote)
    || (status !== "rejected" && reviewNote)) {
    redirect(`${getProductAppPath("think-education", "/staff/transfers")}?error=invalid`);
  }
  const nextStatus = status as "approved" | "rejected" | "completed";
  const action = nextStatus === "completed" ? "edit" : "approve";
  if (!await canTabPermission("education_staff", "staff", "transfers", action)) {
    throw new Error(`You do not have permission to ${action} Think Education staff transfers.`);
  }

  const supabase = await createClient();
  const { data: transfer, error: transferError } = await supabase.from("education_staff_transfers")
    .select("id, source_branch_id, destination_branch_id, status")
    .eq("org_id", context.orgId).eq("id", transferId).maybeSingle();
  if (transferError) throw new Error(`Could not load Think Education staff transfer: ${transferError.message}`);
  if (!transfer) throw new Error("The Think Education staff transfer was not found or is outside your campus access.");
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === transfer.source_branch_id)
    || !campuses.some((campus) => campus.id === transfer.destination_branch_id)) {
    throw new Error("You must have assigned access to both campuses to process this staff transfer.");
  }
  const validTransition = nextStatus === "completed"
    ? transfer.status === "approved"
    : transfer.status === "pending";
  if (!validTransition) redirect(`${getProductAppPath("think-education", "/staff/transfers")}?error=transition`);

  const { error } = await supabase.rpc("education_transition_staff_transfer", {
    p_transfer_id: transferId,
    p_status: nextStatus,
    p_review_note: reviewNote || null,
  });
  if (error) {
    if (error.code === "42501") throw new Error(`Staff transfer was not authorized: ${error.message}`);
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/staff/transfers")}?error=transition`);
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/staff/transfers")}?error=transition`);
    if (error.code === "23514") redirect(`${getProductAppPath("think-education", "/staff/transfers")}?error=conflict`);
    console.error("Could not process Think Education staff transfer:", error.message);
    redirect(`${getProductAppPath("think-education", "/staff/transfers")}?error=save`);
  }
  revalidatePath("/education/staff/transfers");
  revalidatePath("/education/staff");
  revalidatePath("/education/attendance/staff");
  revalidatePath("/education/staff/leave");
  revalidatePath("/education/timetables");
  revalidatePath("/education/inventory");
  redirect(`${getProductAppPath("think-education", "/staff/transfers")}?updated=1`);
}

export async function createEducationExamination(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_examinations", "examinations", "schedule", "create")) {
    throw new Error("You do not have permission to create Think Education examinations.");
  }

  const branchId = String(formData.get("branch_id") ?? "");
  const academicYearId = String(formData.get("academic_year_id") ?? "");
  const termId = String(formData.get("term_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("examination_type") ?? "").trim();
  const startsAt = String(formData.get("starts_at") ?? "").trim();
  const endsAt = String(formData.get("ends_at") ?? "").trim();
  if (!branchId || !academicYearId || !name || name.length > 120 || !type || type.length > 60
    || (startsAt && Number.isNaN(Date.parse(startsAt))) || (endsAt && Number.isNaN(Date.parse(endsAt)))
    || (startsAt && endsAt && Date.parse(endsAt) < Date.parse(startsAt))) {
    redirect(`${getProductAppPath("think-education", "/examinations")}?error=invalid`);
  }
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === branchId)) {
    throw new Error("You cannot schedule an examination outside your assigned campuses.");
  }

  const supabase = await createClient();
  if (termId) {
    const { data: term, error: termError } = await supabase.from("education_academic_terms")
      .select("id")
      .eq("org_id", context.orgId).eq("id", termId).eq("academic_year_id", academicYearId)
      .maybeSingle();
    if (termError) throw new Error(`Could not verify the selected academic term: ${termError.message}`);
    if (!term) redirect(`${getProductAppPath("think-education", "/examinations")}?error=invalid`);
  }
  const { error } = await supabase.from("education_examinations").insert({
    org_id: context.orgId,
    branch_id: branchId,
    academic_year_id: academicYearId,
    term_id: termId || null,
    name,
    examination_type: type,
    starts_at: startsAt ? new Date(startsAt).toISOString() : null,
    ends_at: endsAt ? new Date(endsAt).toISOString() : null,
    created_by: context.userId,
  });
  if (error) {
    if (error.code === "23505") redirect(`${getProductAppPath("think-education", "/examinations")}?error=duplicate`);
    console.error("Could not create Think Education examination:", error.message);
    redirect(`${getProductAppPath("think-education", "/examinations")}?error=save`);
  }
  revalidatePath("/education/examinations");
  redirect(`${getProductAppPath("think-education", "/examinations")}?created=1`);
}

export async function updateEducationExaminationStatus(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  const examinationId = String(formData.get("examination_id") ?? "");
  const nextStatus = String(formData.get("status") ?? "");
  if (!examinationId || !["scheduled", "in_progress", "completed", "results_pending", "published", "cancelled"].includes(nextStatus)) {
    redirect(`${getProductAppPath("think-education", "/examinations")}?error=invalid`);
  }
  const typedNextStatus = nextStatus as "scheduled" | "in_progress" | "completed" | "results_pending" | "published" | "cancelled";
  const action = typedNextStatus === "published" ? "publish" : "edit";
  if (!await canTabPermission("education_examinations", "examinations", "schedule", action)) {
    throw new Error(`You do not have permission to ${action} Think Education examinations.`);
  }
  if (action === "publish" && !await canTabPermission("education_examinations", "examinations", "schedule", "edit")) {
    throw new Error("You need edit access as well as publish access to publish Think Education examination results.");
  }

  const supabase = await createClient();
  const { data: examination, error: examinationError } = await supabase.from("education_examinations")
    .select("id, branch_id, status")
    .eq("org_id", context.orgId).eq("id", examinationId)
    .maybeSingle();
  if (examinationError) throw new Error(`Could not load Think Education examination: ${examinationError.message}`);
  if (!examination) throw new Error("The Think Education examination was not found or is outside your access scope.");
  const allowedNextStatuses: Record<string, string[]> = {
    draft: ["scheduled", "cancelled"],
    scheduled: ["in_progress", "cancelled"],
    in_progress: ["completed", "cancelled"],
    completed: ["results_pending"],
    results_pending: ["published"],
  };
  if (!allowedNextStatuses[examination.status]?.includes(typedNextStatus)) {
    redirect(`${getProductAppPath("think-education", "/examinations")}?error=invalid`);
  }
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === examination.branch_id)) {
    throw new Error("You cannot change an examination outside your assigned campuses.");
  }

  const { error } = await supabase.from("education_examinations").update({ status: typedNextStatus })
    .eq("org_id", context.orgId).eq("id", examinationId);
  if (error) {
    console.error("Could not update Think Education examination:", error.message);
    redirect(`${getProductAppPath("think-education", "/examinations")}?error=save`);
  }
  revalidatePath("/education/examinations");
  redirect(`${getProductAppPath("think-education", "/examinations")}?updated=1`);
}

export async function saveEducationAssessmentComponents(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_results", "results", "gradebook", "edit")) {
    throw new Error("You do not have permission to configure Think Education assessment components.");
  }

  const examinationId = String(formData.get("examination_id") ?? "");
  const subjectId = String(formData.get("subject_id") ?? "");
  let rawComponents: unknown;
  try {
    rawComponents = JSON.parse(String(formData.get("components_json") ?? ""));
  } catch {
    redirect(`${getProductAppPath("think-education", "/results")}?error=components`);
  }
  const parsedComponents = educationAssessmentComponentsSchema.safeParse(rawComponents);
  if (!parsedComponents.success || !examinationId || !subjectId) {
    redirect(`${getProductAppPath("think-education", "/results")}?error=components`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_save_assessment_components", {
    p_org_id: context.orgId,
    p_examination_id: examinationId,
    p_subject_id: subjectId,
    p_components: parsedComponents.data.map((component) => ({
      id: component.id,
      name: component.name,
      weight_percentage: component.weightPercentage,
      maximum_score: component.maximumScore,
    })),
  });
  if (error) {
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/results")}?error=components`);
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/results")}?error=not-found`);
    if (error.code === "42501") throw new Error("You are not authorized to configure assessment components at this campus.");
    console.error("Could not save Think Education assessment components:", error.message);
    redirect(`${getProductAppPath("think-education", "/results")}?error=save`);
  }

  revalidatePath("/education/results");
  redirect(`${getProductAppPath("think-education", "/results")}?examination=${encodeURIComponent(examinationId)}&components=1`);
}

export async function createEducationResult(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_results", "results", "gradebook", "create")) {
    throw new Error("You do not have permission to enter Think Education results.");
  }
  if (!await canTabPermission("education_academics", "academics", "calendar", "view")) {
    throw new Error("Academic calendar view access is required to select an approved subject.");
  }

  const examinationId = String(formData.get("examination_id") ?? "");
  const studentNumber = String(formData.get("student_number") ?? "").trim();
  const subjectId = String(formData.get("subject_id") ?? "");
  const scoreValue = String(formData.get("score") ?? "").trim();
  const maximumScoreValue = String(formData.get("maximum_score") ?? "").trim();
  const score = scoreValue ? Number(scoreValue) : null;
  const maximumScore = maximumScoreValue ? Number(maximumScoreValue) : null;
  const gradeOverride = String(formData.get("grade_override") ?? "").trim();
  let rawComponentScores: unknown = [];
  const componentScoresValue = String(formData.get("component_scores_json") ?? "");
  if (componentScoresValue) {
    try {
      rawComponentScores = JSON.parse(componentScoresValue);
    } catch {
      redirect(`${getProductAppPath("think-education", "/results")}?error=invalid`);
    }
  }
  const parsedComponentScores = educationAssessmentComponentScoresSchema.safeParse(rawComponentScores);
  if (!examinationId || !/^[A-Za-z0-9._/-]{1,32}$/.test(studentNumber)
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(subjectId)
    || gradeOverride.length > 10 || !parsedComponentScores.success) {
    redirect(`${getProductAppPath("think-education", "/results")}?error=invalid`);
  }
  const supabase = await createClient();
  const { data: subjectData, error: subjectError } = await supabase.from("education_subjects")
    .select("id, name, status")
    .eq("org_id", context.orgId).eq("id", subjectId).eq("status", "active")
    .maybeSingle();
  if (subjectError) throw new Error(`Could not validate the selected Think Education subject: ${subjectError.message}`);
  const subject = subjectData
    ? getActiveEducationSubject([subjectData], subjectId)
    : null;
  if (!subject) redirect(`${getProductAppPath("think-education", "/results")}?error=subject`);

  const { data: examination, error: examinationError } = await supabase.from("education_examinations")
    .select("id, branch_id, status")
    .eq("org_id", context.orgId).eq("id", examinationId)
    .maybeSingle();
  if (examinationError) throw new Error(`Could not load examination for result entry: ${examinationError.message}`);
  if (!examination) throw new Error("The selected examination is not available in your access scope.");
  if (!["completed", "results_pending"].includes(examination.status)) {
    redirect(`${getProductAppPath("think-education", "/results")}?error=invalid`);
  }
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === examination.branch_id)) {
    throw new Error("You cannot enter results for an examination outside your assigned campuses.");
  }
  const { data: student, error: studentError } = await supabase.from("education_students")
    .select("id")
    .eq("org_id", context.orgId).eq("branch_id", examination.branch_id)
    .eq("student_number", studentNumber).maybeSingle();
  if (studentError) throw new Error(`Could not find the student for result entry: ${studentError.message}`);
  if (!student) redirect(`${getProductAppPath("think-education", "/results")}?error=student`);

  const { data: componentRows, error: componentError } = await supabase.from("education_assessment_components")
    .select("id, name, weight_percentage, maximum_score")
    .eq("org_id", context.orgId)
    .eq("branch_id", examination.branch_id)
    .eq("examination_id", examination.id)
    .eq("subject_id", subject.id)
    .order("created_at");
  if (componentError) throw new Error(`Could not load assessment components: ${componentError.message}`);

  let weightedScore: number | null = null;
  if (componentRows?.length) {
    const components = componentRows.map((component) => ({
      id: component.id,
      name: component.name,
      weightPercentage: Number(component.weight_percentage),
      maximumScore: Number(component.maximum_score),
    }));
    weightedScore = calculateEducationWeightedScore(components, parsedComponentScores.data);
    if (weightedScore === null) {
      redirect(`${getProductAppPath("think-education", "/results")}?error=components`);
    }
  } else if (parsedComponentScores.data.length || score === null || maximumScore === null
    || !Number.isFinite(score) || score < 0
    || !Number.isFinite(maximumScore) || maximumScore <= 0 || score > maximumScore) {
    redirect(`${getProductAppPath("think-education", "/results")}?error=invalid`);
  }

  const resultScore = weightedScore ?? score;
  const resultMaximumScore = weightedScore === null ? maximumScore : 100;
  if (resultScore === null || resultMaximumScore === null) {
    redirect(`${getProductAppPath("think-education", "/results")}?error=invalid`);
  }
  const { data: createdResultId, error } = await supabase.rpc("education_create_result", {
    p_org_id: context.orgId,
    p_examination_id: examination.id,
    p_student_id: student.id,
    p_subject_id: subject.id,
    p_score: resultScore,
    p_maximum_score: resultMaximumScore,
    p_grade_override: gradeOverride || null,
    p_component_scores: parsedComponentScores.data.map((component) => ({
      component_id: component.componentId,
      score: component.score,
    })),
  });
  if (error) {
    if (error.code === "23505") redirect(`${getProductAppPath("think-education", "/results")}?error=duplicate`);
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/results")}?error=${componentRows?.length ? "components" : "invalid"}`);
    console.error("Could not save Think Education result:", error.message);
    redirect(`${getProductAppPath("think-education", "/results")}?error=save`);
  }
  if (createdResultId) {
    await syncEducationResultGrade(supabase, context.orgId, createdResultId, resultScore, resultMaximumScore, gradeOverride);
  }
  revalidatePath("/education/results");
  revalidatePath("/education/examinations");
  redirect(`${getProductAppPath("think-education", "/results")}?examination=${encodeURIComponent(examination.id)}&created=1`);
}

export async function updateEducationDraftResult(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) return { error: "Session expired. Sign in again." };
  if (!await canTabPermission("education_results", "results", "gradebook", "edit")) {
    return { error: "You do not have permission to edit Think Education results." };
  }

  const resultId = String(formData.get("result_id") ?? "");
  const scoreValue = String(formData.get("score") ?? "");
  const maximumScoreValue = String(formData.get("maximum_score") ?? "");
  const gradeOverride = String(formData.get("grade_override") ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(resultId)) {
    return { error: "The result identifier is invalid." };
  }

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const branchIds = campuses.map((campus) => campus.id);
  if (!branchIds.length) {
    return { error: "You do not have access to the campus containing this result." };
  }

  const supabase = await createClient();
  const { data: result, error: resultError } = await supabase.from("education_results")
    .select("id, branch_id, examination_id, subject_id, status")
    .eq("org_id", context.orgId)
    .eq("id", resultId)
    .in("branch_id", branchIds)
    .maybeSingle();
  if (resultError) {
    console.error("Could not load Think Education result for editing:", resultError.message);
    return { error: `The result could not be loaded: ${resultError.message}` };
  }
  if (!result || result.status !== "draft") {
    return { error: "Only draft results can be corrected." };
  }

  const { data: componentRows, error: componentError } = result.subject_id
    ? await supabase.from("education_assessment_components")
      .select("id, name, weight_percentage, maximum_score")
      .eq("org_id", context.orgId)
      .eq("branch_id", result.branch_id)
      .eq("examination_id", result.examination_id)
      .eq("subject_id", result.subject_id)
      .order("created_at")
    : { data: [], error: null };
  if (componentError) {
    console.error("Could not load assessment components for result correction:", componentError.message);
    return { error: `The assessment components could not be loaded: ${componentError.message}` };
  }

  if (componentRows?.length) {
    let rawComponentScores: unknown;
    try {
      rawComponentScores = JSON.parse(String(formData.get("component_scores_json") ?? ""));
    } catch {
      return { error: "Enter a score for every assessment component." };
    }
    const parsedComponentScores = educationAssessmentComponentScoresSchema.safeParse(rawComponentScores);
    const components = componentRows.map((component) => ({
      id: component.id,
      name: component.name,
      weightPercentage: Number(component.weight_percentage),
      maximumScore: Number(component.maximum_score),
    }));
    if (!parsedComponentScores.success
      || calculateEducationWeightedScore(components, parsedComponentScores.data) === null
      || gradeOverride.trim().length > 10) {
      return { error: "Check each component score and the grade override." };
    }
    const { error } = await supabase.rpc("education_update_draft_result_components", {
      p_org_id: context.orgId,
      p_result_id: resultId,
      p_grade_override: gradeOverride.trim() || null,
      p_component_scores: parsedComponentScores.data.map((component) => ({
        component_id: component.componentId,
        score: component.score,
      })),
    });
    if (error) {
      console.error("Could not update weighted Think Education result:", error.message);
      return { error: `The weighted result could not be saved: ${error.message}` };
    }
    const weightedScore = calculateEducationWeightedScore(components, parsedComponentScores.data);
    if (weightedScore !== null) {
      await syncEducationResultGrade(supabase, context.orgId, resultId, weightedScore, 100, gradeOverride);
    }
    revalidatePath("/education/results");
    return { success: true };
  }

  if (String(formData.get("component_scores_json") ?? "")) {
    return { error: "This result does not use weighted assessment components." };
  }
  const parsed = educationResultScoreInputSchema.safeParse({
    resultId,
    score: scoreValue,
    maximumScore: maximumScoreValue,
    gradeOverride,
  });
  if (!parsed.success) {
    return { error: "Enter a valid score, maximum score, and grade override." };
  }

  const { data: updatedResult, error } = await supabase.rpc("education_update_draft_result_score", {
    p_org_id: context.orgId,
    p_result_id: resultId,
    p_score: parsed.data.score,
    p_maximum_score: parsed.data.maximumScore,
    p_grade_override: parsed.data.gradeOverride || null,
  });
  if (error) {
    console.error("Could not update Think Education draft result:", error.message);
    return { error: `The draft result could not be saved: ${error.message}` };
  }
  if (!updatedResult) {
    return { error: "This result is no longer a draft or is outside your assigned campuses." };
  }

  await syncEducationResultGrade(supabase, context.orgId, resultId, parsed.data.score, parsed.data.maximumScore, parsed.data.gradeOverride);

  revalidatePath("/education/results");
  return { success: true };
}

export async function updateEducationResultStatus(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  const resultId = String(formData.get("result_id") ?? "");
  const nextStatus = String(formData.get("status") ?? "");
  if (!resultId || !["submitted", "approved", "published"].includes(nextStatus)) {
    redirect(`${getProductAppPath("think-education", "/results")}?error=invalid`);
  }
  const typedNextStatus = nextStatus as "submitted" | "approved" | "published";
  const action = typedNextStatus === "approved" ? "approve" : typedNextStatus === "published" ? "publish" : "edit";
  if (!await canTabPermission("education_results", "results", "gradebook", action)) {
    throw new Error(`You do not have permission to ${action} Think Education results.`);
  }
  if (action !== "edit" && !await canTabPermission("education_results", "results", "gradebook", "edit")) {
    throw new Error(`You need edit access as well as ${action} access to update Think Education results.`);
  }

  const supabase = await createClient();
  const { data: result, error: resultError } = await supabase.from("education_results")
    .select("id, branch_id, status")
    .eq("org_id", context.orgId).eq("id", resultId)
    .maybeSingle();
  if (resultError) throw new Error(`Could not load Think Education result: ${resultError.message}`);
  if (!result) throw new Error("The Think Education result was not found or is outside your access scope.");
  const allowedNextStatuses: Record<string, string[]> = {
    draft: ["submitted"],
    submitted: ["approved"],
    approved: ["published"],
  };
  if (!allowedNextStatuses[result.status]?.includes(typedNextStatus)) {
    redirect(`${getProductAppPath("think-education", "/results")}?error=invalid`);
  }
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === result.branch_id)) {
    throw new Error("You cannot update a result outside your assigned campuses.");
  }

  const updates = typedNextStatus === "approved"
    ? { status: typedNextStatus, approved_by: context.userId }
    : { status: typedNextStatus };
  const { error } = await supabase.from("education_results").update(updates)
    .eq("org_id", context.orgId).eq("id", resultId);
  if (error) {
    console.error("Could not update Think Education result:", error.message);
    redirect(`${getProductAppPath("think-education", "/results")}?error=save`);
  }
  revalidatePath("/education/results");
  revalidatePath("/education/examinations");
  redirect(`${getProductAppPath("think-education", "/results")}?updated=1`);
}

export async function createEducationStudentTransfer(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_transfers", "transfers", "requests", "create")) {
    throw new Error("You do not have permission to request Think Education student transfers.");
  }

  const parsed = educationStudentTransferInputSchema.safeParse({
    studentNumber: String(formData.get("student_number") ?? ""),
    sourceBranchId: String(formData.get("source_branch_id") ?? ""),
    destinationBranchId: String(formData.get("destination_branch_id") ?? ""),
    effectiveOn: String(formData.get("effective_on") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });
  if (!parsed.success) {
    redirect(`${getProductAppPath("think-education", "/transfers/request")}?error=invalid`);
  }
  const { studentNumber, sourceBranchId, destinationBranchId, effectiveOn, reason } = parsed.data;

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === sourceBranchId)
    || !campuses.some((campus) => campus.id === destinationBranchId)) {
    throw new Error("You must have assigned access to both campuses to request a transfer.");
  }
  const supabase = await createClient();
  const { data: student, error: studentError } = await supabase.from("education_students")
    .select("id")
    .eq("org_id", context.orgId).eq("branch_id", sourceBranchId)
    .eq("student_number", studentNumber).eq("status", "active")
    .maybeSingle();
  if (studentError) throw new Error(`Could not verify the student for transfer: ${studentError.message}`);
  if (!student) redirect(`${getProductAppPath("think-education", "/transfers/request")}?error=student`);

  const { error } = await supabase.from("education_student_transfers").insert({
    org_id: context.orgId,
    student_id: student.id,
    source_branch_id: sourceBranchId,
    destination_branch_id: destinationBranchId,
    effective_on: effectiveOn,
    reason,
    requested_by: context.userId,
  });
  if (error) {
    if (error.code === "23514") redirect(`${getProductAppPath("think-education", "/transfers/request")}?error=source`);
    console.error("Could not create Think Education student transfer:", error.message);
    redirect(`${getProductAppPath("think-education", "/transfers/request")}?error=save`);
  }
  revalidatePath("/education/transfers");
  revalidatePath("/education/transfers/request");
  redirect(`${getProductAppPath("think-education", "/transfers/request")}?created=1`);
}

export async function transitionEducationStudentTransfer(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  const returnToApprovals = formData.get("return_to") === "approvals";
  const transfersPath = getProductAppPath("think-education", returnToApprovals ? "/approvals" : "/transfers");
  const transferReturn = (query: string) => `${transfersPath}?${query}`;
  const transferId = String(formData.get("transfer_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!transferId || !["approved", "rejected", "completed"].includes(status)) {
    redirect(transferReturn("error=invalid"));
  }
  const nextStatus = status as "approved" | "rejected" | "completed";
  const action = nextStatus === "approved" || nextStatus === "rejected" ? "approve" : "edit";
  if (!await canTabPermission("education_transfers", "transfers", "requests", action)
    || !await canTabPermission("education_transfers", "transfers", "requests", "edit")) {
    throw new Error(`You need ${action} and edit access to process Think Education student transfers.`);
  }

  const supabase = await createClient();
  const { data: transfer, error: transferError } = await supabase.from("education_student_transfers")
    .select("id, source_branch_id, destination_branch_id, status")
    .eq("org_id", context.orgId).eq("id", transferId).maybeSingle();
  if (transferError) throw new Error(`Could not load Think Education student transfer: ${transferError.message}`);
  if (!transfer) throw new Error("The Think Education transfer was not found or is outside your access scope.");
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === transfer.source_branch_id)
    || !campuses.some((campus) => campus.id === transfer.destination_branch_id)) {
    throw new Error("You must have assigned access to both campuses to process this transfer.");
  }
  const validTransition = nextStatus === "completed"
    ? transfer.status === "approved"
    : transfer.status === "pending";
  if (!validTransition) redirect(transferReturn("error=transition"));

  const { error } = await supabase.rpc("education_transition_student_transfer", {
    p_transfer_id: transferId,
    p_status: nextStatus,
  });
  if (error) {
    if (error.code === "42501") throw new Error(`Transfer was not authorized: ${error.message}`);
    if (error.code === "22023") redirect(transferReturn("error=transition"));
    console.error("Could not process Think Education student transfer:", error.message);
    redirect(transferReturn("error=save"));
  }
  revalidatePath("/education/transfers");
  revalidatePath("/education/transfers/request");
  revalidatePath("/education/students");
  revalidatePath("/education/attendance");
  revalidatePath("/education/academics");
  revalidatePath("/education/approvals");
  redirect(transferReturn(`updated=1&status=${nextStatus}`));
}

export async function createEducationExpense(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_expenses", "expenses", "records", "create")) {
    throw new Error("You do not have permission to create Think Education expenses.");
  }

  const branchId = String(formData.get("branch_id") ?? "");
  const category = String(formData.get("category") ?? "");
  const vendor = String(formData.get("vendor") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const amountText = String(formData.get("amount") ?? "").trim();
  const expenseDate = String(formData.get("expense_date") ?? "");
  const reference = String(formData.get("reference") ?? "").trim();
  const requestId = String(formData.get("request_id") ?? "");
  const pettyCash = category === "Petty Cash";
  const amount = Number(amountText);
  if (!branchId || !EDUCATION_EXPENSE_CATEGORIES.includes(category as typeof EDUCATION_EXPENSE_CATEGORIES[number])
    || vendor.length > 160 || !description || description.length > 500
    || !/^\d{1,10}(?:\.\d{1,2})?$/.test(amountText) || !Number.isFinite(amount) || amount <= 0
    || amount > 9_999_999_999.99 || !isValidEducationExpenseDate(expenseDate) || reference.length > 120
    || !EDUCATION_COMMUNICATION_UUID_PATTERN.test(requestId)) {
    redirect(educationExpenseReturnPath(pettyCash, "error=invalid"));
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_create_expense", {
    p_org_id: context.orgId,
    p_branch_id: branchId,
    p_category: category,
    p_vendor: vendor || null,
    p_description: description,
    p_amount: amount,
    p_expense_date: expenseDate,
    p_reference: reference || null,
    p_request_id: requestId,
  });
  if (error) {
    if (error.code === "22023") redirect(educationExpenseReturnPath(pettyCash, "error=invalid"));
    if (error.code === "42501") throw new Error("You are not authorized to create expenses at this campus.");
    console.error("Could not create Think Education expense:", error.message);
    redirect(educationExpenseReturnPath(pettyCash, "error=save"));
  }
  revalidatePath("/education/expenses");
  redirect(educationExpenseReturnPath(pettyCash, "created=1"));
}

export async function updateEducationExpense(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_expenses", "expenses", "records", "edit")) {
    throw new Error("You do not have permission to edit Think Education expenses.");
  }

  const expenseId = String(formData.get("expense_id") ?? "");
  const category = String(formData.get("category") ?? "");
  const vendor = String(formData.get("vendor") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const amountText = String(formData.get("amount") ?? "").trim();
  const expenseDate = String(formData.get("expense_date") ?? "");
  const reference = String(formData.get("reference") ?? "").trim();
  const pettyCash = formData.get("return_to") === "petty_cash";
  const amount = Number(amountText);
  if (!EDUCATION_COMMUNICATION_UUID_PATTERN.test(expenseId)
    || !EDUCATION_EXPENSE_CATEGORIES.includes(category as typeof EDUCATION_EXPENSE_CATEGORIES[number])
    || vendor.length > 160 || !description || description.length > 500
    || !/^\d{1,10}(?:\.\d{1,2})?$/.test(amountText) || !Number.isFinite(amount) || amount <= 0
    || amount > 9_999_999_999.99 || !isValidEducationExpenseDate(expenseDate) || reference.length > 120) {
    redirect(educationExpenseReturnPath(pettyCash, "error=invalid"));
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_update_expense", {
    p_org_id: context.orgId,
    p_expense_id: expenseId,
    p_category: category,
    p_vendor: vendor || null,
    p_description: description,
    p_amount: amount,
    p_expense_date: expenseDate,
    p_reference: reference || null,
  });
  if (error) {
    if (error.code === "22023") redirect(educationExpenseReturnPath(pettyCash, "error=transition"));
    if (error.code === "P0002") redirect(educationExpenseReturnPath(pettyCash, "error=not-found"));
    if (error.code === "42501") throw new Error("You are not authorized to edit this expense at its campus.");
    console.error("Could not update Think Education expense:", error.message);
    redirect(educationExpenseReturnPath(pettyCash, "error=save"));
  }
  revalidatePath("/education/expenses");
  revalidatePath("/education/accounting");
  redirect(educationExpenseReturnPath(pettyCash, "updated=1"));
}

export async function deleteEducationExpense(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_expenses", "expenses", "records", "delete")) {
    throw new Error("You do not have permission to delete Think Education expenses.");
  }

  const expenseId = String(formData.get("expense_id") ?? "");
  const pettyCash = formData.get("return_to") === "petty_cash";
  if (!EDUCATION_COMMUNICATION_UUID_PATTERN.test(expenseId)) {
    redirect(educationExpenseReturnPath(pettyCash, "error=invalid"));
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_delete_expense", {
    p_org_id: context.orgId,
    p_expense_id: expenseId,
  });
  if (error) {
    if (error.code === "22023") redirect(educationExpenseReturnPath(pettyCash, "error=transition"));
    if (error.code === "P0002") redirect(educationExpenseReturnPath(pettyCash, "error=not-found"));
    if (error.code === "42501") throw new Error("You are not authorized to delete this expense at its campus.");
    console.error("Could not delete Think Education expense:", error.message);
    redirect(educationExpenseReturnPath(pettyCash, "error=save"));
  }
  revalidatePath("/education/expenses");
  revalidatePath("/education/accounting");
  redirect(educationExpenseReturnPath(pettyCash, "deleted=1"));
}

export async function reviewEducationExpense(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_expenses", "expenses", "records", "approve")) {
    throw new Error("You do not have permission to approve or reject Think Education expenses.");
  }

  const returnToApprovals = formData.get("return_to") === "approvals";
  const pettyCash = formData.get("return_to") === "petty_cash";
  const expenseReturn = (query: string) => returnToApprovals
    ? `${getProductAppPath("think-education", "/approvals")}?${query}`
    : educationExpenseReturnPath(pettyCash, query);
  const expenseId = String(formData.get("expense_id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!expenseId || !["approved", "rejected"].includes(decision)
    || (decision === "rejected" && (reason.length < 3 || reason.length > 500))
    || (decision === "approved" && reason.length > 500)) {
    redirect(expenseReturn("error=invalid"));
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_review_expense", {
    p_org_id: context.orgId,
    p_expense_id: expenseId,
    p_decision: decision,
    p_reason: reason || null,
  });
  if (error) {
    if (error.code === "23514") redirect(expenseReturn("error=accounting-mapping"));
    if (error.message.includes("open fiscal period")) redirect(expenseReturn("error=accounting-period"));
    if (error.code === "22023") redirect(expenseReturn("error=transition"));
    if (error.code === "P0002") redirect(expenseReturn("error=not-found"));
    if (error.code === "42501") throw new Error("You are not authorized to review this expense at its campus.");
    console.error("Could not review Think Education expense:", error.message);
    redirect(expenseReturn("error=save"));
  }
  revalidatePath("/education/expenses");
  revalidatePath("/education/accounting");
  revalidatePath("/education/accounting/journal-entries");
  revalidatePath("/education/accounting/general-ledger");
  revalidatePath("/education/accounting/reports");
  revalidatePath("/education/approvals");
  redirect(expenseReturn(`reviewed=${decision}`));
}

export async function markEducationExpensePaid(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_expenses", "expenses", "records", "edit")) {
    throw new Error("You do not have permission to record Think Education expense payments.");
  }

  const expenseId = String(formData.get("expense_id") ?? "");
  const paymentMethod = String(formData.get("payment_method") ?? "");
  const pettyCash = formData.get("return_to") === "petty_cash";
  const paidOn = String(formData.get("paid_on") ?? "");
  if (!expenseId
    || !EDUCATION_EXPENSE_PAYMENT_METHODS.some(([value]) => value === paymentMethod)
    || !isValidEducationExpenseDate(paidOn)) {
    redirect(educationExpenseReturnPath(pettyCash, "error=invalid"));
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_mark_expense_paid", {
    p_org_id: context.orgId,
    p_expense_id: expenseId,
    p_payment_method: paymentMethod,
    p_paid_on: paidOn,
  });
  if (error) {
    if (error.code === "23514") redirect(educationExpenseReturnPath(pettyCash, "error=accounting-mapping"));
    if (error.message.includes("open fiscal period")) redirect(educationExpenseReturnPath(pettyCash, "error=accounting-period"));
    if (error.code === "22023") redirect(educationExpenseReturnPath(pettyCash, "error=transition"));
    if (error.code === "P0002") redirect(educationExpenseReturnPath(pettyCash, "error=not-found"));
    if (error.code === "42501") throw new Error("You are not authorized to record expense payments at this campus.");
    console.error("Could not record Think Education expense payment:", error.message);
    redirect(educationExpenseReturnPath(pettyCash, "error=save"));
  }
  revalidatePath("/education/expenses");
  revalidatePath("/education/accounting");
  revalidatePath("/education/accounting/journal-entries");
  revalidatePath("/education/accounting/general-ledger");
  revalidatePath("/education/accounting/cashbook");
  revalidatePath("/education/accounting/reports");
  redirect(educationExpenseReturnPath(pettyCash, "paid=1"));
}

export async function createEducationLibraryBook(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_library", "library", "catalog", "create")) {
    throw new Error("You do not have permission to add Think Education library books.");
  }

  const branchId = String(formData.get("branch_id") ?? "");
  const isbn = String(formData.get("isbn") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const author = String(formData.get("author") ?? "").trim();
  const publisher = String(formData.get("publisher") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const publicationYearText = String(formData.get("publication_year") ?? "").trim();
  const copyCountText = String(formData.get("copy_count") ?? "").trim();
  const publicationYear = publicationYearText ? Number(publicationYearText) : null;
  const copyCount = Number(copyCountText);
  if (!branchId || isbn.length > 32 || !title || title.length > 200 || !author || author.length > 160
    || publisher.length > 160 || !category || category.length > 80
    || (publicationYear !== null && (!Number.isInteger(publicationYear) || publicationYear < 1000 || publicationYear > 9999))
    || !/^\d{1,3}$/.test(copyCountText) || copyCount < 1 || copyCount > 500) {
    redirect(`${getProductAppPath("think-education", "/library")}?error=invalid`);
  }

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === branchId)) {
    throw new Error("You can only add library books to an assigned Think Education campus.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_library_create_book", {
    p_org_id: context.orgId,
    p_branch_id: branchId,
    p_isbn: isbn || null,
    p_title: title,
    p_author: author,
    p_publisher: publisher || null,
    p_category: category,
    p_publication_year: publicationYear,
    p_copy_count: copyCount,
  });
  if (error) {
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/library")}?error=invalid`);
    if (error.code === "42501") throw new Error("You are not authorized to add library books at this campus.");
    if (error.code === "23505") redirect(`${getProductAppPath("think-education", "/library")}?error=duplicate`);
    console.error("Could not add Think Education library book:", error.message);
    redirect(`${getProductAppPath("think-education", "/library")}?error=save`);
  }
  revalidatePath("/education/library");
  redirect(`${getProductAppPath("think-education", "/library")}?created=1`);
}

export async function issueEducationLibraryCopy(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_library", "library", "circulation", "create")
    || !await canTabPermission("education_students", "students", "list", "view")) {
    throw new Error("You do not have permission to issue Think Education library books.");
  }

  const copyReference = String(formData.get("copy_ref") ?? "");
  const studentNumber = String(formData.get("student_number") ?? "").trim();
  const [branchId = "", copyId = "", ...extra] = copyReference.split(".");
  if (!branchId || !copyId || extra.length || !studentNumber || studentNumber.length > 80) {
    redirect(`${getProductAppPath("think-education", "/library")}?error=invalid`);
  }
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === branchId)) {
    throw new Error("You can only issue library books at an assigned Think Education campus.");
  }

  const supabase = await createClient();
  const { data: student, error: studentError } = await supabase.from("education_students")
    .select("id")
    .eq("org_id", context.orgId)
    .eq("branch_id", branchId)
    .eq("student_number", studentNumber)
    .eq("status", "active")
    .maybeSingle();
  if (studentError) throw new Error(`Could not verify the Think Education student: ${studentError.message}`);
  if (!student) redirect(`${getProductAppPath("think-education", "/library")}?error=student`);

  const { error } = await supabase.rpc("education_library_issue_copy", {
    p_org_id: context.orgId,
    p_branch_id: branchId,
    p_copy_id: copyId,
    p_student_id: student.id,
  });
  if (error) {
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/library")}?error=loan-limit`);
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/library")}?error=unavailable`);
    if (error.code === "42501") throw new Error("You are not authorized to issue this library book.");
    if (error.code === "23505") redirect(`${getProductAppPath("think-education", "/library")}?error=unavailable`);
    console.error("Could not issue Think Education library copy:", error.message);
    redirect(`${getProductAppPath("think-education", "/library")}?error=save`);
  }
  revalidatePath("/education/library");
  redirect(`${getProductAppPath("think-education", "/library")}?issued=1`);
}

export async function renewEducationLibraryLoan(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_library", "library", "circulation", "edit")) {
    throw new Error("You do not have permission to renew Think Education library loans.");
  }
  const loanId = String(formData.get("loan_id") ?? "");
  if (!loanId) redirect(`${getProductAppPath("think-education", "/library")}?error=invalid`);

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_library_renew_loan", {
    p_org_id: context.orgId,
    p_loan_id: loanId,
  });
  if (error) {
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/library")}?error=transition`);
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/library")}?error=not-found`);
    if (error.code === "42501") throw new Error("You are not authorized to renew this library loan.");
    console.error("Could not renew Think Education library loan:", error.message);
    redirect(`${getProductAppPath("think-education", "/library")}?error=save`);
  }
  revalidatePath("/education/library");
  redirect(`${getProductAppPath("think-education", "/library")}?renewed=1`);
}

export async function returnEducationLibraryLoan(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_library", "library", "circulation", "edit")) {
    throw new Error("You do not have permission to return Think Education library loans.");
  }
  const loanId = String(formData.get("loan_id") ?? "");
  if (!loanId) redirect(`${getProductAppPath("think-education", "/library")}?error=invalid`);

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_library_return_loan", {
    p_org_id: context.orgId,
    p_loan_id: loanId,
  });
  if (error) {
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/library")}?error=transition`);
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/library")}?error=not-found`);
    if (error.code === "42501") throw new Error("You are not authorized to return this library loan.");
    console.error("Could not return Think Education library loan:", error.message);
    redirect(`${getProductAppPath("think-education", "/library")}?error=save`);
  }
  revalidatePath("/education/library");
  redirect(`${getProductAppPath("think-education", "/library")}?returned=1`);
}

export async function createEducationTransportVehicle(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_transport", "transport", "fleet", "create")) {
    throw new Error("You do not have permission to add Think Education transport vehicles.");
  }

  const branchId = String(formData.get("branch_id") ?? "");
  const registrationNumber = String(formData.get("registration_number") ?? "").trim();
  const makeModel = String(formData.get("make_model") ?? "").trim();
  const capacityText = String(formData.get("capacity") ?? "").trim();
  const capacity = Number(capacityText);
  if (!branchId || !registrationNumber || registrationNumber.length > 32
    || !makeModel || makeModel.length > 120 || !/^\d{1,3}$/.test(capacityText)
    || !Number.isInteger(capacity) || capacity < 1 || capacity > 200) {
    redirect(`${getProductAppPath("think-education", "/transport")}?error=invalid`);
  }
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === branchId)) {
    throw new Error("You can only add vehicles to an assigned Think Education campus.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_transport_create_vehicle", {
    p_org_id: context.orgId,
    p_branch_id: branchId,
    p_registration_number: registrationNumber,
    p_make_model: makeModel,
    p_capacity: capacity,
  });
  if (error) {
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/transport")}?error=invalid`);
    if (error.code === "42501") throw new Error("You are not authorized to add vehicles at this campus.");
    if (error.code === "23505") redirect(`${getProductAppPath("think-education", "/transport")}?error=duplicate-vehicle`);
    console.error("Could not create Think Education transport vehicle:", error.message);
    redirect(`${getProductAppPath("think-education", "/transport")}?error=save`);
  }
  revalidatePath("/education/transport");
  redirect(`${getProductAppPath("think-education", "/transport")}?vehicle=created`);
}

export async function createEducationTransportRoute(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_transport", "transport", "fleet", "create")) {
    throw new Error("You do not have permission to create Think Education transport routes.");
  }

  const branchId = String(formData.get("branch_id") ?? "");
  const vehicleId = String(formData.get("vehicle_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const driverName = String(formData.get("driver_name") ?? "").trim();
  const driverPhone = String(formData.get("driver_phone") ?? "").trim();
  const stopText = String(formData.get("stops") ?? "");
  const stops = stopText.split(/\r?\n/).map((stop) => stop.trim()).filter(Boolean);
  const stopKeys = stops.map((stop) => stop.toLowerCase());
  if (!branchId || !vehicleId || !name || name.length > 100 || !driverName || driverName.length > 120
    || driverPhone.length > 32 || stops.length < 2 || stops.length > 30
    || stops.some((stop) => stop.length > 120)
    || new Set(stopKeys).size !== stops.length) {
    redirect(`${getProductAppPath("think-education", "/transport")}?error=invalid`);
  }
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === branchId)) {
    throw new Error("You can only create routes at an assigned Think Education campus.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_transport_create_route", {
    p_org_id: context.orgId,
    p_branch_id: branchId,
    p_vehicle_id: vehicleId,
    p_name: name,
    p_driver_name: driverName,
    p_driver_phone: driverPhone || null,
    p_stops: stops,
  });
  if (error) {
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/transport")}?error=invalid`);
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/transport")}?error=vehicle`);
    if (error.code === "42501") throw new Error("You are not authorized to create this route.");
    if (error.code === "23505") redirect(`${getProductAppPath("think-education", "/transport")}?error=duplicate-route`);
    console.error("Could not create Think Education transport route:", error.message);
    redirect(`${getProductAppPath("think-education", "/transport")}?error=save`);
  }
  revalidatePath("/education/transport");
  redirect(`${getProductAppPath("think-education", "/transport")}?route=created`);
}

export async function assignEducationStudentTransport(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_transport", "transport", "assignments", "create")
    || !await canTabPermission("education_students", "students", "list", "view")) {
    throw new Error("You do not have permission to assign students to Think Education transport.");
  }

  const routeId = String(formData.get("route_id") ?? "");
  const studentNumber = String(formData.get("student_number") ?? "").trim();
  const pickupStop = String(formData.get("pickup_stop") ?? "").trim();
  const dropoffStop = String(formData.get("dropoff_stop") ?? "").trim();
  if (!routeId || !studentNumber || studentNumber.length > 80 || !pickupStop || !dropoffStop) {
    redirect(`${getProductAppPath("think-education", "/transport")}?error=invalid`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_transport_assign_student", {
    p_org_id: context.orgId,
    p_route_id: routeId,
    p_student_number: studentNumber,
    p_pickup_stop: pickupStop,
    p_dropoff_stop: dropoffStop,
  });
  if (error) {
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/transport")}?error=capacity-or-stops`);
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/transport")}?error=student-or-route`);
    if (error.code === "42501") throw new Error("You are not authorized to assign a student to this route.");
    if (error.code === "23505") redirect(`${getProductAppPath("think-education", "/transport")}?error=already-assigned`);
    console.error("Could not assign Think Education student transport:", error.message);
    redirect(`${getProductAppPath("think-education", "/transport")}?error=save`);
  }
  revalidatePath("/education/transport");
  redirect(`${getProductAppPath("think-education", "/transport")}?assignment=created`);
}

export async function endEducationStudentTransport(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_transport", "transport", "assignments", "edit")) {
    throw new Error("You do not have permission to end Think Education transport assignments.");
  }
  const assignmentId = String(formData.get("assignment_id") ?? "");
  if (!assignmentId) redirect(`${getProductAppPath("think-education", "/transport")}?error=invalid`);

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_transport_end_assignment", {
    p_org_id: context.orgId,
    p_assignment_id: assignmentId,
  });
  if (error) {
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/transport")}?error=transition`);
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/transport")}?error=not-found`);
    if (error.code === "42501") throw new Error("You are not authorized to end this transport assignment.");
    console.error("Could not end Think Education transport assignment:", error.message);
    redirect(`${getProductAppPath("think-education", "/transport")}?error=save`);
  }
  revalidatePath("/education/transport");
  redirect(`${getProductAppPath("think-education", "/transport")}?assignment=ended`);
}

export async function setEducationTransportVehicleStatus(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_transport", "transport", "fleet", "edit")) {
    throw new Error("You do not have permission to update Think Education vehicle status.");
  }
  const vehicleId = String(formData.get("vehicle_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!vehicleId || !["active", "maintenance", "retired"].includes(status)) {
    redirect(`${getProductAppPath("think-education", "/transport")}?error=invalid`);
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("education_transport_set_vehicle_status", {
    p_org_id: context.orgId,
    p_vehicle_id: vehicleId,
    p_status: status,
  });
  if (error) {
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/transport")}?error=invalid`);
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/transport")}?error=not-found`);
    if (error.code === "42501") throw new Error("You are not authorized to update this vehicle.");
    console.error("Could not update Think Education transport vehicle:", error.message);
    redirect(`${getProductAppPath("think-education", "/transport")}?error=save`);
  }
  revalidatePath("/education/transport");
  redirect(`${getProductAppPath("think-education", "/transport")}?vehicle=updated`);
}

export async function setEducationTransportRouteStatus(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_transport", "transport", "fleet", "edit")) {
    throw new Error("You do not have permission to update Think Education route status.");
  }
  const routeId = String(formData.get("route_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!routeId || !["active", "paused", "retired"].includes(status)) {
    redirect(`${getProductAppPath("think-education", "/transport")}?error=invalid`);
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("education_transport_set_route_status", {
    p_org_id: context.orgId,
    p_route_id: routeId,
    p_status: status,
  });
  if (error) {
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/transport")}?error=transition`);
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/transport")}?error=not-found`);
    if (error.code === "42501") throw new Error("You are not authorized to update this route.");
    if (error.code === "23505") redirect(`${getProductAppPath("think-education", "/transport")}?error=vehicle-in-use`);
    console.error("Could not update Think Education transport route:", error.message);
    redirect(`${getProductAppPath("think-education", "/transport")}?error=save`);
  }
  revalidatePath("/education/transport");
  redirect(`${getProductAppPath("think-education", "/transport")}?route=updated`);
}

export async function createEducationInventoryItem(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_inventory_assets", "inventory", "stock", "create")) {
    throw new Error("You do not have permission to create Think Education inventory items.");
  }
  const branchId = String(formData.get("branch_id") ?? "");
  const sku = String(formData.get("sku") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const unit = String(formData.get("unit") ?? "").trim();
  const initialText = String(formData.get("initial_quantity") ?? "").trim();
  const reorderText = String(formData.get("reorder_level") ?? "").trim();
  const initialQuantity = Number(initialText);
  const reorderLevel = Number(reorderText);
  if (!branchId || !sku || sku.length > 40 || !name || name.length > 160
    || !category || category.length > 80 || !unit || unit.length > 24
    || !/^\d{1,9}$/.test(initialText) || !Number.isSafeInteger(initialQuantity)
    || !/^\d{1,9}$/.test(reorderText) || !Number.isSafeInteger(reorderLevel)) {
    redirect(`${getProductAppPath("think-education", "/inventory")}?error=invalid`);
  }
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === branchId)) {
    throw new Error("You can only create inventory items at an assigned Think Education campus.");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("education_inventory_create_item", {
    p_org_id: context.orgId,
    p_branch_id: branchId,
    p_sku: sku,
    p_name: name,
    p_category: category,
    p_unit: unit,
    p_initial_quantity: initialQuantity,
    p_reorder_level: reorderLevel,
  });
  if (error) {
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/inventory")}?error=invalid`);
    if (error.code === "42501") throw new Error("You are not authorized to create inventory items at this campus.");
    if (error.code === "23505") redirect(`${getProductAppPath("think-education", "/inventory")}?error=duplicate-sku`);
    console.error("Could not create Think Education inventory item:", error.message);
    redirect(`${getProductAppPath("think-education", "/inventory")}?error=save`);
  }
  revalidatePath("/education/inventory");
  redirect(`${getProductAppPath("think-education", "/inventory")}?stock=created`);
}

export async function adjustEducationInventoryStock(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_inventory_assets", "inventory", "stock", "edit")) {
    throw new Error("You do not have permission to adjust Think Education inventory stock.");
  }
  const itemId = String(formData.get("item_id") ?? "");
  const movementType = String(formData.get("movement_type") ?? "");
  const quantityText = String(formData.get("quantity") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const quantity = Number(quantityText);
  if (!itemId || !["receipt", "issue", "adjustment"].includes(movementType)
    || !/^-?\d{1,9}$/.test(quantityText) || !Number.isSafeInteger(quantity) || quantity === 0
    || (movementType !== "adjustment" && quantity < 1)
    || reason.length < 1 || reason.length > 300) {
    redirect(`${getProductAppPath("think-education", "/inventory")}?error=invalid`);
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("education_inventory_adjust_stock", {
    p_org_id: context.orgId,
    p_item_id: itemId,
    p_movement_type: movementType,
    p_quantity: movementType === "issue" ? -Math.abs(quantity) : quantity,
    p_reason: reason,
  });
  if (error) {
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/inventory")}?error=stock-transition`);
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/inventory")}?error=not-found`);
    if (error.code === "42501") throw new Error("You are not authorized to adjust inventory at this campus.");
    console.error("Could not adjust Think Education inventory stock:", error.message);
    redirect(`${getProductAppPath("think-education", "/inventory")}?error=save`);
  }
  revalidatePath("/education/inventory");
  redirect(`${getProductAppPath("think-education", "/inventory")}?stock=updated`);
}

export async function createEducationAsset(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_inventory_assets", "inventory", "assets", "create")) {
    throw new Error("You do not have permission to register Think Education assets.");
  }
  const branchId = String(formData.get("branch_id") ?? "");
  const assetTag = String(formData.get("asset_tag") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const serialNumber = String(formData.get("serial_number") ?? "").trim();
  const purchaseDateText = String(formData.get("purchase_date") ?? "").trim();
  const condition = String(formData.get("condition") ?? "");
  if (!branchId || !assetTag || assetTag.length > 40 || !name || name.length > 160
    || !category || category.length > 80 || serialNumber.length > 100
    || (purchaseDateText && !isValidEducationExpenseDate(purchaseDateText))
    || !["new", "good", "fair", "poor"].includes(condition)) {
    redirect(`${getProductAppPath("think-education", "/inventory")}?error=invalid`);
  }
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === branchId)) {
    throw new Error("You can only register assets at an assigned Think Education campus.");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("education_assets_create_asset", {
    p_org_id: context.orgId,
    p_branch_id: branchId,
    p_asset_tag: assetTag,
    p_name: name,
    p_category: category,
    p_serial_number: serialNumber || null,
    p_purchase_date: purchaseDateText || null,
    p_condition: condition,
  });
  if (error) {
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/inventory")}?error=invalid`);
    if (error.code === "42501") throw new Error("You are not authorized to register assets at this campus.");
    if (error.code === "23505") redirect(`${getProductAppPath("think-education", "/inventory")}?error=duplicate-asset`);
    console.error("Could not register Think Education asset:", error.message);
    redirect(`${getProductAppPath("think-education", "/inventory")}?error=save`);
  }
  revalidatePath("/education/inventory");
  redirect(`${getProductAppPath("think-education", "/inventory")}?asset=created`);
}

export async function assignEducationAsset(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_inventory_assets", "inventory", "assets", "view")
    || !await canTabPermission("education_inventory_assets", "inventory", "assets", "edit")) {
    throw new Error("You do not have permission to assign Think Education assets.");
  }
  const assetId = String(formData.get("asset_id") ?? "");
  const assigneeType = String(formData.get("assignee_type") ?? "");
  const assigneeNumber = String(formData.get("assignee_number") ?? "").trim();
  if (!assetId || !["student", "staff"].includes(assigneeType)
    || !assigneeNumber || assigneeNumber.length > 80) {
    redirect(`${getProductAppPath("think-education", "/inventory")}?error=invalid`);
  }
  if (assigneeType === "student"
    && !await canTabPermission("education_students", "students", "list", "view")) {
    throw new Error("You do not have permission to view students for asset assignment.");
  }
  if (assigneeType === "staff"
    && !await canTabPermission("education_staff", "staff", "directory", "view")) {
    throw new Error("You do not have permission to view staff for asset assignment.");
  }

  const supabase = await createClient();
  const { data: asset, error: assetError } = await supabase.from("education_assets")
    .select("id, branch_id, status").eq("org_id", context.orgId).eq("id", assetId).maybeSingle();
  if (assetError) throw new Error(`Could not verify the asset for assignment: ${assetError.message}`);
  if (!asset) redirect(`${getProductAppPath("think-education", "/inventory")}?error=not-found`);
  const lookup = assigneeType === "student"
    ? await supabase.from("education_students").select("id")
      .eq("org_id", context.orgId).eq("branch_id", asset.branch_id)
      .eq("student_number", assigneeNumber).eq("status", "active").maybeSingle()
    : await supabase.from("education_staff").select("id")
      .eq("org_id", context.orgId).eq("branch_id", asset.branch_id)
      .eq("staff_number", assigneeNumber).eq("status", "active").maybeSingle();
  if (lookup.error) throw new Error(`Could not verify the selected ${assigneeType}: ${lookup.error.message}`);
  if (!lookup.data) redirect(`${getProductAppPath("think-education", "/inventory")}?error=assignee`);

  const { error } = await supabase.rpc("education_assets_assign_asset", {
    p_org_id: context.orgId,
    p_asset_id: assetId,
    p_assignee_type: assigneeType,
    p_assignee_id: lookup.data.id,
  });
  if (error) {
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/inventory")}?error=asset-transition`);
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/inventory")}?error=assignee`);
    if (error.code === "42501") throw new Error("You are not authorized to assign this asset.");
    if (error.code === "23505") redirect(`${getProductAppPath("think-education", "/inventory")}?error=asset-transition`);
    console.error("Could not assign Think Education asset:", error.message);
    redirect(`${getProductAppPath("think-education", "/inventory")}?error=save`);
  }
  revalidatePath("/education/inventory");
  redirect(`${getProductAppPath("think-education", "/inventory")}?asset=assigned`);
}

export async function returnEducationAsset(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_inventory_assets", "inventory", "assets", "edit")) {
    throw new Error("You do not have permission to return Think Education assets.");
  }
  const assignmentId = String(formData.get("assignment_id") ?? "");
  if (!assignmentId) redirect(`${getProductAppPath("think-education", "/inventory")}?error=invalid`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("education_assets_return_asset", {
    p_org_id: context.orgId,
    p_assignment_id: assignmentId,
  });
  if (error) {
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/inventory")}?error=asset-transition`);
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/inventory")}?error=not-found`);
    if (error.code === "42501") throw new Error("You are not authorized to return this asset.");
    console.error("Could not return Think Education asset:", error.message);
    redirect(`${getProductAppPath("think-education", "/inventory")}?error=save`);
  }
  revalidatePath("/education/inventory");
  redirect(`${getProductAppPath("think-education", "/inventory")}?asset=returned`);
}

export async function setEducationAssetStatus(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_inventory_assets", "inventory", "assets", "edit")) {
    throw new Error("You do not have permission to update Think Education asset status.");
  }
  const assetId = String(formData.get("asset_id") ?? "");
  const status = String(formData.get("status") ?? "");
  const condition = String(formData.get("condition") ?? "");
  if (!assetId || !["available", "maintenance", "retired"].includes(status)
    || !["new", "good", "fair", "poor"].includes(condition)) {
    redirect(`${getProductAppPath("think-education", "/inventory")}?error=invalid`);
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("education_assets_set_status", {
    p_org_id: context.orgId,
    p_asset_id: assetId,
    p_status: status,
    p_condition: condition,
  });
  if (error) {
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/inventory")}?error=asset-transition`);
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/inventory")}?error=not-found`);
    if (error.code === "42501") throw new Error("You are not authorized to update this asset.");
    console.error("Could not update Think Education asset:", error.message);
    redirect(`${getProductAppPath("think-education", "/inventory")}?error=save`);
  }
  revalidatePath("/education/inventory");
  redirect(`${getProductAppPath("think-education", "/inventory")}?asset=updated`);
}

export async function createEducationCommunicationDraft(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_communication", "communication", "announcements", "create")) {
    throw new Error("You do not have permission to create Think Education announcements.");
  }
  const branchId = String(formData.get("branch_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const audience = String(formData.get("audience") ?? "");
  if (!branchId || !title || title.length > 160 || !body || body.length > 5000
    || !EDUCATION_COMMUNICATION_AUDIENCES.some(([value]) => value === audience)) {
    redirect(`${getProductAppPath("think-education", "/communication")}?error=invalid`);
  }
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === branchId)) {
    throw new Error("You can only create announcements for an assigned Think Education campus.");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("education_communication_create_draft", {
    p_org_id: context.orgId,
    p_branch_id: branchId,
    p_title: title,
    p_body: body,
    p_audience: audience,
  });
  if (error) {
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/communication")}?error=invalid`);
    if (error.code === "42501") throw new Error("You are not authorized to create announcements at this campus.");
    console.error("Could not save Think Education announcement draft:", error.message);
    redirect(`${getProductAppPath("think-education", "/communication")}?error=save`);
  }
  revalidatePath("/education/communication");
  redirect(`${getProductAppPath("think-education", "/communication")}?created=1`);
}

export async function updateEducationCommunicationDraft(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_communication", "communication", "announcements", "edit")) {
    throw new Error("You do not have permission to edit Think Education announcements.");
  }

  const parsed = educationCommunicationDraftInputSchema.safeParse({
    communicationId: String(formData.get("communication_id") ?? ""),
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    audience: String(formData.get("audience") ?? ""),
  });
  if (!parsed.success) {
    redirect(`${getProductAppPath("think-education", "/communication")}?error=invalid`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_communication_update_draft", {
    p_org_id: context.orgId,
    p_communication_id: parsed.data.communicationId,
    p_title: parsed.data.title,
    p_body: parsed.data.body,
    p_audience: parsed.data.audience,
  });
  if (error) {
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/communication")}?error=transition`);
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/communication")}?error=not-found`);
    if (error.code === "42501") throw new Error("You are not authorized to edit this announcement.");
    console.error("Could not update Think Education announcement draft:", error.message);
    redirect(`${getProductAppPath("think-education", "/communication")}?error=save`);
  }

  revalidatePath("/education/communication");
  redirect(`${getProductAppPath("think-education", "/communication")}?updated=1`);
}

export async function publishEducationCommunication(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_communication", "communication", "announcements", "publish")) {
    throw new Error("You do not have permission to publish Think Education announcements.");
  }
  const communicationId = String(formData.get("communication_id") ?? "");
  if (!EDUCATION_COMMUNICATION_UUID_PATTERN.test(communicationId)) {
    redirect(`${getProductAppPath("think-education", "/communication")}?error=invalid`);
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("education_communication_publish", {
    p_org_id: context.orgId,
    p_communication_id: communicationId,
  });
  let alreadyPublished = false;
  if (error) {
    if (error.code === "22023") {
      const { data: announcement, error: lookupError } = await supabase.from("education_communications")
        .select("id, status")
        .eq("org_id", context.orgId)
        .eq("id", communicationId)
        .maybeSingle();
      if (lookupError) throw new Error(`Could not verify Think Education announcement status: ${lookupError.message}`);
      if (announcement?.status !== "published") {
        redirect(`${getProductAppPath("think-education", "/communication")}?error=transition`);
      }
      alreadyPublished = true;
    } else {
      if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/communication")}?error=not-found`);
      if (error.code === "42501") throw new Error("You are not authorized to publish this announcement.");
      console.error("Could not publish Think Education announcement:", error.message);
      redirect(`${getProductAppPath("think-education", "/communication")}?error=save`);
    }
  }
  const delivery = await dispatchEducationAnnouncementDeliveries(context.userId, communicationId);
  revalidatePath("/education/communication");
  revalidatePath("/education-portal");
  revalidatePath("/student-education-portal");
  const deliveryState = delivery.unconfigured
    ? "unconfigured"
    : delivery.failed
      ? "failed"
      : "processed";
  redirect(`${getProductAppPath("think-education", "/communication")}?published=1&delivery=${deliveryState}${alreadyPublished ? "&retry=1" : ""}`);
}

export async function retryEducationCommunicationDelivery(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_communication", "communication", "announcements", "publish")) {
    throw new Error("You do not have permission to retry Think Education announcement delivery.");
  }
  const communicationId = String(formData.get("communication_id") ?? "");
  if (!EDUCATION_COMMUNICATION_UUID_PATTERN.test(communicationId)) {
    redirect(`${getProductAppPath("think-education", "/communication")}?error=invalid`);
  }

  const supabase = await createClient();
  const { data: announcement, error } = await supabase.from("education_communications")
    .select("id, branch_id, status")
    .eq("org_id", context.orgId)
    .eq("id", communicationId)
    .maybeSingle();
  if (error) throw new Error(`Could not verify Think Education announcement status: ${error.message}`);
  if (!announcement) redirect(`${getProductAppPath("think-education", "/communication")}?error=not-found`);
  if (announcement.status !== "published") {
    redirect(`${getProductAppPath("think-education", "/communication")}?error=transition`);
  }

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === announcement.branch_id)) {
    throw new Error("You are not authorized to deliver announcements at this campus.");
  }

  const delivery = await dispatchEducationAnnouncementDeliveries(context.userId, communicationId, true);
  revalidatePath("/education/communication");
  const deliveryState = delivery.unconfigured
    ? "unconfigured"
    : delivery.failed
      ? "failed"
      : "processed";
  redirect(`${getProductAppPath("think-education", "/communication")}?delivery=${deliveryState}`);
}

export async function archiveEducationCommunication(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_communication", "communication", "announcements", "edit")) {
    throw new Error("You do not have permission to archive Think Education announcements.");
  }
  const communicationId = String(formData.get("communication_id") ?? "");
  if (!communicationId) redirect(`${getProductAppPath("think-education", "/communication")}?error=invalid`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("education_communication_archive", {
    p_org_id: context.orgId,
    p_communication_id: communicationId,
  });
  if (error) {
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/communication")}?error=transition`);
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/communication")}?error=not-found`);
    if (error.code === "42501") throw new Error("You are not authorized to archive this announcement.");
    console.error("Could not archive Think Education announcement:", error.message);
    redirect(`${getProductAppPath("think-education", "/communication")}?error=save`);
  }
  revalidatePath("/education/communication");
  revalidatePath("/education-portal");
  revalidatePath("/student-education-portal");
  redirect(`${getProductAppPath("think-education", "/communication")}?archived=1`);
}

export async function archiveEducationDocument(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_documents", "documents", "library", "edit")) {
    throw new Error("You do not have permission to archive Think Education documents.");
  }
  const documentId = String(formData.get("document_id") ?? "");
  if (!documentId) redirect(`${getProductAppPath("think-education", "/documents")}?error=invalid`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("education_document_archive", {
    p_org_id: context.orgId,
    p_document_id: documentId,
  });
  if (error) {
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/documents")}?error=transition`);
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/documents")}?error=not-found`);
    if (error.code === "42501") throw new Error("You are not authorized to archive this document.");
    console.error("Could not archive Think Education document:", error.message);
    redirect(`${getProductAppPath("think-education", "/documents")}?error=save`);
  }
  revalidatePath("/education/documents");
  redirect(`${getProductAppPath("think-education", "/documents")}?archived=1`);
}

export async function reviewEducationAdmissionDocument(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");

  const documentId = String(formData.get("document_id") ?? "");
  const verificationStatus = String(formData.get("verification_status") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(documentId) || !["verified", "rejected"].includes(verificationStatus)
    || note.length > 1000 || (verificationStatus === "rejected" && !note)) {
    redirect(`${getProductAppPath("think-education", "/admissions")}?document_error=review-invalid`);
  }
  const [canEditAdmissions, canViewDocuments] = await Promise.all([
    canTabPermission("education_admissions", "admissions", "applications", "edit"),
    canTabPermission("education_documents", "documents", "library", "view"),
  ]);
  if (!canEditAdmissions || !canViewDocuments) {
    throw new Error("Admission edit and document view access are required to review applicant documents.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_admission_document_review", {
    p_org_id: context.orgId,
    p_document_id: documentId,
    p_verification_status: verificationStatus,
    p_note: note || null,
  });
  if (error) {
    if (error.code === "42501") throw new Error(`Applicant document review was not authorized: ${error.message}`);
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/admissions")}?document_error=not-found`);
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/admissions")}?document_error=review-invalid`);
    console.error("Could not review Think Education admission document:", error.message);
    redirect(`${getProductAppPath("think-education", "/admissions")}?document_error=save`);
  }

  revalidatePath("/education/admissions");
  revalidatePath("/education/documents");
  revalidatePath("/education/activity");
  redirect(`${getProductAppPath("think-education", "/admissions")}?documentReviewed=${verificationStatus}`);
}

export async function purgeExpiredEducationDocument(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_documents", "documents", "library", "delete")) {
    throw new Error("You do not have permission to permanently purge expired Think Education documents.");
  }
  const documentId = String(formData.get("document_id") ?? "");
  if (!documentId) redirect(`${getProductAppPath("think-education", "/documents")}?error=invalid`);

  const supabase = await createClient();
  const { data: storagePath, error: prepareError } = await supabase.rpc("education_document_prepare_purge", {
    p_org_id: context.orgId,
    p_document_id: documentId,
  });
  if (prepareError) {
    if (prepareError.code === "22023") redirect(`${getProductAppPath("think-education", "/documents")}?error=retention`);
    if (prepareError.code === "P0002") redirect(`${getProductAppPath("think-education", "/documents")}?error=not-found`);
    if (prepareError.code === "42501") throw new Error("You are not authorized to purge this document.");
    console.error("Could not prepare expired Think Education document purge:", prepareError.message);
    redirect(`${getProductAppPath("think-education", "/documents")}?error=purge`);
  }
  if (storagePath) {
    const { error: removeError } = await supabase.storage.from("education-documents").remove([storagePath]);
    if (removeError) {
      console.error("Could not remove expired Think Education document file:", removeError.message);
      redirect(`${getProductAppPath("think-education", "/documents")}?error=purge`);
    }
  }
  const { error: completeError } = await supabase.rpc("education_document_complete_purge", {
    p_org_id: context.orgId,
    p_document_id: documentId,
  });
  if (completeError) {
    console.error("Could not finalize expired Think Education document purge:", completeError.message);
    redirect(`${getProductAppPath("think-education", "/documents")}?error=purge`);
  }

  revalidatePath("/education/documents");
  redirect(`${getProductAppPath("think-education", "/documents")}?purged=1`);
}

export async function createEducationTimetableEntry(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_timetables", "timetables", "schedule", "create")) {
    throw new Error("You do not have permission to create Think Education timetable entries.");
  }
  if (!await canTabPermission("education_academics", "academics", "calendar", "view")) {
    throw new Error("Academic calendar view access is required to select an approved subject.");
  }

  const branchId = String(formData.get("branch_id") ?? "");
  const staffId = String(formData.get("staff_id") ?? "").trim();
  const academicYearId = String(formData.get("academic_year_id") ?? "");
  const classSubjectId = String(formData.get("class_subject_id") ?? "");
  const weekday = Number(String(formData.get("weekday") ?? ""));
  const startsAt = String(formData.get("starts_at") ?? "");
  const endsAt = String(formData.get("ends_at") ?? "");
  const room = String(formData.get("room") ?? "").trim();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!branchId || !uuidPattern.test(academicYearId) || !uuidPattern.test(classSubjectId)
    || !Number.isInteger(weekday) || weekday < 1 || weekday > 7
    || !/^\d{2}:\d{2}$/.test(startsAt) || !/^\d{2}:\d{2}$/.test(endsAt) || endsAt <= startsAt
    || room.length > 80) {
    redirect(`${getProductAppPath("think-education", "/timetables")}?error=invalid`);
  }
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === branchId)) {
    throw new Error("You cannot schedule classes outside your assigned Think Education campuses.");
  }

  const supabase = await createClient();
  const { data: assignment, error: assignmentError } = await supabase.from("education_class_subjects")
    .select("id, branch_id, class_id, subject_id")
    .eq("org_id", context.orgId).eq("id", classSubjectId).eq("status", "active")
    .maybeSingle();
  if (assignmentError) throw new Error(`Could not validate the selected class subject: ${assignmentError.message}`);
  if (!assignment || assignment.branch_id !== branchId) {
    redirect(`${getProductAppPath("think-education", "/timetables")}?error=allocation`);
  }

  const { data: classroom, error: classError } = await supabase.from("education_classes")
    .select("id, branch_id, academic_year_id, status")
    .eq("org_id", context.orgId).eq("id", assignment.class_id)
    .maybeSingle();
  if (classError) throw new Error(`Could not validate the class for the timetable entry: ${classError.message}`);
  if (!classroom || classroom.branch_id !== branchId || classroom.academic_year_id !== academicYearId || classroom.status !== "active") {
    redirect(`${getProductAppPath("think-education", "/timetables")}?error=allocation`);
  }

  const { data: subjectData, error: subjectError } = await supabase.from("education_subjects")
    .select("id, name, status")
    .eq("org_id", context.orgId).eq("id", assignment.subject_id).eq("status", "active")
    .maybeSingle();
  if (subjectError) throw new Error(`Could not validate the selected Think Education subject: ${subjectError.message}`);
  const subject = subjectData
    ? getActiveEducationSubject([subjectData], assignment.subject_id)
    : null;
  if (!subject) redirect(`${getProductAppPath("think-education", "/timetables")}?error=subject`);

  const { error } = await supabase.rpc("education_create_timetable_entry", {
    p_org_id: context.orgId,
    p_branch_id: branchId,
    p_class_id: classroom.id,
    p_staff_id: staffId || null,
    p_academic_year_id: academicYearId,
    p_subject_name: subject.name,
    p_weekday: weekday,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_room: room || null,
  });
  if (error) {
    if (error.code === "23P01") redirect(`${getProductAppPath("think-education", "/timetables")}?error=conflict`);
    if (error.code === "22023") {
      const errorType = error.message.includes("assigned to this class")
        ? "allocation"
        : error.message.includes("selected subject") ? "subject" : "invalid";
      redirect(`${getProductAppPath("think-education", "/timetables")}?error=${errorType}`);
    }
    if (error.code === "42501") throw new Error(`Timetable entry was not authorized: ${error.message}`);
    console.error("Could not create Think Education timetable entry:", error.message);
    redirect(`${getProductAppPath("think-education", "/timetables")}?error=save`);
  }
  revalidatePath("/education/timetables");
  redirect(`${getProductAppPath("think-education", "/timetables")}?created=1`);
}

export async function updateEducationTimetableEntry(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_timetables", "timetables", "schedule", "edit")) {
    throw new Error("You do not have permission to edit Think Education timetable entries.");
  }

  const entryId = String(formData.get("entry_id") ?? "");
  const expectedUpdatedAt = String(formData.get("expected_updated_at") ?? "");
  const classId = String(formData.get("class_id") ?? "");
  const staffId = String(formData.get("staff_id") ?? "").trim();
  const weekday = Number(String(formData.get("weekday") ?? ""));
  const startsAt = String(formData.get("starts_at") ?? "");
  const endsAt = String(formData.get("ends_at") ?? "");
  const room = String(formData.get("room") ?? "").trim();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!uuidPattern.test(entryId) || !uuidPattern.test(classId)
    || (staffId && !uuidPattern.test(staffId))
    || !Number.isFinite(Date.parse(expectedUpdatedAt))
    || !Number.isInteger(weekday) || weekday < 1 || weekday > 7
    || !timePattern.test(startsAt) || !timePattern.test(endsAt) || endsAt <= startsAt
    || room.length > 80) {
    redirect(`${getProductAppPath("think-education", "/timetables")}?error=invalid`);
  }

  const supabase = await createClient();
  const { data: entry, error: entryError } = await supabase.from("education_timetable_entries")
    .select("id, branch_id, status")
    .eq("org_id", context.orgId).eq("id", entryId)
    .maybeSingle();
  if (entryError) throw new Error(`Could not load timetable entry for editing: ${entryError.message}`);
  if (!entry || entry.status !== "active") {
    redirect(`${getProductAppPath("think-education", "/timetables")}?error=transition`);
  }
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === entry.branch_id)) {
    throw new Error("You cannot edit a timetable entry outside your assigned campuses.");
  }

  const { error } = await supabase.rpc("education_update_timetable_entry", {
    p_org_id: context.orgId,
    p_entry_id: entryId,
    p_expected_updated_at: expectedUpdatedAt,
    p_class_id: classId,
    p_staff_id: staffId || null,
    p_weekday: weekday,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_room: room || null,
  });
  if (error) {
    if (error.code === "23P01") redirect(`${getProductAppPath("think-education", "/timetables")}?error=conflict`);
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/timetables")}?error=invalid`);
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/timetables")}?error=stale`);
    if (error.code === "42501") throw new Error(`Timetable entry was not authorized: ${error.message}`);
    console.error("Could not update Think Education timetable entry:", error.message);
    redirect(`${getProductAppPath("think-education", "/timetables")}?error=save`);
  }
  revalidatePath("/education/timetables");
  redirect(`${getProductAppPath("think-education", "/timetables")}?updated=1`);
}

export async function cancelEducationTimetableEntry(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_timetables", "timetables", "schedule", "edit")) {
    throw new Error("You do not have permission to cancel Think Education timetable entries.");
  }

  const entryId = String(formData.get("entry_id") ?? "");
  const expectedUpdatedAt = String(formData.get("expected_updated_at") ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entryId)
    || !Number.isFinite(Date.parse(expectedUpdatedAt))) {
    redirect(`${getProductAppPath("think-education", "/timetables")}?error=invalid`);
  }

  const supabase = await createClient();
  const { data: entry, error: entryError } = await supabase.from("education_timetable_entries")
    .select("id, branch_id, status")
    .eq("org_id", context.orgId).eq("id", entryId)
    .maybeSingle();
  if (entryError) throw new Error(`Could not load timetable entry for cancellation: ${entryError.message}`);
  if (!entry || entry.status !== "active") {
    redirect(`${getProductAppPath("think-education", "/timetables")}?error=transition`);
  }
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === entry.branch_id)) {
    throw new Error("You cannot cancel a timetable entry outside your assigned campuses.");
  }

  const { error } = await supabase.rpc("education_cancel_timetable_entry", {
    p_org_id: context.orgId,
    p_entry_id: entryId,
    p_expected_updated_at: expectedUpdatedAt,
  });
  if (error) {
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/timetables")}?error=stale`);
    if (error.code === "42501") throw new Error(`Timetable entry was not authorized: ${error.message}`);
    console.error("Could not cancel Think Education timetable entry:", error.message);
    redirect(`${getProductAppPath("think-education", "/timetables")}?error=save`);
  }
  revalidatePath("/education/timetables");
  redirect(`${getProductAppPath("think-education", "/timetables")}?cancelled=1`);
}

export async function enrollEducationStudentInClass(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_students", "students", "list", "edit")) {
    throw new Error("You do not have permission to enroll Think Education students in a class.");
  }

  const studentId = String(formData.get("student_id") ?? "");
  const classId = String(formData.get("class_id") ?? "");
  if (!studentId || !classId) {
    redirect(`${getProductAppPath("think-education", `/students/${encodeURIComponent(studentId)}`)}?tab=academic&enrollmentError=invalid`);
  }

  const supabase = await createClient();
  const { data: enrollmentId, error } = await supabase.rpc("education_enroll_student_in_class", {
    p_org_id: context.orgId,
    p_student_id: studentId,
    p_class_id: classId,
  });
  if (error) {
    if (error.code === "23505") {
      redirect(`${getProductAppPath("think-education", `/students/${encodeURIComponent(studentId)}`)}?tab=academic&enrollmentError=exists`);
    }
    if (error.code === "P0002") {
      redirect(`${getProductAppPath("think-education", `/students/${encodeURIComponent(studentId)}`)}?tab=academic&enrollmentError=unavailable`);
    }
    if (error.code === "22023") {
      redirect(`${getProductAppPath("think-education", `/students/${encodeURIComponent(studentId)}`)}?tab=academic&enrollmentError=inactive`);
    }
    if (error.code === "42501") {
      throw new Error("You are not authorized to enroll this student at the selected campus.");
    }
    console.error("Could not enroll Think Education student in class:", error.message);
    redirect(`${getProductAppPath("think-education", `/students/${encodeURIComponent(studentId)}`)}?tab=academic&enrollmentError=save`);
  }
  if (!enrollmentId) throw new Error("Student enrollment did not return an enrollment record.");

  revalidatePath(`/education/students/${studentId}`);
  revalidatePath("/education/students");
  revalidatePath("/education/promotion");
  redirect(`${getProductAppPath("think-education", `/students/${encodeURIComponent(studentId)}`)}?tab=academic&enrolled=1`);
}

export async function promoteEducationStudent(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  const parsed = educationStudentPromotionInputSchema.safeParse({
    studentId: String(formData.get("student_id") ?? ""),
    sourceEnrollmentId: String(formData.get("source_enrollment_id") ?? ""),
    destinationClassId: String(formData.get("destination_class_id") ?? ""),
    action: String(formData.get("action") ?? ""),
  });
  if (!parsed.success) {
    redirect(`${getProductAppPath("think-education", "/promotion")}?error=invalid`);
  }
  const { studentId, sourceEnrollmentId, destinationClassId, action } = parsed.data;
  const progressionAction = action;
  if (!await canTabPermission("education_promotion", "promotion", "progression", "edit")
    || !await canTabPermission("education_promotion", "promotion", "progression", "approve")
    || (progressionAction === "promote" && !await canTabPermission("education_promotion", "promotion", "progression", "create"))) {
    throw new Error("You need edit and approval access to process student progression.");
  }

  const supabase = await createClient();
  const { data: enrollment, error: enrollmentError } = await supabase.from("education_student_enrollments")
    .select("id, branch_id, student_id")
    .eq("org_id", context.orgId).eq("id", sourceEnrollmentId).eq("student_id", studentId)
    .eq("status", "active").maybeSingle();
  if (enrollmentError) throw new Error(`Could not load active student enrollment: ${enrollmentError.message}`);
  if (!enrollment) redirect(`${getProductAppPath("think-education", "/promotion")}?error=stale`);
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === enrollment.branch_id)) {
    throw new Error("You cannot progress a student outside your assigned Think Education campuses.");
  }

  const { error } = await supabase.rpc("education_promote_student", {
    p_org_id: context.orgId,
    p_student_id: studentId,
    p_source_enrollment_id: sourceEnrollmentId,
    p_destination_class_id: destinationClassId || null,
    p_action: progressionAction,
  });
  if (error) {
    if (error.code === "23505" || error.code === "22023" || error.code === "P0002") {
      redirect(`${getProductAppPath("think-education", "/promotion")}?error=stale`);
    }
    if (error.code === "42501") throw new Error(`Student progression was not authorized: ${error.message}`);
    console.error("Could not process Think Education student progression:", error.message);
    redirect(`${getProductAppPath("think-education", "/promotion")}?error=save`);
  }
  revalidatePath("/education/promotion");
  revalidatePath("/education/students");
  revalidatePath("/education/academics");
  redirect(`${getProductAppPath("think-education", "/promotion")}?updated=${progressionAction}`);
}
