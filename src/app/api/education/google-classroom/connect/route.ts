import { NextResponse } from "next/server";
import {
  createGoogleOAuthStartUrl,
  GoogleClassroomIntegrationError,
  requireGoogleClassroomAccess,
} from "@/lib/education/google-classroom-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const access = await requireGoogleClassroomAccess();
    return NextResponse.redirect(await createGoogleOAuthStartUrl(access));
  } catch (error) {
    const message = error instanceof GoogleClassroomIntegrationError
      ? error.message
      : "Could not start Google Classroom authorization.";
    return NextResponse.redirect(new URL(
      `/education/settings/integrations/google-classroom?error=${encodeURIComponent(message)}`,
      request.url,
    ));
  }
}
