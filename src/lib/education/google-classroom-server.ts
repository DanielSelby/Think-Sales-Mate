import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { canTabPermission } from "@/lib/rbac/permissions";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseGoogleEducationEncryptionKey,
  previewGoogleClassroomRoster,
  type GoogleClassroomRosterEntry,
} from "@/lib/education/google-classroom-helpers";

export const GOOGLE_CLASSROOM_SCOPES = [
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/classroom.rosters.readonly",
  "https://www.googleapis.com/auth/classroom.profile.emails",
] as const;

const GOOGLE_API_ROOT = "https://classroom.googleapis.com/v1";
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const GOOGLE_CLASSROOM_COURSE_LIMIT = 2000;
const GOOGLE_CLASSROOM_ROSTER_LIMIT = 5000;
const STUDENT_MATCH_LIMIT = 100000;
const STUDENT_PAGE_SIZE = 1000;

export class GoogleClassroomIntegrationError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "GoogleClassroomIntegrationError";
  }
}

export type GoogleClassroomAccess = {
  orgId: string;
  userId: string;
  admin: ReturnType<typeof createAdminClient>;
};

export type GoogleClassroomCourse = {
  id: string;
  name: string;
  section: string | null;
  descriptionHeading: string | null;
  courseState: string;
};

export async function requireGoogleClassroomAccess(
  requireEnrollmentEdit = false,
): Promise<GoogleClassroomAccess> {
  const context = await getCurrentOrgContext();
  if (!context) throw new GoogleClassroomIntegrationError("Sign in to manage Google Classroom.", 401);
  const [canEditInstitution, scope, canEditEnrollments] = await Promise.all([
    canTabPermission("education_settings", "settings", "institution", "edit", context.orgId),
    getAccessibleEducationCampuses(context.orgId, context.userId),
    requireEnrollmentEdit
      ? canTabPermission("education_students", "students", "list", "edit", context.orgId)
      : Promise.resolve(true),
  ]);
  if (!canEditInstitution || !scope.hasOrganizationScope) {
    throw new GoogleClassroomIntegrationError(
      "Google Classroom integration requires institution edit access and organization-wide Think Education access.",
      403,
    );
  }
  if (!canEditEnrollments) {
    throw new GoogleClassroomIntegrationError("You do not have permission to edit student enrollments.", 403);
  }
  return { orgId: context.orgId, userId: context.userId, admin: createAdminClient() };
}

export function getGoogleOAuthConfiguration() {
  const clientId = process.env.GOOGLE_EDUCATION_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_EDUCATION_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_EDUCATION_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new GoogleClassroomIntegrationError(
      "Google Classroom is not configured. Set GOOGLE_EDUCATION_CLIENT_ID, GOOGLE_EDUCATION_CLIENT_SECRET, and GOOGLE_EDUCATION_REDIRECT_URI.",
      503,
    );
  }
  let redirect: URL;
  try {
    redirect = new URL(redirectUri);
  } catch {
    throw new GoogleClassroomIntegrationError("GOOGLE_EDUCATION_REDIRECT_URI must be an absolute URL.", 503);
  }
  if ((redirect.protocol !== "https:"
    && !(redirect.protocol === "http:" && redirect.hostname === "localhost"))
    || redirect.username || redirect.password || redirect.hash) {
    throw new GoogleClassroomIntegrationError("Google Classroom callback URL must use HTTPS.", 503);
  }
  return { clientId, clientSecret, redirectUri: redirect.toString() };
}

function encryptRefreshToken(refreshToken: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", parseGoogleEducationEncryptionKey(
    process.env.GOOGLE_EDUCATION_TOKEN_ENCRYPTION_KEY,
  ), iv);
  const ciphertext = Buffer.concat([cipher.update(refreshToken, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64")).join(":");
}

function decryptRefreshToken(encrypted: string): string {
  const [ivBase64, tagBase64, ciphertextBase64, ...extra] = encrypted.split(":");
  if (!ivBase64 || !tagBase64 || !ciphertextBase64 || extra.length) {
    throw new GoogleClassroomIntegrationError("The saved Google Classroom credential is unreadable. Reconnect Google Classroom.", 409);
  }
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      parseGoogleEducationEncryptionKey(process.env.GOOGLE_EDUCATION_TOKEN_ENCRYPTION_KEY),
      Buffer.from(ivBase64, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tagBase64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextBase64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new GoogleClassroomIntegrationError("The saved Google Classroom credential could not be decrypted. Check GOOGLE_EDUCATION_TOKEN_ENCRYPTION_KEY or reconnect.", 409);
  }
}

export async function createGoogleOAuthStartUrl(access: GoogleClassroomAccess): Promise<string> {
  const configuration = getGoogleOAuthConfiguration();
  const state = randomBytes(32).toString("hex");
  const stateHash = createHash("sha256").update(state).digest("hex");
  const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString();
  const { error } = await access.admin.rpc("education_google_classroom_create_oauth_state", {
    p_org_id: access.orgId,
    p_actor_id: access.userId,
    p_state_hash: stateHash,
    p_expires_at: expiresAt,
  });
  if (error) throw new GoogleClassroomIntegrationError("Could not start Google Classroom authorization. Please try again.", 500);

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", configuration.clientId);
  url.searchParams.set("redirect_uri", configuration.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_CLASSROOM_SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "false");
  return url.toString();
}

export async function consumeGoogleOAuthState(
  access: GoogleClassroomAccess,
  state: string,
): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(state)) return false;
  const stateHash = createHash("sha256").update(state).digest("hex");
  const { data, error } = await access.admin.rpc("education_google_classroom_consume_oauth_state", {
    p_org_id: access.orgId,
    p_actor_id: access.userId,
    p_state_hash: stateHash,
  });
  if (error) throw new GoogleClassroomIntegrationError("Could not validate Google Classroom authorization. Restart the connection.", 500);
  return data === true;
}

