"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { deliverMessage, hasConfiguredMessageProvider } from "@/lib/communication/providers";
import { createClassReportPdf } from "@/lib/education/class-report-pdf";

const CLASS_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function classListPath(query: string) {
  return `${getProductAppPath("think-education", "/academics")}?tab=classes&${query}`;
}

export async function updateEducationClass(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_academics", "academics", "classes", "edit")) {
    redirect(classListPath("error=permission"));
  }

  const classId = String(formData.get("class_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const classCode = String(formData.get("class_code") ?? "").trim();
  const levelName = String(formData.get("level_name") ?? "").trim();
  const streamName = String(formData.get("stream_name") ?? "").trim();
  const curriculumStage = String(formData.get("curriculum_stage") ?? "").trim();
  const medium = String(formData.get("medium") ?? "").trim();
  const classTeacherId = String(formData.get("class_teacher_id") ?? "").trim();
  const capacityValue = String(formData.get("capacity") ?? "").trim();
  const capacity = capacityValue ? Number(capacityValue) : null;
  const status = String(formData.get("status") ?? "");

  if (status !== "active" && status !== "inactive") redirect(classListPath("error=invalid"));

  if (!CLASS_ID_PATTERN.test(classId)
    || !name
    || name.length > 100
    || classCode.length > 40
    || levelName.length > 80
    || streamName.length > 80
    || curriculumStage.length > 80
    || medium.length > 80
    || (classTeacherId && !CLASS_ID_PATTERN.test(classTeacherId))
    || (capacity !== null && (!Number.isInteger(capacity) || capacity < 1))) {
    redirect(classListPath("error=invalid"));
  }

  const supabase = await createClient();
  const { data: classroom, error: classError } = await supabase.from("education_classes")
    .select("id, branch_id, class_teacher_id")
    .eq("org_id", context.orgId)
    .eq("id", classId)
    .maybeSingle();
  if (classError) {
    console.error("Could not load the Think Education class for editing:", classError.message);
    redirect(classListPath("error=save"));
  }
  if (!classroom) redirect(classListPath("error=class"));

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === classroom.branch_id)) {
    redirect(classListPath("error=campus"));
  }

  if (classTeacherId && classTeacherId !== classroom.class_teacher_id) {
    if (!await canTabPermission("education_staff", "staff", "records", "view")) {
      redirect(classListPath("error=permission"));
    }
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
      redirect(classListPath("error=save"));
    }
    if (!teacher) redirect(classListPath("error=teacher"));
  }

  const { data: updatedClass, error } = await supabase.from("education_classes")
    .update({
      name,
      class_code: classCode || null,
      level_name: levelName || null,
      stream_name: streamName || null,
      curriculum_stage: curriculumStage || null,
      medium: medium || null,
      class_teacher_id: classTeacherId || null,
      capacity,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("org_id", context.orgId)
    .eq("branch_id", classroom.branch_id)
    .eq("id", classId)
    .select("id")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      const duplicateCode = `${error.message} ${error.details ?? ""}`.includes("education_classes_class_code_unique");
      redirect(classListPath(duplicateCode ? "error=duplicate-code" : "error=duplicate"));
    }
    if (error.code === "42501") redirect(classListPath("error=permission"));
    console.error("Could not update Think Education class:", error.message);
    redirect(classListPath("error=save"));
  }
  if (!updatedClass) redirect(classListPath("error=class"));

  revalidatePath("/education/academics");
  revalidatePath("/education/academics/curriculum");
  revalidatePath("/education/timetables");
  revalidatePath("/education/students");
  redirect(classListPath("updated=1"));
}

