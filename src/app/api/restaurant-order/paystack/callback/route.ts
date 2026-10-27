import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRestaurantOnlineBaseUrl } from "@/lib/restaurant/online-ordering";
import { verifyPaystackTransaction } from "@/lib/restaurant/paystack";

function redirectToConfirmation(baseUrl: string, token: string, state: string) {
  const url = new URL(`/restaurant-order/confirmation/${token}`, baseUrl);
  url.searchParams.set("payment", state);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get("reference")?.trim();
  const baseUrl = getRestaurantOnlineBaseUrl();
  if (!baseUrl) return new NextResponse("Restaurant online ordering is not configured.", { status: 503 });
  if (!reference || reference.length > 100) return new NextResponse("Payment reference is invalid.", { status: 400 });

  const admin = createAdminClient();
  const { data: attempt, error: attemptError } = await admin.from("restaurant_online_payment_attempts")
    .select("confirmation_token, amount_minor, currency, status")
    .eq("reference", reference).maybeSingle();
  if (attemptError) {
    console.error("Could not load Paystack Restaurant attempt:", attemptError.message);
    return new NextResponse("Could not load restaurant payment.", { status: 500 });
  }
  if (!attempt) return new NextResponse("Restaurant payment was not found.", { status: 404 });

  const token = attempt.confirmation_token;
  if (attempt.status === "successful") return redirectToConfirmation(baseUrl, token, "success");

  let transaction;
  try {
    transaction = await verifyPaystackTransaction(reference);
  } catch (error) {
    console.error("Could not verify Paystack Restaurant transaction:", error instanceof Error ? error.message : "unknown provider error");
    return new NextResponse("Could not verify restaurant payment. Please contact the restaurant.", { status: 502 });
  }
  if (transaction.status !== "success") {
    const { error } = await admin.rpc("cancel_restaurant_online_payment_attempt", { p_reference: reference });
    if (error) {
      console.error("Could not cancel failed Paystack Restaurant attempt:", error.message);
      return new NextResponse("Could not update restaurant payment status.", { status: 500 });
    }
    return redirectToConfirmation(baseUrl, token, "failed");
  }
  if (transaction.amount !== attempt.amount_minor || transaction.currency !== attempt.currency) {
    return redirectToConfirmation(baseUrl, token, "review");
  }

  const { error: recordError } = await admin.rpc("record_restaurant_online_payment", {
    p_reference: reference,
    p_amount_minor: transaction.amount,
    p_currency: transaction.currency,
  });
  if (recordError) {
    console.error("Could not record verified Paystack Restaurant payment:", recordError.message);
    return new NextResponse("Could not record restaurant payment.", { status: 500 });
  }
  return redirectToConfirmation(baseUrl, token, "success");
}