export async function exchangeGoogleAuthorizationCode(code: string, access: GoogleClassroomAccess): Promise<void> {
  const configuration = getGoogleOAuthConfiguration();
  let response: Response;
  try {
    response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: configuration.clientId,
        client_secret: configuration.clientSecret,
        redirect_uri: configuration.redirectUri,
        grant_type: "authorization_code",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new GoogleClassroomIntegrationError("Google authorization could not be reached. Please try again.", 502);
  }
  const tokens = await response.json().catch(() => null) as {
    refresh_token?: unknown;
    scope?: unknown;
  } | null;
  if (!response.ok || typeof tokens?.refresh_token !== "string" || typeof tokens.scope !== "string") {
    throw new GoogleClassroomIntegrationError(
      "Google did not return a refresh token. Retry the connection and approve the requested read-only Classroom access.",
      400,
    );
  }
  const grantedScopes = tokens.scope.split(/\s+/).filter(Boolean);
  if (!GOOGLE_CLASSROOM_SCOPES.every((scope) => grantedScopes.includes(scope))) {
    throw new GoogleClassroomIntegrationError("Google did not grant every required read-only Classroom scope.", 403);
  }
  const ciphertext = encryptRefreshToken(tokens.refresh_token);
  const { error } = await access.admin.rpc("education_google_classroom_store_connection", {
    p_org_id: access.orgId,
    p_actor_id: access.userId,
    p_refresh_token_ciphertext: ciphertext,
    p_granted_scopes: grantedScopes,
  });
  if (error) throw new GoogleClassroomIntegrationError("Could not save the encrypted Google Classroom connection.", 500);
}

async function getRefreshToken(access: GoogleClassroomAccess): Promise<string> {
  const { data, error } = await access.admin.rpc("education_google_classroom_get_connection", {
    p_org_id: access.orgId,
    p_actor_id: access.userId,
  });
  if (error) throw new GoogleClassroomIntegrationError("Could not load Google Classroom connection status.", 500);
  const connection = data?.[0];
  if (!connection) throw new GoogleClassroomIntegrationError("Connect a Google Classroom account before reading courses or rosters.", 409);
  if (!GOOGLE_CLASSROOM_SCOPES.every((scope) => connection.granted_scopes.includes(scope))) {
    throw new GoogleClassroomIntegrationError("The saved Google Classroom connection is missing read-only scopes. Reconnect it.", 409);
  }
  return decryptRefreshToken(connection.refresh_token_ciphertext);
}

async function getGoogleAccessToken(access: GoogleClassroomAccess): Promise<string> {
  const configuration = getGoogleOAuthConfiguration();
  const refreshToken = await getRefreshToken(access);
  let response: Response;
  try {
    response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: configuration.clientId,
        client_secret: configuration.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new GoogleClassroomIntegrationError("Google authorization could not be reached. Please try again.", 502);
  }
  const payload = await response.json().catch(() => null) as { access_token?: unknown } | null;
  if (!response.ok || typeof payload?.access_token !== "string") {
    throw new GoogleClassroomIntegrationError("Google authorization expired or was revoked. Reconnect Google Classroom.", 401);
  }
  return payload.access_token;
}

