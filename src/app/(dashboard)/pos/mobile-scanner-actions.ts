"use server";

import { createHash, randomBytes } from "node:crypto";
import { canUseLocation } from "@/lib/organizations/location-access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { requirePermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEnabledOrganizationModules } from "@/lib/supabase/platform-admin";

const SCANNER_FEATURE = "POS:Mobile Scanner";
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

type ScannerResult<T> = { ok: true; data: T } | { ok: false; error: string };
type ScannerSessionRow = {
  id: string;
  org_id: string;
  location_id: string;
  created_by: string;
  source_module: "pos" | "sales";
  expires_at: string | null;
  revoked_at: string | null;
};

async function checkScannerAccess(orgId: string) {
  const enabledFeatures = await getEnabledOrganizationModules(orgId);
  return enabledFeatures.includes(SCANNER_FEATURE);
}

async function requireScannerPermission(sourceModule: "pos" | "sales") {
  await requirePermission(sourceModule, sourceModule === "pos" ? "view" : "create");
}

async function getOwnedSession(sessionId: string) {
  const context = await getCurrentOrgContext();
  if (!context) throw new Error("Sign in to SalesMate before connecting the phone scanner.");

  const admin = createAdminClient() as any;
  const { data: session, error } = await admin.from("pos_mobile_scanner_sessions")
    .select("id, org_id, location_id, created_by, source_module, expires_at, revoked_at")
    .eq("id", sessionId)
    .eq("org_id", context.orgId)
    .eq("created_by", context.userId)
    .maybeSingle();
  if (error) throw new Error(`Could not verify the paired scanner: ${error.message}`);
  if (!session) throw new Error("This scanner session does not belong to your active organization or user.");
  await requireScannerPermission(session.source_module);
  const allowed = await checkScannerAccess(context.orgId);
  if (!allowed) throw new Error("Phone barcode scanning is not enabled for this organization.");
  if (session.revoked_at) throw new Error("This scanner session has been disconnected.");
  if (session.expires_at && Date.parse(session.expires_at) <= Date.now()) throw new Error("This scanner session has expired. Pair the phone again.");

  const registerResult = session.source_module === "pos"
    ? await (await createClient()).from("pos_register_sessions")
      .select("id")
      .eq("org_id", context.orgId)
      .eq("location_id", session.location_id)
      .eq("cashier_id", context.userId)
      .eq("status", "open")
      .maybeSingle()
    : { data: { id: "sales" }, error: null };
  const { data: register, error: registerError } = registerResult;
  if (registerError) throw new Error(`Could not verify the open POS register: ${registerError.message}`);
  if ((session.source_module === "pos" && !register) || !canUseLocation(context, session.location_id)) {
    throw new Error("The paired branch is no longer available to you.");
  }

  return { context, session: session as ScannerSessionRow, admin };
}

async function findSessionForToken(token: string) {
  const normalized = token.trim();
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(normalized)) throw new Error("The scanner link is invalid.");
  const context = await getCurrentOrgContext();
  if (!context) throw new Error("Sign in to SalesMate on this phone, then open the pairing link again.");

  const admin = createAdminClient() as any;
  const { data: session, error } = await admin.from("pos_mobile_scanner_sessions")
    .select("id, org_id, location_id, created_by, source_module, expires_at, revoked_at")
    .eq("token_hash", hashToken(normalized))
    .eq("org_id", context.orgId)
    .eq("created_by", context.userId)
    .maybeSingle();
  if (error) throw new Error(`Could not verify the scanner link: ${error.message}`);
  if (!session) throw new Error("This scanner link is invalid or belongs to another signed-in user or organization.");
  await requireScannerPermission(session.source_module);
  if (!await checkScannerAccess(context.orgId)) {
    throw new Error("Phone barcode scanning is not enabled for this organization.");
  }
  if (session.revoked_at) throw new Error("This scanner session has been disconnected from the desktop.");
  if (session.expires_at && Date.parse(session.expires_at) <= Date.now()) throw new Error("This scanner link has expired. Create a new pairing from Sales or POS.");

  const [{ data: location, error: locationError }, { data: register, error: registerError }] = await Promise.all([
    admin.from("business_locations").select("name").eq("id", session.location_id).eq("org_id", context.orgId).maybeSingle(),
    session.source_module === "pos"
      ? admin.from("pos_register_sessions").select("id")
        .eq("org_id", context.orgId)
        .eq("location_id", session.location_id)
        .eq("cashier_id", context.userId)
        .eq("status", "open")
        .maybeSingle()
      : Promise.resolve({ data: { id: "sales" }, error: null }),
  ]);
  if (locationError) throw new Error(`Could not load the paired branch: ${locationError.message}`);
  if (registerError) throw new Error(`Could not verify the POS register: ${registerError.message}`);
  if (!location || (session.source_module === "pos" && !register) || !canUseLocation(context, session.location_id)) {
    throw new Error("The paired branch no longer has an open register available to you.");
  }

  return { session: session as ScannerSessionRow, locationName: location.name };
}

