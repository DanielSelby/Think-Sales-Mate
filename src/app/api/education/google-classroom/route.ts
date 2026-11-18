import {
  disconnectGoogleClassroom,
  getConnectionStatus,
  GoogleClassroomIntegrationError,
  listGoogleClassroomClasses,
  listGoogleClassroomMappings,
  loadGoogleClassroomCourses,
  requireGoogleClassroomAccess,
} from "@/lib/education/google-classroom-server";

export const runtime = "nodejs";

function jsonError(error: unknown) {
  const known = error instanceof GoogleClassroomIntegrationError;
  return Response.json({
    error: known ? error.message : "Google Classroom integration request failed.",
  }, {
    status: known ? error.status : 500,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET() {
  try {
    const access = await requireGoogleClassroomAccess();
    const connected = await getConnectionStatus(access);
    if (!connected) {
      return Response.json({ connected: false, courses: [], classes: [], mappings: [] }, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    const [courses, classes, mappings] = await Promise.all([
      loadGoogleClassroomCourses(access),
      listGoogleClassroomClasses(access),
      listGoogleClassroomMappings(access),
    ]);
    return Response.json({ connected: true, courses, classes, mappings }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE() {
  try {
    const access = await requireGoogleClassroomAccess();
    await disconnectGoogleClassroom(access);
    return Response.json({ connected: false }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