async function googleApiGet<T>(access: GoogleClassroomAccess, path: string, parameters: URLSearchParams): Promise<T> {
  const accessToken = await getGoogleAccessToken(access);
  let response: Response;
  try {
    response = await fetch(`${GOOGLE_API_ROOT}/${path}?${parameters.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new GoogleClassroomIntegrationError("Google Classroom could not be reached. Please try again.", 502);
  }
  const payload = await response.json().catch(() => null) as { error?: { message?: unknown } } | null;
  if (!response.ok) {
    const status = response.status === 401 || response.status === 403 ? 403 : 502;
    throw new GoogleClassroomIntegrationError(
      status === 403
        ? "Google denied this read-only Classroom request. Reconnect and verify the requested scopes."
        : "Google Classroom could not load the requested data. Please try again.",
      status,
    );
  }
  return payload as T;
}

export async function loadGoogleClassroomCourses(access: GoogleClassroomAccess): Promise<GoogleClassroomCourse[]> {
  const courses: GoogleClassroomCourse[] = [];
  let pageToken: string | undefined;
  do {
    const parameters = new URLSearchParams({ courseStates: "ACTIVE", pageSize: "100" });
    if (pageToken) parameters.set("pageToken", pageToken);
    const page = await googleApiGet<{
      courses?: Array<{
        id?: string;
        name?: string;
        section?: string;
        descriptionHeading?: string;
        courseState?: string;
      }>;
      nextPageToken?: string;
    }>(access, "courses", parameters);
    for (const course of page.courses ?? []) {
      if (course.id && course.name) {
        courses.push({
          id: course.id,
          name: course.name,
          section: course.section ?? null,
          descriptionHeading: course.descriptionHeading ?? null,
          courseState: course.courseState ?? "ACTIVE",
        });
      }
    }
    pageToken = page.nextPageToken;
  } while (pageToken && courses.length < GOOGLE_CLASSROOM_COURSE_LIMIT);
  if (pageToken) {
    throw new GoogleClassroomIntegrationError("The Google Classroom course list exceeds the 2,000-course limit.", 413);
  }
  const { error: auditError } = await access.admin.rpc("education_google_classroom_audit", {
    p_org_id: access.orgId,
    p_actor_id: access.userId,
    p_action: "courses_listed",
    p_metadata: { course_count: courses.length },
  });
  if (auditError) throw new GoogleClassroomIntegrationError("Could not record the Google Classroom course list.", 500);
  return courses;
}

export async function loadGoogleClassroomRoster(
  access: GoogleClassroomAccess,
  courseId: string,
): Promise<GoogleClassroomRosterEntry[]> {
  if (!courseId || courseId.length > 200) throw new GoogleClassroomIntegrationError("Invalid Google Classroom course.", 400);
  const roster: GoogleClassroomRosterEntry[] = [];
  let pageToken: string | undefined;
  do {
    const parameters = new URLSearchParams({
      pageSize: "100",
      fields: "nextPageToken,students(userId,profile(name(fullName),emailAddress))",
    });
    if (pageToken) parameters.set("pageToken", pageToken);
    const page = await googleApiGet<{
      students?: Array<{
        userId?: string;
        profile?: { name?: { fullName?: string }; emailAddress?: string };
      }>;
      nextPageToken?: string;
    }>(access, `courses/${encodeURIComponent(courseId)}/students`, parameters);
    for (const student of page.students ?? []) {
      if (!student.userId) continue;
      roster.push({
        userId: student.userId,
        fullName: student.profile?.name?.fullName ?? "Google Classroom student",
        ...(student.profile?.emailAddress ? { emailAddress: student.profile.emailAddress } : {}),
      });
    }
    pageToken = page.nextPageToken;
  } while (pageToken && roster.length < GOOGLE_CLASSROOM_ROSTER_LIMIT);
  if (pageToken) {
    throw new GoogleClassroomIntegrationError("The Google Classroom roster exceeds the 5,000-student limit.", 413);
  }
  return roster;
}

export async function getConnectionStatus(access: GoogleClassroomAccess) {
  const { data, error } = await access.admin.rpc("education_google_classroom_get_connection", {
    p_org_id: access.orgId,
    p_actor_id: access.userId,
  });
  if (error) throw new GoogleClassroomIntegrationError("Could not load Google Classroom connection status.", 500);
  return Boolean(data?.length);
}

export async function disconnectGoogleClassroom(access: GoogleClassroomAccess): Promise<void> {
  const { error } = await access.admin.rpc("education_google_classroom_disconnect", {
    p_org_id: access.orgId,
    p_actor_id: access.userId,
  });
  if (error) throw new GoogleClassroomIntegrationError("Could not disconnect Google Classroom. Please try again.", 500);
}

export async function mapGoogleClassroomCourse(
  access: GoogleClassroomAccess,
  courseId: string,
  classId: string,
): Promise<void> {
  const { error } = await access.admin.rpc("education_google_classroom_map_course", {
    p_org_id: access.orgId,
    p_actor_id: access.userId,
    p_google_course_id: courseId,
    p_class_id: classId,
  });
  if (error) throw new GoogleClassroomIntegrationError("Could not save the course mapping. Select an active Education class and try again.", 400);
}

export async function createRosterPreview(
  access: GoogleClassroomAccess,
  courseId: string,
) {
  const { data: mapping, error: mappingError } = await access.admin.from("education_google_classroom_mappings")
    .select("class_id, branch_id, academic_year_id")
    .eq("org_id", access.orgId).eq("google_course_id", courseId).maybeSingle();
  if (mappingError) throw new GoogleClassroomIntegrationError("Could not load the Education class mapping.", 500);
  if (!mapping) throw new GoogleClassroomIntegrationError("Map this Google course to an Education class first.", 409);
  const roster = await loadGoogleClassroomRoster(access, courseId);
  const { data: firstStudentPage, count: studentCount, error: studentsError } = await access.admin.from("education_students")
    .select("id, email, first_name, last_name, student_number, status", { count: "exact" })
    .eq("org_id", access.orgId)
    .eq("branch_id", mapping.branch_id)
    .eq("status", "active")
    .not("email", "is", null)
    .range(0, STUDENT_PAGE_SIZE - 1);
  if (studentsError) throw new GoogleClassroomIntegrationError("Could not load active students for this class campus.", 500);
  if (studentCount === null) throw new GoogleClassroomIntegrationError("Could not count active students for this class campus.", 500);
  if (studentCount > STUDENT_MATCH_LIMIT) {
    throw new GoogleClassroomIntegrationError("This campus has too many active students to safely match in one roster import.", 413);
  }
  const students = [...(firstStudentPage ?? [])];
  for (let offset = STUDENT_PAGE_SIZE; offset < studentCount; offset += STUDENT_PAGE_SIZE) {
    const { data: studentPage, error: studentPageError } = await access.admin.from("education_students")
      .select("id, email, first_name, last_name, student_number, status")
      .eq("org_id", access.orgId)
      .eq("branch_id", mapping.branch_id)
      .eq("status", "active")
      .not("email", "is", null)
      .range(offset, Math.min(offset + STUDENT_PAGE_SIZE - 1, studentCount - 1));
    if (studentPageError) throw new GoogleClassroomIntegrationError("Could not load active students for this class campus.", 500);
    students.push(...(studentPage ?? []));
  }
  const preview = previewGoogleClassroomRoster(roster, students ?? []);
  const { error: auditError } = await access.admin.rpc("education_google_classroom_audit_preview", {
    p_org_id: access.orgId,
    p_actor_id: access.userId,
    p_google_course_id: courseId,
    p_roster_size: roster.length,
  });
  if (auditError) throw new GoogleClassroomIntegrationError("Could not record the roster preview.", 500);
  return { preview, roster };
}

export async function importGoogleClassroomRoster(
  access: GoogleClassroomAccess,
  courseId: string,
  emails: string[],
) {
  const { data, error } = await access.admin.rpc("education_google_classroom_import_roster", {
    p_org_id: access.orgId,
    p_actor_id: access.userId,
    p_google_course_id: courseId,
    p_student_emails: emails,
  });
  if (error) throw new GoogleClassroomIntegrationError("Could not import the unambiguous roster matches. Please preview again and retry.", 400);
  return data;
}

export async function listGoogleClassroomClasses(access: GoogleClassroomAccess) {
  const { data: classes, error: classesError } = await access.admin.from("education_classes")
    .select("id, branch_id, academic_year_id, name, level_name, stream_name")
    .eq("org_id", access.orgId).eq("status", "active").order("name");
  if (classesError) throw new GoogleClassroomIntegrationError("Could not load active Education classes.", 500);
  if (!classes?.length) return [];
  const [campusesResult, yearsResult] = await Promise.all([
    access.admin.from("education_campuses").select("branch_id")
      .eq("org_id", access.orgId).eq("status", "active"),
    access.admin.from("education_academic_years").select("id, name")
      .eq("org_id", access.orgId).eq("status", "active"),
  ]);
  if (campusesResult.error || yearsResult.error) {
    throw new GoogleClassroomIntegrationError("Could not load active Education campuses and academic years.", 500);
  }
  const activeCampuses = new Set((campusesResult.data ?? []).map((campus) => campus.branch_id));
  const activeYears = new Map((yearsResult.data ?? []).map((year) => [year.id, year.name]));
  return classes.flatMap((classroom) => {
    const academicYearName = activeYears.get(classroom.academic_year_id);
    if (!activeCampuses.has(classroom.branch_id) || !academicYearName) return [];
    return [{ ...classroom, academic_year_name: academicYearName }];
  });
}

export async function listGoogleClassroomMappings(access: GoogleClassroomAccess) {
  const { data, error } = await access.admin.from("education_google_classroom_mappings")
    .select("google_course_id, class_id, branch_id, academic_year_id")
    .eq("org_id", access.orgId);
  if (error) throw new GoogleClassroomIntegrationError("Could not load Google Classroom course mappings.", 500);
  return data ?? [];
}