export async function createMobileScannerSession(locationId: string, sourceModule: "pos" | "sales" = "pos"): Promise<ScannerResult<{
  sessionId: string;
  token: string;
}>> {
  try {
    await requireScannerPermission(sourceModule);
    const context = await getCurrentOrgContext();
    if (!context) throw new Error("Your sign-in has expired.");
    if (!locationId || !canUseLocation(context, locationId)) throw new Error("Select a branch you are allowed to use.");
    if (!await checkScannerAccess(context.orgId)) throw new Error("Phone barcode scanning is not enabled for this organization.");

    const supabase = await createClient();
    if (sourceModule === "pos") {
      const { data: register, error: registerError } = await supabase.from("pos_register_sessions")
        .select("id")
        .eq("org_id", context.orgId)
        .eq("location_id", locationId)
        .eq("cashier_id", context.userId)
        .eq("status", "open")
        .maybeSingle();
      if (registerError) throw new Error(`Could not verify the open POS register: ${registerError.message}`);
      if (!register) throw new Error("Open a POS register for this branch before connecting a phone scanner.");
    }

    const token = randomBytes(32).toString("base64url");
    const admin = createAdminClient() as any;
    const { data, error } = await admin.from("pos_mobile_scanner_sessions")
      .insert({
        org_id: context.orgId,
        location_id: locationId,
        created_by: context.userId,
        source_module: sourceModule,
        token_hash: hashToken(token),
        expires_at: null,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Could not create the phone scanner session: ${error.message}`);
    return { ok: true, data: { sessionId: data.id, token } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not connect the phone scanner." };
  }
}

export async function getMobileScannerSession(token: string): Promise<ScannerResult<{
  locationName: string;
}>> {
  try {
    const { session, locationName } = await findSessionForToken(token);
    return { ok: true, data: { locationName } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not verify the scanner link." };
  }
}

export async function submitMobileBarcode(token: string, barcode: string): Promise<ScannerResult<null>> {
  try {
    const value = barcode.trim();
    if (!value || value.length > 128 || /[\u0000-\u001f\u007f]/.test(value)) {
      throw new Error("The scanned barcode is empty or invalid.");
    }
    const { session } = await findSessionForToken(token);
    const admin = createAdminClient() as any;
    const { error } = await admin.from("pos_mobile_barcode_scans").insert({
      session_id: session.id,
      barcode: value,
    });
    if (error) throw new Error(`Could not send the scanned barcode to the desktop sale: ${error.message}`);
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not send this scan to the desktop sale." };
  }
}

export async function pollMobileScannerScans(
  sessionId: string,
  afterSequence: number,
): Promise<ScannerResult<Array<{ sequenceId: number; barcode: string }>>> {
  try {
    if (!Number.isSafeInteger(afterSequence) || afterSequence < 0) throw new Error("The scanner cursor is invalid.");
    const { session, admin } = await getOwnedSession(sessionId);
    const { data, error } = await admin.from("pos_mobile_barcode_scans")
      .select("sequence_id, barcode")
      .eq("session_id", session.id)
      .gt("sequence_id", afterSequence)
      .order("sequence_id", { ascending: true })
      .limit(50);
    if (error) throw new Error(`Could not receive phone scans: ${error.message}`);
    return {
      ok: true,
      data: (data ?? []).map((scan: { sequence_id: number; barcode: string }) => ({
        sequenceId: Number(scan.sequence_id),
        barcode: scan.barcode,
      })),
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not receive phone scans." };
  }
}

export async function disconnectMobileScannerSession(sessionId: string): Promise<ScannerResult<null>> {
  try {
    const context = await getCurrentOrgContext();
    if (!context) throw new Error("Your sign-in has expired.");
    const admin = createAdminClient() as any;
    const { error } = await admin.from("pos_mobile_scanner_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", sessionId)
      .eq("org_id", context.orgId)
      .eq("created_by", context.userId)
      .is("revoked_at", null);
    if (error) throw new Error(`Could not disconnect the phone scanner: ${error.message}`);
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not disconnect the phone scanner." };
  }
}
