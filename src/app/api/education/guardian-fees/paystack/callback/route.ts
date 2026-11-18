import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { settleGuardianPaystackReference } from "../settlement";

const REFERENCE_PATTERN = /^EDU-[A-F0-9]{32}$/;

function getSiteUrl(): URL | null {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (!configuredUrl) return null;
  try {
    const url = new URL(configuredUrl);
    if ((url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.hostname === "localhost" && url.protocol === "http:"))
      || url.username || url.password) return null;
    return new URL("/", url);
  } catch {
    return null;
  }
}

function portalRedirect(siteUrl: URL, payment: string) {
  const url = new URL("/education-portal", siteUrl);
  url.searchParams.set("payment", payment);
  return NextResponse.redirect(url, 303);
}

export async function GET(request: NextRequest) {
  const siteUrl = getSiteUrl();
  if (!siteUrl) return new NextResponse("Guardian checkout is not configured.", { status: 503 });
  const reference = request.nextUrl.searchParams.get("reference")?.trim() ?? "";
  if (!REFERENCE_PATTERN.test(reference)) return portalRedirect(siteUrl, "invalid");
  if (!process.env.PAYSTACK_SECRET_KEY) return portalRedirect(siteUrl, "pending");

  const admin = createAdminClient();
  try {
    const result = await settleGuardianPaystackReference(admin, reference);
    return portalRedirect(siteUrl, result === "unknown" ? "invalid" : result);
  } catch (error) {
    console.error("Could not verify guardian Paystack callback:", error instanceof Error ? error.message : "unknown verification error");
    return portalRedirect(siteUrl, "pending");
  }
}
