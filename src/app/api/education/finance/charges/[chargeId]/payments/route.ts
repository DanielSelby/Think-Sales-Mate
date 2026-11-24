import { NextResponse, type NextRequest } from "next/server";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { formatCurrencyAmount } from "@/lib/currency";
import { getOrganizationCurrencyConfig } from "@/lib/currency/settings";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 50;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chargeId: string }> },
) {
  const context = await getCurrentOrgContext();
  if (!context) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  if (!await canTabPermission("education_finance", "finance", "payments", "view")) {
    return NextResponse.json({ error: "You do not have permission to view payment history." }, { status: 403 });
  }

  const { chargeId } = await params;
  const offsetParam = Number.parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10);
  if (!Number.isSafeInteger(offsetParam) || offsetParam < 0) {
    return NextResponse.json({ error: "The payment history offset is invalid." }, { status: 400 });
  }
  if (offsetParam > 50_000) {
    return NextResponse.json({ error: "Payment history is limited to the first 50,000 records." }, { status: 413 });
  }
  const offset = offsetParam;
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const branchIds = campuses.map((campus) => campus.id);
  if (!branchIds.length) return NextResponse.json({ error: "No accessible campuses were found." }, { status: 403 });

  const supabase = await createClient();
  const { data: charge, error: chargeError } = await supabase.from("education_fee_charges")
    .select("id")
    .eq("org_id", context.orgId)
    .eq("id", chargeId)
    .in("branch_id", branchIds)
    .maybeSingle();
  if (chargeError) {
    console.error("Could not verify the Think Education charge payment history:", chargeError.message);
    return NextResponse.json({ error: "Could not verify the fee charge." }, { status: 500 });
  }
  if (!charge) return NextResponse.json({ error: "The fee charge was not found in your access scope." }, { status: 404 });

  const [{ data: payments, count, error: paymentsError }, currencyConfig] = await Promise.all([
    supabase.from("education_fee_payments")
      .select("id, amount, payment_method, reference, created_at", { count: "exact" })
      .eq("org_id", context.orgId)
      .eq("charge_id", charge.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1),
    getOrganizationCurrencyConfig(),
  ]);
  if (paymentsError) {
    console.error("Could not load Think Education charge payment history:", paymentsError.message);
    return NextResponse.json({ error: "Could not load payment history." }, { status: 500 });
  }

  return NextResponse.json({
    payments: (payments ?? []).map((payment) => ({
      ...payment,
      amountLabel: formatCurrencyAmount(payment.amount, currencyConfig),
    })),
    totalCount: count ?? 0,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
