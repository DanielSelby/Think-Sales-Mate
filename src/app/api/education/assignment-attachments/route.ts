import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  uploadEducationAssignmentAttachment,
  validateEducationAssignmentAttachmentFile,
} from "@/lib/education/assignment-attachment-upload";
import { createClient } from "@/lib/supabase/server";

const uuidSchema = z.string().uuid();

function redirectToPortal(request: NextRequest, portal: "teacher" | "student", status: string) {
  const path = portal === "teacher" ? "/teacher-education-portal" : "/student-education-portal";
  const url = new URL(path, request.url);
  url.searchParams.set("assignment", status);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (
    (origin && origin !== new URL(request.url).origin)
    || request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    return NextResponse.json({ error: "This request could not be verified." }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) {
    console.error("Could not verify assignment attachment upload session:", userError.message);
    return NextResponse.json({ error: "Your session could not be verified." }, { status: 503 });
  }
  if (!user) return NextResponse.json({ error: "Sign in to upload this attachment." }, { status: 401 });

  const formData = await request.formData();
  const kindValue = String(formData.get("kind") ?? "");
  const portal = kindValue === "assignment" ? "teacher" : "student";
  const kind = kindValue === "assignment" || kindValue === "submission" ? kindValue : null;
  const assignmentId = String(formData.get("assignment_id") ?? "");
  const submissionId = String(formData.get("submission_id") ?? "");
  const studentId = String(formData.get("student_id") ?? "");
  if (!kind || !uuidSchema.safeParse(assignmentId).success
    || (kind === "submission"
      ? !uuidSchema.safeParse(submissionId).success || !uuidSchema.safeParse(studentId).success
      : Boolean(submissionId || studentId))) {
    return redirectToPortal(request, portal, "invalid");
  }

  const file = await validateEducationAssignmentAttachmentFile(formData.get("attachment"));
  if (!file) return redirectToPortal(request, portal, "invalid");

  const { data: assignment, error: assignmentError } = await supabase
    .from("education_assignments")
    .select("org_id")
    .eq("id", assignmentId)
    .maybeSingle();
  if (assignmentError) {
    console.error("Could not load assignment attachment context:", assignmentError.message);
    return redirectToPortal(request, portal, "attachment-error");
  }
  if (!assignment) return redirectToPortal(request, portal, "attachment-error");

  const result = await uploadEducationAssignmentAttachment(supabase, {
    orgId: assignment.org_id,
    assignmentId,
    submissionId: kind === "submission" ? submissionId : undefined,
    studentId: kind === "submission" ? studentId : undefined,
    kind,
    file,
  });
  if (!result.ok) return redirectToPortal(request, portal, "attachment-error");

  revalidatePath("/teacher-education-portal");
  revalidatePath("/student-education-portal");
  revalidatePath("/education-portal");
  return redirectToPortal(request, portal, "attachment-uploaded");
}
