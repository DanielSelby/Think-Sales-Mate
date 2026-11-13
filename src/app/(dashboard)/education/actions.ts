"use server";

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
import { createStaffAccount, setMemberProductRole } from "@/app/(dashboard)/settings/organization/actions";
import { EDUCATION_COMMUNICATION_AUDIENCES } from "@/lib/education/communications";
import {
  EDUCATION_EXPENSE_CATEGORIES,
  EDUCATION_EXPENSE_PAYMENT_METHODS,
  isValidEducationExpenseDate,
} from "@/lib/education/expenses";

export type EducationImportEntity = "students" | "staff" | "campuses";

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
    "technical_vocational", "training", "other",
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
    institution_type: institutionType as "basic" | "primary" | "junior_high" | "senior_high" | "college" | "university" | "technical_vocational" | "training" | "other",
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
    console.error("Could not create Think Education fee charge:", error.message);
    redirect(`${getProductAppPath("think-education", "/finance")}?error=save`);
  }
  revalidatePath("/education/finance");
  redirect(`${getProductAppPath("think-education", "/finance")}?created=1`);
}

export async function recordEducationFeePayment(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_finance", "finance", "payments", "create")) {
    throw new Error("You do not have permission to record Think Education fee payments.");
  }

  const chargeId = String(formData.get("charge_id") ?? "");
  const amountText = String(formData.get("amount") ?? "").trim();
  const paymentMethod = String(formData.get("payment_method") ?? "");
  const reference = String(formData.get("reference") ?? "").trim();
  const amount = Number(amountText);
  const allowedMethods = ["cash", "mobile_money", "bank_transfer", "card", "cheque", "other"];
  if (!chargeId || !/^\d{1,10}(?:\.\d{1,2})?$/.test(amountText) || !Number.isFinite(amount)
    || amount <= 0 || !allowedMethods.includes(paymentMethod) || reference.length > 120) {
    redirect(`${getProductAppPath("think-education", "/finance")}?error=invalid`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_record_fee_payment", {
    p_org_id: context.orgId,
    p_charge_id: chargeId,
    p_amount: amount,
    p_payment_method: paymentMethod,
    p_reference: reference || null,
  });
  if (error) {
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/finance")}?error=payment`);
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/finance")}?error=not-found`);
    if (error.code === "42501") throw new Error("You are not authorized to record a payment for this charge.");
    console.error("Could not record Think Education fee payment:", error.message);
    redirect(`${getProductAppPath("think-education", "/finance")}?error=save`);
  }
  revalidatePath("/education/finance");
  redirect(`${getProductAppPath("think-education", "/finance")}?paid=1`);
}

