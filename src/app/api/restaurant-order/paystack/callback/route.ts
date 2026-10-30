import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRestaurantOnlineBaseUrl } from "@/lib/restaurant/online-ordering";

function redirectToConfirmation(baseUrl: string, token: string) {
  const url = new URL(`/restaurant-order/confirmation/${token}`, baseUrl);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get("reference")?.trim();
  const baseUrl = getRestaurantOnlineBaseUrl();
  if (!baseUrl) return new NextResponse("Restaurant online ordering is not configured.", { status: 503 });
  if (!reference || reference.length > 100) return new NextResponse("Payment reference is invalid.", { status: 400 });

  const admin = createAdminClient();
  const { data: attempt, error: attemptError } = await admin.from("restaurant_online_payment_attempts")
    .select("confirmation_token")
    .eq("reference", reference).maybeSingle();
  if (attemptError) {
    console.error("Could not load Paystack Restaurant attempt:", attemptError.message);
    return new NextResponse("Could not load restaurant payment.", { status: 500 });
  }
  if (!attempt) return new NextResponse("Restaurant payment was not found.", { status: 404 });

  const token = attempt.confirmation_token;
  return redirectToConfirmation(baseUrl, token);
}
