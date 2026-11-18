import {
  createRosterPreview,
  GoogleClassroomIntegrationError,
  importGoogleClassroomRoster,
  requireGoogleClassroomAccess,
} from "@/lib/education/google-classroom-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { courseId?: unknown };
    if (typeof body.courseId !== "string" || body.courseId.length < 1 || body.courseId.length > 200) {
      return Response.json({ error: "Select a Google Classroom course." }, { status: 400 });
    }
    const access = await requireGoogleClassroomAccess(true);
    const { preview } = await createRosterPreview(access, body.courseId);
    const result = await importGoogleClassroomRoster(
      access,
      body.courseId,
      preview.matched.map((student) => student.email),
    );
    return Response.json({ result, preview }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const known = error instanceof GoogleClassroomIntegrationError;
    return Response.json({
      error: known ? error.message : "Could not import the eligible Google Classroom enrollments.",
    }, { status: known ? error.status : 500 });
  }
}
