import {
  GoogleClassroomIntegrationError,
  loadGoogleClassroomCourses,
  mapGoogleClassroomCourse,
  requireGoogleClassroomAccess,
} from "@/lib/education/google-classroom-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { courseId?: unknown; classId?: unknown };
    if (typeof body.courseId !== "string" || body.courseId.length > 200
      || typeof body.classId !== "string" || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(body.classId)) {
      return Response.json({ error: "Select a Google course and existing Education class." }, { status: 400 });
    }
    const access = await requireGoogleClassroomAccess();
    const courses = await loadGoogleClassroomCourses(access);
    if (!courses.some((course) => course.id === body.courseId)) {
      throw new GoogleClassroomIntegrationError("That course is not available in the connected Google Classroom account.", 404);
    }
    await mapGoogleClassroomCourse(access, body.courseId, body.classId);
    return Response.json({ saved: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const known = error instanceof GoogleClassroomIntegrationError;
    return Response.json({
      error: known ? error.message : "Could not save the course mapping.",
    }, { status: known ? error.status : 500 });
  }
}
