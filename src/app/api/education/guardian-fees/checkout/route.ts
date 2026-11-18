import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { feeAmountToMinorUnits, parsePaystackCheckoutUrl } from "../paystack/validation";

const ChargeIdSchema = z.string().uuid();
const AttemptSchema = z.object({
  id: z.string().uuid(),
  reference: z.string().regex(/^EDU-[A-F0-9]{32}$/),
  status: z.string(),
  amount: z.number().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  payer_email: z.string().email(),
  expires_at: z.string(),
  authorization_url: z.string().nullable(),
});
const InitializationClaimSchema = z.object({
  status: z.string(),
  should_initialize: z.boolean(),
  authorization_url: z.string().optional(),
});

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

function hasTrustedOrigin(request: NextRequest, siteUrl: URL): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const originUrl = new URL(origin);
    return originUrl.origin === request.nextUrl.origin || originUrl.origin === siteUrl.origin;
  } catch {
    return false;
  }
}

async function releaseInitialization(reference: string) {
  try {
    const admin = createAdminClient();
    const { error } = await admin.rpc("education_guardian_paystack_release_initialization", { p_reference: reference });
    if (error) console.error("Could not release guardian Paystack initialization:", error.message);
  } catch (error) {
    console.error("Could not release guardian Paystack initialization:", error instanceof Error ? error.message : "unknown error");
  }
}

export async function POST(request: NextRequest) {
  const siteUrl = getSiteUrl();
  if (!siteUrl) return new NextResponse("Guardian checkout is not configured.", { status: 503 });
  if (!hasTrustedOrigin(request, siteUrl)) return new NextResponse("Request origin is not allowed.", { status: 403 });
  if (!process.env.PAYSTACK_SECRET_KEY) return new NextResponse("Paystack is not configured.", { status: 503 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 4096) return new NextResponse("Checkout request is too large.", { status: 413 });

  let chargeId: string;
  try {
    const formData = await request.formData();
    const parsedChargeId = ChargeIdSchema.safeParse(formData.get("charge_id"));
    if (!parsedChargeId.success) return new NextResponse("Fee charge is invalid.", { status: 400 });
    chargeId = parsedChargeId.data;
  } catch {
    return new NextResponse("Checkout request is invalid.", { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return new NextResponse("Sign in to pay this fee.", { status: 401 });
  if (!user.email || !user.email_confirmed_at) {
    return new NextResponse("Verify your email address before paying a fee.", { status: 403 });
  }

  const admin = createAdminClient();
  const { data: attemptData, error: attemptError } = await admin.rpc(
    "education_guardian_paystack_create_attempt",
    { p_user_id: user.id, p_charge_id: chargeId }
  );
  if (attemptError) {
    console.error("Could not reserve guardian fee checkout:", attemptError.message);
    return new NextResponse("The fee could not be reserved for payment.", { status: 409 });
  }
  const parsedAttempt = AttemptSchema.safeParse(attemptData);
  if (!parsedAttempt.success) {
    console.error("Guardian fee attempt returned invalid data:", parsedAttempt.error.flatten());
    return new NextResponse("The fee checkout could not be prepared.", { status: 500 });
  }
  const attempt = parsedAttempt.data;
  if (attempt.payer_email.toLowerCase() !== user.email.toLowerCase()) {
    return new NextResponse("The verified guardian email no longer matches the checkout.", { status: 403 });
  }
  const amountMinor = feeAmountToMinorUnits(attempt.amount);
  if (amountMinor === null) return new NextResponse("The fee amount is invalid for online payment.", { status: 409 });

  const { data: claimData, error: claimError } = await admin.rpc(
    "education_guardian_paystack_claim_initialization",
    { p_reference: attempt.reference }
  );
  if (claimError) {
    console.error("Could not claim guardian Paystack initialization:", claimError.message);
    return new NextResponse("The fee checkout is temporarily unavailable.", { status: 503 });
  }
  const parsedClaim = InitializationClaimSchema.safeParse(claimData);
  if (!parsedClaim.success) return new NextResponse("The fee checkout could not be prepared.", { status: 500 });
  const claim = parsedClaim.data;

  if (!claim.should_initialize) {
    const checkoutUrl = parsePaystackCheckoutUrl(claim.authorization_url ?? attempt.authorization_url);
    if (checkoutUrl) return NextResponse.redirect(checkoutUrl, 303);
    if (claim.status === "expired") return new NextResponse("This checkout expired. Refresh the portal and try again.", { status: 409 });
    return new NextResponse("Checkout is being prepared. Please wait a moment and try again.", { status: 409 });
  }

  let checkoutUrl: URL | null = null;
  try {
    const callbackUrl = new URL("/api/education/guardian-fees/paystack/callback", siteUrl);
    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: attempt.payer_email,
        amount: amountMinor,
        currency: attempt.currency,
        reference: attempt.reference,
        callback_url: callbackUrl.toString(),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json() as {
      status?: unknown;
      message?: unknown;
      data?: { authorization_url?: unknown; reference?: unknown };
    };
    checkoutUrl = result.status === true && result.data?.reference === attempt.reference
      ? parsePaystackCheckoutUrl(result.data.authorization_url)
      : null;
    if (!response.ok || !checkoutUrl) {
      await releaseInitialization(attempt.reference);
      console.error("Paystack did not return a valid guardian checkout:", typeof result.message === "string" ? result.message : "invalid response");
      return new NextResponse("Paystack could not initialize this fee checkout.", { status: 502 });
    }
  } catch (error) {
    await releaseInitialization(attempt.reference);
    console.error("Could not initialize guardian Paystack checkout:", error instanceof Error ? error.message : "unknown provider error");
    return new NextResponse("Paystack could not initialize this fee checkout.", { status: 502 });
  }

  const { data: saved, error: saveError } = await admin.rpc(
    "education_guardian_paystack_save_checkout",
    { p_reference: attempt.reference, p_authorization_url: checkoutUrl.toString() }
  );
  if (saveError || saved !== true) {
    console.error("Could not save guardian Paystack checkout:", saveError?.message ?? "attempt expired");
    return new NextResponse("This checkout expired before it could be opened.", { status: 409 });
  }
  return NextResponse.redirect(checkoutUrl, 303);
}