export async function createEducationGuardianLink(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_guardians", "guardians", "directory", "create")
    || !await canTabPermission("education_students", "students", "list", "view")) {
    throw new Error("Guardian creation requires guardian create and student directory view access.");
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
    redirect(`${getProductAppPath("think-education", "/guardians")}?error=invalid`);
  }

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusIds = campuses.map((campus) => campus.id);
  if (!campusIds.length) throw new Error("You need an assigned Think Education campus to create guardian relationships.");
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

  const { error } = await supabase.rpc("education_create_guardian_link", {
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
    if (error.code === "23505") redirect(`${getProductAppPath("think-education", "/guardians")}?error=duplicate`);
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/guardians")}?error=invalid`);
    if (error.code === "42501") throw new Error("You are not authorized to create guardian relationships at this campus.");
    console.error("Could not create Think Education guardian relationship:", error.message);
    redirect(`${getProductAppPath("think-education", "/guardians")}?error=save`);
  }
  revalidatePath("/education/guardians");
  redirect(`${getProductAppPath("think-education", "/guardians")}?created=1`);
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

  const { error } = await supabase.rpc("education_link_existing_guardian", {
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
  redirect(`${getProductAppPath("think-education", "/guardians")}?linked=1`);
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
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/finance")}?error=schedule`);
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/finance")}?error=not-found`);
    if (error.code === "42501") throw new Error("You are not authorized to apply that fee schedule.");
    console.error("Could not apply Think Education fee schedule:", error.message);
    redirect(`${getProductAppPath("think-education", "/finance")}?error=save`);
  }
  revalidatePath("/education/finance");
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

export async function createEducationStudent(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) return { error: "Session expired. Sign in again." };
  if (!await canTabPermission("education_students", "students", "list", "create")) {
    return { error: "You do not have permission to create Think Education student records." };
  }

  const branchId = String(formData.get("branch_id") ?? "");
  const studentNumber = String(formData.get("student_number") ?? "").trim();
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const otherNames = String(formData.get("other_names") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const dateOfBirth = String(formData.get("date_of_birth") ?? "").trim();
  const createAccount = formData.get("create_account") === "true";
  if (!branchId || !/^[A-Za-z0-9._/-]{1,32}$/.test(studentNumber) || !firstName || !lastName) {
    return { error: "Check the student number, name, and campus fields." };
  }
  if (firstName.length > 100 || lastName.length > 100 || otherNames.length > 100
    || email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    || phone.length > 32 || (dateOfBirth && !isValidEducationStaffDate(dateOfBirth))) {
    return { error: "Enter a valid email address and date of birth." };
  }

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === branchId)) {
    return { error: "You cannot create a student record outside your assigned Think Education campuses." };
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

  const supabase = await createClient();
  const { error } = await supabase.from("education_students").insert({
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
    created_by: context.userId,
  });
  if (error) {
    const cleanupMessage = account ? await removeCreatedEducationAccount(context.orgId, account) : "";
    if (error.code === "23505") return { error: `That student number or linked account is already in use.${cleanupMessage}` };
    console.error("Could not create Think Education student:", error.message);
    return { error: `The student record could not be saved: ${error.message}.${cleanupMessage}` };
  }

  revalidatePath("/education/students");
  revalidatePath("/education/settings/users");
  return {
    success: true,
    username: account?.username,
    temporaryPassword: account?.temporaryPassword,
  };
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

export async function createEducationStaff(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) return { error: "Session expired. Sign in again." };
  if (!await canTabPermission("education_staff", "staff", "directory", "create")) {
    return { error: "You do not have permission to create Think Education staff records." };
  }

  const branchId = String(formData.get("branch_id") ?? "");
  const staffNumber = String(formData.get("staff_number") ?? "").trim();
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
    return { error: "Check the staff number, name, category, and email fields." };
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
        const studentNumber = getValue(values, "student_number");
        const firstName = getValue(values, "first_name");
        const lastName = getValue(values, "last_name");
        const otherNames = getValue(values, "other_names");
        const email = getValue(values, "email");
        const phone = getValue(values, "phone");
        const dateOfBirth = getValue(values, "date_of_birth");
        if (!/^[A-Za-z0-9._/-]{1,32}$/.test(studentNumber)
          || !firstName || firstName.length > 100 || !lastName || lastName.length > 100
          || otherNames.length > 100 || !emailIsValid(email) || phone.length > 32
          || (dateOfBirth && !isValidEducationStaffDate(dateOfBirth))) {
          return { row: rowNumber, error: "Check the student number, name, date of birth, and contact fields." };
        }
        return runRowAction(rowNumber, () => createEducationStudent(formData));
      }

      const staffNumber = getValue(values, "staff_number");
      const firstName = getValue(values, "first_name");
      const lastName = getValue(values, "last_name");
      const category = getValue(values, "staff_category");
      const email = getValue(values, "email");
      if (!/^[A-Za-z0-9._/-]{1,32}$/.test(staffNumber)
        || !firstName || firstName.length > 100 || !lastName || lastName.length > 100
        || !["teaching", "non_teaching"].includes(category)
        || getValue(values, "job_title").length > 120
        || !emailIsValid(email) || getValue(values, "phone").length > 32) {
        return { row: rowNumber, error: "Check the staff number, name, category, and contact fields." };
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
  revalidatePath("/education/staff");
  revalidatePath(`/education/staff/${staffId}`);
  redirect(`${getProductAppPath("think-education", `/staff/${staffId}`)}?saved=1`);
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

export async function createEducationAdmission(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_admissions", "admissions", "applications", "create")) {
    throw new Error("You do not have permission to create Think Education applications.");
  }

  const branchId = String(formData.get("branch_id") ?? "");
  const applicationNumber = String(formData.get("application_number") ?? "").trim();
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const requestedClassId = String(formData.get("requested_class_id") ?? "").trim();
  if (!branchId || !/^[A-Za-z0-9._/-]{1,32}$/.test(applicationNumber)
    || !firstName || firstName.length > 100 || !lastName || lastName.length > 100
    || email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    || phone.length > 32 || (requestedClassId && !/^[0-9a-f-]{36}$/i.test(requestedClassId))) {
    redirect(`${getProductAppPath("think-education", "/admissions")}?error=invalid`);
  }

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === branchId)) {
    throw new Error("You cannot create an application outside your assigned Think Education campuses.");
  }

  const supabase = await createClient();
  if (requestedClassId) {
    if (!await canTabPermission("education_academics", "academics", "classes", "view")) {
      throw new Error("Academic class access is required to select a requested class.");
    }
    const { data: requestedClass, error: classError } = await supabase.from("education_classes")
      .select("id, academic_year_id")
      .eq("org_id", context.orgId).eq("id", requestedClassId)
      .eq("branch_id", branchId).eq("status", "active").maybeSingle();
    if (classError) throw new Error(`Could not verify the requested admission class: ${classError.message}`);
    if (!requestedClass) redirect(`${getProductAppPath("think-education", "/admissions")}?error=class`);
    const { data: academicYear, error: yearError } = await supabase.from("education_academic_years")
      .select("id").eq("org_id", context.orgId)
      .eq("id", requestedClass.academic_year_id).eq("status", "active").maybeSingle();
    if (yearError) throw new Error(`Could not verify the requested class academic year: ${yearError.message}`);
    if (!academicYear) redirect(`${getProductAppPath("think-education", "/admissions")}?error=class`);
  }
  const { error } = await supabase.from("education_admissions").insert({
    org_id: context.orgId,
    branch_id: branchId,
    application_number: applicationNumber,
    applicant_first_name: firstName,
    applicant_last_name: lastName,
    applicant_email: email || null,
    applicant_phone: phone || null,
    requested_class_id: requestedClassId || null,
  });
  if (error) {
    if (error.code === "23505") redirect(`${getProductAppPath("think-education", "/admissions")}?error=duplicate`);
    console.error("Could not create Think Education application:", error.message);
    redirect(`${getProductAppPath("think-education", "/admissions")}?error=save`);
  }

  revalidatePath("/education/admissions");
  redirect(`${getProductAppPath("think-education", "/admissions")}?created=1`);
}

