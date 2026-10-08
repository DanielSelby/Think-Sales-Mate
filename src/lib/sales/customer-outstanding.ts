import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export interface CustomerOutstandingBalances {
  byCustomerId: Map<string, number>;
  byCustomerName: Map<string, number>;
}

export async function checkCustomerCreditLimit(
  supabase: SupabaseClient<Database>,
  orgId: string,
  customerId: string | null,
  customerName: string | null,
  additionalCredit: number,
  excludeSaleId?: string
): Promise<{ allowed: boolean; error?: string }> {
  if (additionalCredit <= 0 || (!customerId && !customerName?.trim())) return { allowed: true };

  const { data: settings, error: settingsError } = await supabase
    .from("org_general_settings")
    .select("block_credit_limit_exceeded")
    .eq("org_id", orgId)
    .maybeSingle();
  if (settingsError) return { allowed: false, error: `Could not verify the credit-limit setting: ${settingsError.message}` };
  if (!settings?.block_credit_limit_exceeded) return { allowed: true };

  let customerQuery = supabase
    .from("customers")
    .select("id, name, credit_limit")
    .eq("org_id", orgId);
  customerQuery = customerId
    ? customerQuery.eq("id", customerId)
    : customerQuery.eq("name", customerName!.trim());
  const { data: customer, error: customerError } = await customerQuery.maybeSingle();
  if (customerError) return { allowed: false, error: `Could not verify the customer's credit limit: ${customerError.message}` };
  if (!customer || customer.credit_limit == null) return { allowed: true };

  let balances: CustomerOutstandingBalances;
  try {
    balances = await getCustomerOutstandingBalances(supabase, orgId, undefined, excludeSaleId);
  } catch (error) {
    return {
      allowed: false,
      error: error instanceof Error ? error.message : "Could not verify the customer's outstanding balance.",
    };
  }

  const normalizedName = customer.name.trim().toLocaleLowerCase();
  const outstanding = (balances.byCustomerId.get(customer.id) ?? 0) +
    (balances.byCustomerName.get(normalizedName) ?? 0);
  if (outstanding + additionalCredit > Number(customer.credit_limit) + 0.005) {
    const available = Math.max(0, Number(customer.credit_limit) - outstanding);
    return {
      allowed: false,
      error: `This credit sale exceeds ${customer.name}'s limit. Outstanding: ${outstanding.toFixed(2)}; available credit: ${available.toFixed(2)}; requested credit: ${additionalCredit.toFixed(2)}.`,
    };
  }
  return { allowed: true };
}

export async function getCustomerOutstandingBalances(
  supabase: SupabaseClient<Database>,
  orgId: string,
  allowedLocationIds?: string[],
  excludeSaleId?: string
): Promise<CustomerOutstandingBalances> {
  let salesQuery = supabase
    .from("sales")
    .select("id, customer_id, customer_name, sale_number, total, amount_paid, location_id")
    .eq("org_id", orgId)
    .in("status", ["completed", "returned"]);
  let paymentsQuery = supabase
    .from("customer_credit_payments")
    .select("invoice_id, amount, location_id")
    .eq("org_id", orgId);

  if (allowedLocationIds) {
    salesQuery = salesQuery.in("location_id", allowedLocationIds);
    paymentsQuery = paymentsQuery.in("location_id", allowedLocationIds);
  }
  if (excludeSaleId) salesQuery = salesQuery.neq("id", excludeSaleId);

  const [salesResult, paymentsResult, invoicesResult] = await Promise.all([
    salesQuery,
    paymentsQuery,
    allowedLocationIds
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from("invoices")
          .select("customer_name, amount")
          .eq("org_id", orgId)
          .in("status", ["sent", "overdue"]),
  ]);

  if (salesResult.error) throw new Error(`Could not load customer sale balances: ${salesResult.error.message}`);
  if (paymentsResult.error) throw new Error(`Could not load customer payments: ${paymentsResult.error.message}`);
  if (invoicesResult.error) throw new Error(`Could not load customer invoice balances: ${invoicesResult.error.message}`);

  const paymentsByInvoice = new Map<string, number>();
  for (const payment of paymentsResult.data ?? []) {
    paymentsByInvoice.set(payment.invoice_id, (paymentsByInvoice.get(payment.invoice_id) ?? 0) + Number(payment.amount));
  }

  const byCustomerId = new Map<string, number>();
  const byCustomerName = new Map<string, number>();
  function addBalance(map: Map<string, number>, key: string, amount: number) {
    map.set(key, (map.get(key) ?? 0) + amount);
  }

  for (const sale of salesResult.data ?? []) {
    const total = Number(sale.total ?? 0);
    const paid = Number(sale.amount_paid ?? 0) + (paymentsByInvoice.get(`SALE-${sale.sale_number}`) ?? 0);
    const outstanding = Math.max(0, total - Math.min(total, paid));
    if (outstanding <= 0) continue;

    if (sale.customer_id) {
      addBalance(byCustomerId, sale.customer_id, outstanding);
    } else if (sale.customer_name?.trim()) {
      addBalance(byCustomerName, sale.customer_name.trim().toLocaleLowerCase(), outstanding);
    }
  }

  for (const invoice of invoicesResult.data ?? []) {
    const key = invoice.customer_name.trim().toLocaleLowerCase();
    addBalance(byCustomerName, key, Number(invoice.amount));
  }

  return { byCustomerId, byCustomerName };
}
