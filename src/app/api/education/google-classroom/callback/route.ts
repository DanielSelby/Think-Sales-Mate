import { NextResponse } from "next/server";
import {
  consumeGoogleOAuthState,
  exchangeGoogleAuthorizationCode,
  GoogleClassroomIntegrationError,
  requireGoogleClassroomAccess,
} from "@/lib/education/google-classroom-server";

export const runtime = "nodejs";

function returnToSettings(request: Request, result: string) {
  const response = NextResponse.redirect(new URL(
    `/education/settings/integrations/google-classroom?${result}`,
    request.url,
  ));
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  try {
    const access = await requireGoogleClassroomAccess();
    if (!await consumeGoogleOAuthState(access, state)) {
      return returnToSettings(request, "error=invalid_state");
    }
    if (url.searchParams.has("error")) {
      return returnToSettings(request, "error=google_access_denied");
    }
    const code = url.searchParams.get("code");
    if (!code || code.length > 4096) return returnToSettings(request, "error=missing_code");
    await exchangeGoogleAuthorizationCode(code, access);
    return returnToSettings(request, "connected=1");
  } catch (error) {
    const message = error instanceof GoogleClassroomIntegrationError
      ? error.message
      : "Google Classroom authorization could not be completed.";
    return returnToSettings(request, `error=${encodeURIComponent(message)}`);
  }
}
