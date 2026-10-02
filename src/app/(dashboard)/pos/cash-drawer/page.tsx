import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Banknote, Clock3 } from "lucide-react";
import { CashDrawerView } from "@/components/pos/cash-drawer-view";
import { getRegisterSummary } from "@/app/(dashboard)/pos/actions";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { requirePermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/currency";
import { canUseLocation } from "@/lib/organizations/location-access";

export const metadata = { title: "Cash Drawer · ThinkSales Pro" };

export default async function CashDrawerPage({ searchParams }: { searchParams: Promise<{ location?: string }> }) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  await requirePermission("pos", "view");
  const params = await searchParams;
  const supabase = await createClient();
  const db = supabase as any;
  const { data: sessions, error: sessionError } = await db
    .from("pos_register_sessions")
    .select("id, location_id, register_name, cashier_name, opening_cash, opened_at, shift")
    .eq("org_id", context.orgId)
    .eq("cashier_id", context.userId)
    .eq("status", "open")
    .order("opened_at");
  if (sessionError) throw new Error("Could not verify the register session.");
  const accessibleSessions = (sessions ?? []).filter((item: { location_id: string }) => canUseLocation(context, item.location_id));
  const session = params.location
    ? accessibleSessions.find((item: { location_id: string }) => item.location_id === params.location)
    : accessibleSessions.find((item: { location_id: string }) => item.location_id === context.locationId)
      ?? accessibleSessions.find((item: { location_id: string }) => item.location_id === context.masterLocationId)
      ?? accessibleSessions[0];
  if (!session) redirect("/pos/open-register");

  const [summary, movementResult, locationResult] = await Promise.all([
    getRegisterSummary(session.location_id, context.userId, true),
    db.from("pos_cash_movements")
      .select("id, movement_type, amount, reason, reference, created_at")
      .eq("org_id", context.orgId)
      .eq("register_session_id", session.id)
      .order("created_at", { ascending: false })
      .limit(100),
    db.from("business_locations").select("name").eq("id", session.location_id).eq("org_id", context.orgId).maybeSingle(),
  ]);
  if (movementResult.error) throw new Error("Could not load cash drawer movements.");
  if (locationResult.error) throw new Error("Could not load the register branch.");

  const movements = movementResult.data ?? [];
  const cashIn = movements.reduce((sum: number, movement: { movement_type: string; amount: number }) => sum + (movement.movement_type === "cash_in" ? Number(movement.amount) : 0), 0);
  const cashOut = movements.reduce((sum: number, movement: { movement_type: string; amount: number }) => sum + (movement.movement_type !== "cash_in" ? Number(movement.amount) : 0), 0);
  const expectedCash = Math.max(0, Number(session.opening_cash ?? 0) + summary.cashTotal + cashIn - cashOut - summary.expensesTotal);

  return (
    <div className="mx-auto max-w-6xl space-y-5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"><Banknote className="h-6 w-6" /></span>
          <div>
            <p className="text-xs font-semibold text-ledger-500 dark:text-ledger-400">POS / Cash Drawer</p>
            <h1 className="text-xl font-bold text-ink-900 dark:text-white">Cash Drawer</h1>
            <p className="text-sm text-ledger-500 dark:text-ledger-400">{session.register_name} · {session.shift?.replaceAll("_", " ") ?? "Shift"} · {locationResult.data?.name ?? "Branch"} · {session.cashier_name ?? context.userEmail}</p>
          </div>
        </div>
        <Link href="/pos" className="inline-flex h-9 items-center gap-2 rounded-lg border border-ledger-200 px-3 text-sm font-semibold text-ledger-700 hover:bg-ledger-50 dark:border-ledger-700 dark:text-ledger-200 dark:hover:bg-white/[0.05]"><ArrowLeft className="h-4 w-4" /> Return to POS</Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Opening Cash", Number(session.opening_cash ?? 0)],
          ["Cash Sales", summary.cashTotal],
          ["Cash In", cashIn],
          ["Cash Out / Paid Out", cashOut + summary.expensesTotal],
          ["Expected Cash", expectedCash],
        ].map(([label, amount]) => (
          <div key={label} className="rounded-xl border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <p className="text-xs font-semibold text-ledger-500 dark:text-ledger-400">{label}</p>
            <p className="mt-2 font-mono text-lg font-bold text-ink-900 dark:text-white">{formatMoney(Number(amount), context.currency)}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.7fr)]">
        <section className="rounded-xl border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-ink-900 dark:text-white">Cash Movements</h2>
            <span className="flex items-center gap-1 text-xs text-ledger-500 dark:text-ledger-400"><Clock3 className="h-3.5 w-3.5" /> Since {new Date(session.opened_at).toLocaleString()}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-ledger-100 text-xs text-ledger-500 dark:border-ledger-700 dark:text-ledger-400">
                <tr><th className="py-2 pr-3">Date / Time</th><th className="py-2 pr-3">Type</th><th className="py-2 pr-3">Reason</th><th className="py-2 text-right">Amount</th></tr>
              </thead>
              <tbody>
                {movements.map((movement: { id: string; movement_type: string; amount: number; reason: string; reference: string | null; created_at: string }) => (
                  <tr key={movement.id} className="border-b border-ledger-50 last:border-0 dark:border-ledger-800">
                    <td className="py-2 pr-3 text-xs text-ledger-500">{new Date(movement.created_at).toLocaleString()}</td>
                    <td className="py-2 pr-3 capitalize text-ink-900 dark:text-white">{movement.movement_type.replaceAll("_", " ")}</td>
                    <td className="py-2 pr-3 text-ledger-600 dark:text-ledger-300">{movement.reason}{movement.reference ? ` · ${movement.reference}` : ""}</td>
                    <td className="py-2 text-right font-mono text-ink-900 dark:text-white">{formatMoney(Number(movement.amount), context.currency)}</td>
                  </tr>
                ))}
                {movements.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-sm text-ledger-400">No cash movements recorded for this session yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
        <CashDrawerView registerSessionId={session.id} currency={context.currency} />
      </div>
    </div>
  );
}