export async function emailEducationClassesPdf(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_academics", "academics", "classes", "export")) {
    redirect(classListPath("error=permission"));
  }

  const recipient = String(formData.get("recipient") ?? "").trim();
  const rawIds = String(formData.get("class_ids") ?? "");
  let requestedIds: unknown;
  try {
    requestedIds = JSON.parse(rawIds);
  } catch {
    redirect(classListPath("error=selection"));
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    redirect(classListPath("error=email-address"));
  }
  if (!Array.isArray(requestedIds) || requestedIds.length < 1 || requestedIds.length > 2000
    || requestedIds.some((id) => typeof id !== "string" || !CLASS_ID_PATTERN.test(id))) {
    redirect(classListPath("error=selection"));
  }
  const classIds = Array.from(new Set(requestedIds.filter((id): id is string => typeof id === "string")));
  if (classIds.length !== requestedIds.length) redirect(classListPath("error=selection"));
  if (!hasConfiguredMessageProvider("Email")) redirect(classListPath("error=email-provider"));

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const branchIds = campuses.map((campus) => campus.id);
  if (!branchIds.length) redirect(classListPath("error=campus"));
  const supabase = await createClient();
  const { data: classes, error: classesError } = await supabase.from("education_classes")
    .select("id, branch_id, academic_year_id, name, class_code, level_name, stream_name, curriculum_stage, medium, class_teacher_id, capacity, status, created_at")
    .eq("org_id", context.orgId)
    .in("branch_id", branchIds)
    .in("id", classIds)
    .order("name");
  if (classesError) {
    console.error("Could not load classes for the emailed report:", classesError.message);
    redirect(classListPath("error=email-send"));
  }
  if (!classes || classes.length !== classIds.length) redirect(classListPath("error=selection"));

  const yearIds = Array.from(new Set(classes.map((item) => item.academic_year_id)));
  const { data: years, error: yearsError } = await supabase.from("education_academic_years")
    .select("id, name")
    .eq("org_id", context.orgId)
    .in("id", yearIds);
  if (yearsError) {
    console.error("Could not load academic years for the emailed report:", yearsError.message);
    redirect(classListPath("error=email-send"));
  }
  const yearNameById = new Map((years ?? []).map((year) => [year.id, year.name]));
  const canViewStaff = await canTabPermission("education_staff", "staff", "records", "view");
  const staffIds = canViewStaff
    ? Array.from(new Set(classes.map((item) => item.class_teacher_id).filter((id): id is string => Boolean(id))))
    : [];
  const teacherNameById = new Map<string, string>();
  if (staffIds.length) {
    const { data: staff, error: staffError } = await supabase.from("education_staff")
      .select("id, branch_id, first_name, last_name")
      .eq("org_id", context.orgId)
      .in("branch_id", branchIds)
      .in("id", staffIds);
    if (staffError) {
      console.error("Could not load class teachers for the emailed report:", staffError.message);
      redirect(classListPath("error=email-send"));
    }
    for (const teacher of staff ?? []) teacherNameById.set(teacher.id, `${teacher.first_name} ${teacher.last_name}`);
  }

  const canViewTimetables = await canTabPermission("education_timetables", "timetables", "schedule", "view");
  const roomNamesByClass = new Map<string, Set<string>>();
  if (canViewTimetables) {
    for (let offset = 0; offset < classIds.length; offset += 200) {
      const { data: timetableRows, error: timetableError } = await supabase.from("education_timetable_entries")
        .select("class_id, room")
        .eq("org_id", context.orgId)
        .in("branch_id", branchIds)
        .in("class_id", classIds.slice(offset, offset + 200))
        .eq("status", "active");
      if (timetableError) {
        console.error("Could not load class rooms for the emailed report:", timetableError.message);
        redirect(classListPath("error=email-send"));
      }
      for (const entry of timetableRows ?? []) {
        if (!entry.room) continue;
        const rooms = roomNamesByClass.get(entry.class_id) ?? new Set<string>();
        rooms.add(entry.room);
        roomNamesByClass.set(entry.class_id, rooms);
      }
    }
  }

  const enrollmentCountByClass = new Map<string, number>();
  for (let offset = 0; offset < classIds.length; offset += 500) {
    const { data, error } = await supabase.rpc("education_get_class_enrollment_counts", {
      p_org_id: context.orgId,
      p_class_ids: classIds.slice(offset, offset + 500),
    });
    if (error) {
      console.error("Could not load class enrollment counts for the emailed report:", error.message);
      redirect(classListPath("error=email-send"));
    }
    for (const item of data ?? []) enrollmentCountByClass.set(item.class_id, Number(item.active_count));
  }

  const lines = [
    "Think Education - Classes and Sections",
    `Generated: ${new Date().toISOString()}`,
    `Classes: ${classes.length}`,
    "",
    ...classes.flatMap((item) => [
      `${item.name} | ${item.class_code || "No code"} | ${item.status}`,
      `Section: ${item.stream_name || "—"} | Grade: ${item.level_name || "—"} | Year: ${yearNameById.get(item.academic_year_id) || "—"}`,
      `Stage: ${item.curriculum_stage || "—"} | Medium: ${item.medium || "—"}`,
      `Teacher: ${canViewStaff ? teacherNameById.get(item.class_teacher_id ?? "") || "Unassigned" : "Restricted"} | Students: ${enrollmentCountByClass.get(item.id) ?? 0}/${item.capacity ?? "No capacity limit"}`,
      `Campus: ${campuses.find((campus) => campus.id === item.branch_id)?.name ?? "Campus"} | Room: ${canViewTimetables ? Array.from(roomNamesByClass.get(item.id) ?? []).join(", ") || "Unassigned" : "Restricted"}`,
      `Created: ${new Date(item.created_at).toISOString().slice(0, 10)} | ID: ${item.id}`,
      "",
    ]),
  ];
  const attachment = createClassReportPdf(lines);
  if (attachment.byteLength > 35 * 1024 * 1024) redirect(classListPath("error=email-large"));
  const result = await deliverMessage({
    channel: "Email",
    recipient,
    subject: "Think Education - Classes & Sections",
    content: `Attached is the Think Education class report containing ${classes.length} ${classes.length === 1 ? "class" : "classes"}.`,
    attachments: [{
      filename: `think-education-classes-${new Date().toISOString().slice(0, 10)}.pdf`,
      content: attachment.toString("base64"),
    }],
  });
  if (!result.sent) {
    console.error("Could not send Think Education class PDF:", result.reason ?? "Unknown email delivery error.");
    redirect(classListPath("error=email-send"));
  }
  redirect(classListPath("emailed=1"));
}

export async function archiveEducationClass(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_academics", "academics", "classes", "delete")) {
    redirect(classListPath("error=permission"));
  }

  const classId = String(formData.get("class_id") ?? "").trim();
  if (!CLASS_ID_PATTERN.test(classId)) redirect(classListPath("error=invalid"));

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_archive_class", {
    p_org_id: context.orgId,
    p_class_id: classId,
  });
  if (error) {
    if (error.code === "42501") redirect(classListPath("error=permission"));
    if (error.code === "P0002") redirect(classListPath("error=class"));
    if (error.code === "23514") redirect(classListPath("error=class-in-use"));
    console.error("Could not archive Think Education class:", error.message);
    redirect(classListPath("error=save"));
  }

  revalidatePath("/education/academics");
  revalidatePath("/education/academics/curriculum");
  revalidatePath("/education/timetables");
  revalidatePath("/education/students");
  redirect(classListPath("archived=1"));
}