export async function updateEducationAdmissionStatus(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");

  const admissionId = String(formData.get("admission_id") ?? "");
  const status = String(formData.get("status") ?? "");
  const decisionNote = String(formData.get("decision_note") ?? "").trim();
  const studentNumber = String(formData.get("student_number") ?? "").trim();
  const classId = String(formData.get("class_id") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(admissionId)
    || !["under_review", "admitted", "rejected", "withdrawn", "enrolled"].includes(status)
    || decisionNote.length > 1000
    || (["rejected", "withdrawn"].includes(status) && !decisionNote)
    || (status === "enrolled" && (!/^[A-Za-z0-9._/-]{1,32}$/.test(studentNumber) || !/^[0-9a-f-]{36}$/i.test(classId)))
    || (status !== "enrolled" && (studentNumber || classId))) {
    redirect(`${getProductAppPath("think-education", "/admissions")}?error=invalid`);
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
      redirect(`${getProductAppPath("think-education", "/admissions")}?error=student-number`);
    }
    if (error.code === "23514") {
      redirect(`${getProductAppPath("think-education", "/admissions")}?error=capacity`);
    }
    if (error.code === "22023") {
      if (error.message.includes("selected class")) {
        redirect(`${getProductAppPath("think-education", "/admissions")}?error=class`);
      }
      redirect(`${getProductAppPath("think-education", "/admissions")}?error=transition`);
    }
    if (error.code === "P0002") {
      redirect(`${getProductAppPath("think-education", "/admissions")}?error=not-found`);
    }
    console.error("Could not process Think Education application:", error.message);
    redirect(`${getProductAppPath("think-education", "/admissions")}?error=save`);
  }
  revalidatePath("/education/students");
  revalidatePath("/education/academics");
  revalidatePath("/education/attendance");
  revalidatePath("/education/finance");
  revalidatePath("/education/admissions");
  redirect(`${getProductAppPath("think-education", "/admissions")}?updated=1${status === "enrolled" ? "&enrolled=1" : ""}`);
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
  const name = String(formData.get("name") ?? "").trim();
  const levelName = String(formData.get("level_name") ?? "").trim();
  const streamName = String(formData.get("stream_name") ?? "").trim();
  const capacityValue = String(formData.get("capacity") ?? "").trim();
  const capacity = capacityValue ? Number(capacityValue) : null;
  if (!branchId || !academicYearId || !name || name.length > 100 || levelName.length > 80
    || streamName.length > 80 || (capacity !== null && (!Number.isInteger(capacity) || capacity < 1))) {
    redirect(`${getProductAppPath("think-education", "/academics")}?error=invalid`);
  }
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === branchId)) {
    throw new Error("You cannot create a class outside your assigned Think Education campuses.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("education_classes").insert({
    org_id: context.orgId,
    branch_id: branchId,
    academic_year_id: academicYearId,
    name,
    level_name: levelName || null,
    stream_name: streamName || null,
    capacity,
  });
  if (error) {
    if (error.code === "23505") redirect(`${getProductAppPath("think-education", "/academics")}?error=duplicate`);
    console.error("Could not create Think Education class:", error.message);
    redirect(`${getProductAppPath("think-education", "/academics")}?error=save`);
  }
  revalidatePath("/education/academics");
  redirect(`${getProductAppPath("think-education", "/academics")}?created=1`);
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

  const requestId = String(formData.get("request_id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const decisionNote = String(formData.get("decision_note") ?? "").trim();
  if (!requestId || !["approved", "rejected"].includes(decision)
    || decisionNote.length > 1000 || (decision === "rejected" && !decisionNote)) {
    redirect(`${getProductAppPath("think-education", "/staff/leave")}?error=invalid`);
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("education_staff_leave_decide", {
    p_org_id: context.orgId,
    p_request_id: requestId,
    p_decision: decision,
    p_decision_note: decisionNote || null,
  });
  if (error) {
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/staff/leave")}?error=invalid`);
    if (error.code === "42501") redirect(`${getProductAppPath("think-education", "/staff/leave")}?error=permission`);
    if (error.code === "23505") redirect(`${getProductAppPath("think-education", "/staff/leave")}?error=overlap`);
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/staff/leave")}?error=transition`);
    console.error("Could not decide Think Education staff leave request:", error.message);
    redirect(`${getProductAppPath("think-education", "/staff/leave")}?error=save`);
  }
  revalidatePath("/education/staff/leave");
  redirect(`${getProductAppPath("think-education", "/staff/leave")}?updated=1`);
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
  if (!/^[A-Za-z0-9._/-]{1,32}$/.test(staffNumber) || !sourceBranchId || !destinationBranchId
    || sourceBranchId === destinationBranchId || !validDate || !reason || reason.length > 1000) {
    redirect(`${getProductAppPath("think-education", "/staff/transfers")}?error=invalid`);
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
  if (!staff) redirect(`${getProductAppPath("think-education", "/staff/transfers")}?error=staff`);

  const { error } = await supabase.rpc("education_staff_transfer_request", {
    p_org_id: context.orgId,
    p_staff_id: staff.id,
    p_source_branch_id: sourceBranchId,
    p_destination_branch_id: destinationBranchId,
    p_effective_on: effectiveOn,
    p_reason: reason,
  });
  if (error) {
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/staff/transfers")}?error=invalid`);
    if (error.code === "23505") redirect(`${getProductAppPath("think-education", "/staff/transfers")}?error=pending`);
    if (error.code === "23514") redirect(`${getProductAppPath("think-education", "/staff/transfers")}?error=conflict`);
    if (error.code === "42501") throw new Error("You do not have permission to request that staff transfer.");
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/staff/transfers")}?error=staff`);
    console.error("Could not create Think Education staff transfer:", error.message);
    redirect(`${getProductAppPath("think-education", "/staff/transfers")}?error=save`);
  }
  revalidatePath("/education/staff/transfers");
  revalidatePath("/education/staff");
  redirect(`${getProductAppPath("think-education", "/staff/transfers")}?created=1`);
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

export async function createEducationResult(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_results", "results", "gradebook", "create")) {
    throw new Error("You do not have permission to enter Think Education results.");
  }

  const examinationId = String(formData.get("examination_id") ?? "");
  const studentNumber = String(formData.get("student_number") ?? "").trim();
  const subjectName = String(formData.get("subject_name") ?? "").trim();
  const score = Number(String(formData.get("score") ?? ""));
  const maximumScore = Number(String(formData.get("maximum_score") ?? ""));
  const grade = String(formData.get("grade") ?? "").trim();
  if (!examinationId || !/^[A-Za-z0-9._/-]{1,32}$/.test(studentNumber)
    || !subjectName || subjectName.length > 120 || !Number.isFinite(score) || score < 0
    || !Number.isFinite(maximumScore) || maximumScore <= 0 || score > maximumScore || grade.length > 10) {
    redirect(`${getProductAppPath("think-education", "/results")}?error=invalid`);
  }
  const supabase = await createClient();
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

  const { error } = await supabase.from("education_results").insert({
    org_id: context.orgId,
    branch_id: examination.branch_id,
    examination_id: examination.id,
    student_id: student.id,
    subject_name: subjectName,
    score,
    maximum_score: maximumScore,
    grade: grade || null,
    entered_by: context.userId,
  });
  if (error) {
    if (error.code === "23505") redirect(`${getProductAppPath("think-education", "/results")}?error=duplicate`);
    console.error("Could not save Think Education result:", error.message);
    redirect(`${getProductAppPath("think-education", "/results")}?error=save`);
  }
  revalidatePath("/education/results");
  revalidatePath("/education/examinations");
  redirect(`${getProductAppPath("think-education", "/results")}?examination=${encodeURIComponent(examination.id)}&created=1`);
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

  const studentNumber = String(formData.get("student_number") ?? "").trim();
  const sourceBranchId = String(formData.get("source_branch_id") ?? "");
  const destinationBranchId = String(formData.get("destination_branch_id") ?? "");
  const effectiveOn = String(formData.get("effective_on") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!/^[A-Za-z0-9._/-]{1,32}$/.test(studentNumber) || !sourceBranchId || !destinationBranchId
    || sourceBranchId === destinationBranchId || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveOn)
    || !reason || reason.length > 500) {
    redirect(`${getProductAppPath("think-education", "/transfers")}?error=invalid`);
  }
  const parsedEffectiveOn = new Date(`${effectiveOn}T00:00:00.000Z`);
  if (Number.isNaN(parsedEffectiveOn.getTime()) || parsedEffectiveOn.toISOString().slice(0, 10) !== effectiveOn) {
    redirect(`${getProductAppPath("think-education", "/transfers")}?error=invalid`);
  }

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
  if (!student) redirect(`${getProductAppPath("think-education", "/transfers")}?error=student`);

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
    if (error.code === "23514") redirect(`${getProductAppPath("think-education", "/transfers")}?error=source`);
    console.error("Could not create Think Education student transfer:", error.message);
    redirect(`${getProductAppPath("think-education", "/transfers")}?error=save`);
  }
  revalidatePath("/education/transfers");
  redirect(`${getProductAppPath("think-education", "/transfers")}?created=1`);
}

export async function transitionEducationStudentTransfer(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  const transferId = String(formData.get("transfer_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!transferId || !["approved", "rejected", "completed"].includes(status)) {
    redirect(`${getProductAppPath("think-education", "/transfers")}?error=invalid`);
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
  if (!validTransition) redirect(`${getProductAppPath("think-education", "/transfers")}?error=transition`);

  const { error } = await supabase.rpc("education_transition_student_transfer", {
    p_transfer_id: transferId,
    p_status: nextStatus,
  });
  if (error) {
    if (error.code === "42501") throw new Error(`Transfer was not authorized: ${error.message}`);
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/transfers")}?error=transition`);
    console.error("Could not process Think Education student transfer:", error.message);
    redirect(`${getProductAppPath("think-education", "/transfers")}?error=save`);
  }
  revalidatePath("/education/transfers");
  revalidatePath("/education/students");
  revalidatePath("/education/attendance");
  revalidatePath("/education/academics");
  redirect(`${getProductAppPath("think-education", "/transfers")}?updated=1`);
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
  const amount = Number(amountText);
  if (!branchId || !EDUCATION_EXPENSE_CATEGORIES.includes(category as typeof EDUCATION_EXPENSE_CATEGORIES[number])
    || vendor.length > 160 || !description || description.length > 500
    || !/^\d{1,10}(?:\.\d{1,2})?$/.test(amountText) || !Number.isFinite(amount) || amount <= 0
    || amount > 9_999_999_999.99 || !isValidEducationExpenseDate(expenseDate) || reference.length > 120) {
    redirect(`${getProductAppPath("think-education", "/expenses")}?error=invalid`);
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
  });
  if (error) {
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/expenses")}?error=invalid`);
    if (error.code === "42501") throw new Error("You are not authorized to create expenses at this campus.");
    console.error("Could not create Think Education expense:", error.message);
    redirect(`${getProductAppPath("think-education", "/expenses")}?error=save`);
  }
  revalidatePath("/education/expenses");
  redirect(`${getProductAppPath("think-education", "/expenses")}?created=1`);
}

export async function reviewEducationExpense(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_expenses", "expenses", "records", "approve")) {
    throw new Error("You do not have permission to approve or reject Think Education expenses.");
  }

  const expenseId = String(formData.get("expense_id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!expenseId || !["approved", "rejected"].includes(decision)
    || (decision === "rejected" && (reason.length < 3 || reason.length > 500))
    || (decision === "approved" && reason.length > 500)) {
    redirect(`${getProductAppPath("think-education", "/expenses")}?error=invalid`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_review_expense", {
    p_org_id: context.orgId,
    p_expense_id: expenseId,
    p_decision: decision,
    p_reason: reason || null,
  });
  if (error) {
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/expenses")}?error=transition`);
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/expenses")}?error=not-found`);
    if (error.code === "42501") throw new Error("You are not authorized to review this expense at its campus.");
    console.error("Could not review Think Education expense:", error.message);
    redirect(`${getProductAppPath("think-education", "/expenses")}?error=save`);
  }
  revalidatePath("/education/expenses");
  redirect(`${getProductAppPath("think-education", "/expenses")}?reviewed=${decision}`);
}

export async function markEducationExpensePaid(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_expenses", "expenses", "records", "edit")) {
    throw new Error("You do not have permission to record Think Education expense payments.");
  }

  const expenseId = String(formData.get("expense_id") ?? "");
  const paymentMethod = String(formData.get("payment_method") ?? "");
  const paidOn = String(formData.get("paid_on") ?? "");
  if (!expenseId
    || !EDUCATION_EXPENSE_PAYMENT_METHODS.some(([value]) => value === paymentMethod)
    || !isValidEducationExpenseDate(paidOn)) {
    redirect(`${getProductAppPath("think-education", "/expenses")}?error=invalid`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_mark_expense_paid", {
    p_org_id: context.orgId,
    p_expense_id: expenseId,
    p_payment_method: paymentMethod,
    p_paid_on: paidOn,
  });
  if (error) {
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/expenses")}?error=transition`);
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/expenses")}?error=not-found`);
    if (error.code === "42501") throw new Error("You are not authorized to record expense payments at this campus.");
    console.error("Could not record Think Education expense payment:", error.message);
    redirect(`${getProductAppPath("think-education", "/expenses")}?error=save`);
  }
  revalidatePath("/education/expenses");
  redirect(`${getProductAppPath("think-education", "/expenses")}?paid=1`);
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

export async function publishEducationCommunication(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_communication", "communication", "announcements", "publish")) {
    throw new Error("You do not have permission to publish Think Education announcements.");
  }
  const communicationId = String(formData.get("communication_id") ?? "");
  if (!communicationId) redirect(`${getProductAppPath("think-education", "/communication")}?error=invalid`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("education_communication_publish", {
    p_org_id: context.orgId,
    p_communication_id: communicationId,
  });
  if (error) {
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/communication")}?error=transition`);
    if (error.code === "P0002") redirect(`${getProductAppPath("think-education", "/communication")}?error=not-found`);
    if (error.code === "42501") throw new Error("You are not authorized to publish this announcement.");
    console.error("Could not publish Think Education announcement:", error.message);
    redirect(`${getProductAppPath("think-education", "/communication")}?error=save`);
  }
  revalidatePath("/education/communication");
  revalidatePath("/education-portal");
  revalidatePath("/student-education-portal");
  redirect(`${getProductAppPath("think-education", "/communication")}?published=1`);
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

  const branchId = String(formData.get("branch_id") ?? "");
  const classId = String(formData.get("class_id") ?? "");
  const staffId = String(formData.get("staff_id") ?? "").trim();
  const academicYearId = String(formData.get("academic_year_id") ?? "");
  const subject = String(formData.get("subject_name") ?? "").trim();
  const weekday = Number(String(formData.get("weekday") ?? ""));
  const startsAt = String(formData.get("starts_at") ?? "");
  const endsAt = String(formData.get("ends_at") ?? "");
  const room = String(formData.get("room") ?? "").trim();
  if (!branchId || !classId || !academicYearId || !subject || subject.length > 120
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
  const { error } = await supabase.rpc("education_create_timetable_entry", {
    p_org_id: context.orgId,
    p_branch_id: branchId,
    p_class_id: classId,
    p_staff_id: staffId || null,
    p_academic_year_id: academicYearId,
    p_subject_name: subject,
    p_weekday: weekday,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_room: room || null,
  });
  if (error) {
    if (error.code === "23P01") redirect(`${getProductAppPath("think-education", "/timetables")}?error=conflict`);
    if (error.code === "22023") redirect(`${getProductAppPath("think-education", "/timetables")}?error=invalid`);
    if (error.code === "42501") throw new Error(`Timetable entry was not authorized: ${error.message}`);
    console.error("Could not create Think Education timetable entry:", error.message);
    redirect(`${getProductAppPath("think-education", "/timetables")}?error=save`);
  }
  revalidatePath("/education/timetables");
  redirect(`${getProductAppPath("think-education", "/timetables")}?created=1`);
}

export async function promoteEducationStudent(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  const studentId = String(formData.get("student_id") ?? "");
  const sourceEnrollmentId = String(formData.get("source_enrollment_id") ?? "");
  const destinationClassId = String(formData.get("destination_class_id") ?? "").trim();
  const action = String(formData.get("action") ?? "");
  if (!studentId || !sourceEnrollmentId || !["promote", "graduate"].includes(action)
    || (action === "promote" && !destinationClassId)) {
    redirect(`${getProductAppPath("think-education", "/promotion")}?error=invalid`);
  }
  const progressionAction = action as "promote" | "graduate";
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
