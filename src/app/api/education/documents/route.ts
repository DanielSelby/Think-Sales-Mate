import { NextRequest, NextResponse } from "next/server";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import {
  EDUCATION_DOCUMENT_CATEGORIES,
  EDUCATION_DOCUMENT_MAX_BYTES,
  isAllowedEducationDocumentFile,
} from "@/lib/education/documents";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";

function redirectWith(request: NextRequest, name: string, value: string) {
  const url = new URL(getProductAppPath("think-education", "/documents"), request.url);
  url.searchParams.set(name, value);
  return NextResponse.redirect(url, 303);
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export async function POST(request: NextRequest) {
  const context = await getCurrentOrgContext();
  if (!context) return redirectWith(request, "error", "auth");
  if (!await canTabPermission("education_documents", "documents", "library", "create")) {
    return redirectWith(request, "error", "permission");
  }

  const formData = await request.formData();
  const branchId = String(formData.get("branch_id") ?? "");
  const studentId = String(formData.get("student_id") ?? "") || null;
  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "");
  const retentionValue = String(formData.get("retention_until") ?? "");
  const file = formData.get("file");
  const fileName = file instanceof File
    ? file.name.replace(/[\/\\\u0000-\u001f\u007f]/g, "_").trim()
    : "";
  const categoryAllowed = EDUCATION_DOCUMENT_CATEGORIES.some(([value]) => value === category);
  if (!(file instanceof File) || !file.size || file.size > EDUCATION_DOCUMENT_MAX_BYTES
    || !title || title.length > 160 || !categoryAllowed
    || (retentionValue && !isValidDate(retentionValue))
    || !await isAllowedEducationDocumentFile(file)) {
    return redirectWith(request, "error", "invalid");
  }
  if (!fileName || fileName.length > 255) {
    return redirectWith(request, "error", "invalid");
  }

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === branchId)) {
    return redirectWith(request, "error", "campus");
  }

  const supabase = await createClient();
  if (studentId) {
    if (!await canTabPermission("education_students", "students", "list", "view")) {
      return redirectWith(request, "error", "permission");
    }
    const { data: student, error: studentError } = await supabase.from("education_students")
      .select("id")
      .eq("org_id", context.orgId)
      .eq("branch_id", branchId)
      .eq("id", studentId)
      .eq("status", "active")
      .maybeSingle();
    if (studentError) throw new Error(`Could not verify the selected student: ${studentError.message}`);
    if (!student) return redirectWith(request, "error", "student");
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(`Could not verify the signed-in account: ${userError.message}`);
  if (!user) return redirectWith(request, "error", "auth");

  const storagePath = `${context.orgId}/${branchId}/${crypto.randomUUID()}`;
  const { error: uploadError } = await supabase.storage.from("education-documents").upload(storagePath, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) {
    console.error("Could not upload Think Education document:", uploadError.message);
    return redirectWith(request, "error", "upload");
  }

  const { error: registerError } = await supabase.rpc("education_document_register", {
    p_org_id: context.orgId,
    p_branch_id: branchId,
    p_student_id: studentId,
    p_title: title,
    p_category: category,
    p_file_name: fileName,
    p_content_type: file.type,
    p_file_size: file.size,
    p_storage_path: storagePath,
    p_retention_until: retentionValue || null,
  });
  if (registerError) {
    const { error: cleanupError } = await supabase.storage.from("education-documents").remove([storagePath]);
    if (cleanupError) {
      console.error("Could not remove unregistered Think Education upload:", cleanupError.message);
    }
    if (registerError.code === "22023") return redirectWith(request, "error", "invalid");
    if (registerError.code === "42501") return redirectWith(request, "error", "permission");
    console.error("Could not register Think Education document:", registerError.message);
    return redirectWith(request, "error", "save");
  }

  return redirectWith(request, "uploaded", "1");
}
