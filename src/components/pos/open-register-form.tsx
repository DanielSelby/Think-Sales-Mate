"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Banknote, Building2, Clock3, FileText, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/currency";
import { openPosRegister } from "@/app/(dashboard)/pos/actions";

export function OpenRegisterForm({
  locations,
  hasMultipleAvailableBranches,
  hasAllBranchAccess,
  primaryLocationId,
  currency,
  cashierName,
  canOpen,
  sessionClosed,
  auditWarning,
}: {
  locations: Array<{ id: string; name: string; hasOpenSession: boolean }>;
  hasMultipleAvailableBranches: boolean;
  hasAllBranchAccess: boolean;
  primaryLocationId: string | null;
  currency: string;
  cashierName: string;
  canOpen: boolean;
  sessionClosed: boolean;
  auditWarning: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"all" | "selected">("selected");
  const unopenedLocations = locations.filter((location) => !location.hasOpenSession);
  const [selectedLocationId, setSelectedLocationId] = useState(
    unopenedLocations.find((location) => location.id === primaryLocationId)?.id ?? unopenedLocations[0]?.id ?? ""
  );
  const [shift, setShift] = useState("full_day");
  const [openingCashByLocation, setOpeningCashByLocation] = useState<Record<string, string>>(
    Object.fromEntries(unopenedLocations.map((location) => [location.id, "0"]))
  );
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (opened) {
      router.replace("/pos");
      router.refresh();
      return;
    }
    setError(null);
    setWarning(null);
    startTransition(async () => {
      const result = await openPosRegister({
        mode: hasMultipleAvailableBranches ? mode : "selected",
        selectedLocationId: hasMultipleAvailableBranches ? selectedLocationId : unopenedLocations[0]?.id,
        openingCashByLocation: Object.fromEntries(
          (hasMultipleAvailableBranches && mode === "all"
            ? unopenedLocations
            : unopenedLocations.filter((location) => location.id === (hasMultipleAvailableBranches ? selectedLocationId : unopenedLocations[0]?.id))
          ).map((location) => [location.id, Number(openingCashByLocation[location.id])])
        ),
        shift,
        notes,
      });
      if (!result.ok) {
        setError(result.error ?? "Could not open the register.");
        return;
      }
      if (result.error) setWarning(result.error);
      if (result.error) {
        setOpened(true);
        return;
      }
      router.replace("/pos");
      router.refresh();
    });
  }

  const openedAt = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());
  const locationsToOpen = hasMultipleAvailableBranches && mode === "all"
    ? unopenedLocations
    : unopenedLocations.filter((location) => location.id === (hasMultipleAvailableBranches ? selectedLocationId : unopenedLocations[0]?.id));
  const canSubmit = locationsToOpen.length > 0 &&
    locationsToOpen.every((location) => Number.isFinite(Number(openingCashByLocation[location.id])) && Number(openingCashByLocation[location.id]) >= 0);

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-5 py-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
      <section className="rounded-2xl border border-ledger-200 bg-white p-5 shadow-card sm:p-7 dark:border-ledger-700 dark:bg-ink-900">
        <div className="mb-6 flex items-center gap-3 border-b border-ledger-100 pb-5 dark:border-ledger-700">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
            <Banknote className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-ink-900 dark:text-white">Open Register</h1>
            <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">Start a cash session before processing POS transactions.</p>
          </div>
        </div>

        {sessionClosed && <p role="status" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">Register Closed. Open a new register session before processing POS transactions.</p>}
        {auditWarning && <p role="status" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">The register was closed, but its audit event could not be saved. Notify an administrator.</p>}
        {error && <p role="alert" className="mb-4 rounded-lg border border-alert/30 bg-alert-soft px-3 py-2 text-sm text-alert">{error}</p>}
        {warning && <p role="status" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">{warning}</p>}

        {locations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ledger-200 px-4 py-10 text-center text-sm text-ledger-500 dark:border-ledger-700 dark:text-ledger-400">
            No active primary branch is assigned to your account. Ask an administrator to assign a branch in User Management.
          </div>
        ) : !canOpen ? (
          <div className="rounded-xl border border-dashed border-ledger-200 px-4 py-10 text-center text-sm text-ledger-500 dark:border-ledger-700 dark:text-ledger-400">
            You have POS access but do not have permission to open a register.
          </div>
        ) : (
          <div className="space-y-5">
            {hasMultipleAvailableBranches && (
              <div>
                <p className="mb-2 text-sm font-semibold text-ink-900 dark:text-white">Register access</p>
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-ledger-50 p-1 dark:bg-white/[0.04]">
                  {([
                    ["all", "Open All Register"],
                    ["selected", "Open Selected Register"],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={mode === value}
                      onClick={() => setMode(value)}
                      className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${mode === value ? "bg-white text-ink-900 shadow-sm dark:bg-ink-800 dark:text-white" : "text-ledger-500 dark:text-ledger-400"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-ledger-500 dark:text-ledger-400">
                  {hasAllBranchAccess ? "All active branches in your organization are available." : "Only branches assigned to you in User Management are available."}
                </p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {hasMultipleAvailableBranches && mode === "selected" ? (
                <label className="block space-y-1.5">
                  <span className="text-sm font-semibold text-ink-900 dark:text-white">Branch</span>
                  <span className="relative block">
                    <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ledger-400" />
                    <select value={selectedLocationId} onChange={(event) => setSelectedLocationId(event.target.value)} className="h-11 w-full rounded-lg border border-ledger-200 bg-white pl-10 pr-3 text-sm text-ink-900 dark:border-ledger-700 dark:bg-ink-950 dark:text-white">
                      {unopenedLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                    </select>
                  </span>
                </label>
              ) : (
                <div className="rounded-xl border border-ledger-100 bg-ledger-50/70 p-3 dark:border-ledger-700 dark:bg-white/[0.03]">
                  <p className="text-xs text-ledger-500 dark:text-ledger-400">{hasAllBranchAccess ? "Available branches" : hasMultipleAvailableBranches ? "Assigned branches" : "Assigned branch"}</p>
                  <p className="mt-1 flex items-center gap-2 truncate font-semibold text-ink-900 dark:text-white"><Building2 className="h-4 w-4 shrink-0 text-ledger-400" />{hasMultipleAvailableBranches ? `${unopenedLocations.length} branches available` : locations[0].name}</p>
                </div>
              )}
              <label className="block space-y-1.5">
                <span className="text-sm font-semibold text-ink-900 dark:text-white">Shift</span>
                <select value={shift} onChange={(event) => setShift(event.target.value)} className="h-11 w-full rounded-lg border border-ledger-200 bg-white px-3 text-sm text-ink-900 dark:border-ledger-700 dark:bg-ink-950 dark:text-white">
                  <option value="full_day">Full day</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="night">Night</option>
                </select>
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-ledger-100 bg-ledger-50/70 p-3 dark:border-ledger-700 dark:bg-white/[0.03]">
                <p className="text-xs text-ledger-500 dark:text-ledger-400">Cashier</p>
                <p className="mt-1 truncate font-semibold text-ink-900 dark:text-white">{cashierName}</p>
              </div>
              <div className="rounded-xl border border-ledger-100 bg-ledger-50/70 p-3 dark:border-ledger-700 dark:bg-white/[0.03]">
                <p className="text-xs text-ledger-500 dark:text-ledger-400">Register</p>
                <p className="mt-1 truncate font-semibold text-ink-900 dark:text-white">POS-01</p>
              </div>
            </div>

            {locations.filter((location) => location.hasOpenSession).length > 0 && hasMultipleAvailableBranches && (
              <div className="rounded-lg border border-signal/20 bg-signal-soft p-3 text-sm text-signal">
                Already open: {locations.filter((location) => location.hasOpenSession).map((location) => location.name).join(", ")}.
              </div>
            )}

            {locationsToOpen.length === 0 ? (
              <div className="rounded-xl border border-dashed border-ledger-200 px-4 py-8 text-center text-sm text-ledger-500 dark:border-ledger-700 dark:text-ledger-400">
                No unopened branch is available. Continue to POS to use your active register.
              </div>
            ) : locationsToOpen.map((location) => (
              <label key={location.id} className="block space-y-1.5">
                <span className="text-sm font-semibold text-ink-900 dark:text-white">Opening float · {location.name}</span>
                <span className="relative block">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={openingCashByLocation[location.id] ?? ""}
                    onChange={(event) => setOpeningCashByLocation((current) => ({ ...current, [location.id]: event.target.value }))}
                    className="h-12 w-full rounded-lg border border-ledger-200 bg-white px-3 pr-20 text-lg font-semibold text-ink-900 dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
                    aria-label={`Opening cash for ${location.name} in ${currency}`}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-ledger-500">{currency}</span>
                </span>
                <span className="block text-xs text-ledger-500">Opening float: {formatMoney(Number(openingCashByLocation[location.id]) || 0, currency)}</span>
              </label>
            ))}

            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-ink-900 dark:text-white">Notes (optional)</span>
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} rows={3} className="w-full resize-y rounded-lg border border-ledger-200 bg-white px-3 py-2 text-sm text-ink-900 dark:border-ledger-700 dark:bg-ink-950 dark:text-white" placeholder="Starting cash notes or handover details" />
            </label>

            <Button type="button" size="lg" className="w-full bg-emerald-700 text-white hover:bg-emerald-800" disabled={pending || !canSubmit} onClick={submit}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {pending ? "Opening register..." : opened ? "Continue to POS" : "Open Register"}
            </Button>
          </div>
        )}
      </section>

      <aside className="space-y-4">
        <Link href="/pos/register-history" className="flex items-center justify-center gap-2 rounded-xl border border-ledger-200 bg-white px-4 py-3 text-sm font-semibold text-ledger-700 hover:bg-ledger-50 dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-200 dark:hover:bg-white/[0.05]">
          <FileText className="h-4 w-4" /> Register History
        </Link>
        <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-5 dark:border-blue-900/50 dark:from-blue-950/40 dark:to-ink-900">
          <div className="flex items-center gap-2 text-blue-800 dark:text-blue-200"><Clock3 className="h-5 w-5" /><h2 className="font-semibold">Ready to open?</h2></div>
          <p className="mt-2 text-sm text-blue-700/80 dark:text-blue-200/70">Confirm the branch and count the cash currently in the drawer. Sales will be associated with this session.</p>
          <p className="mt-4 text-xs text-blue-700/70 dark:text-blue-200/60">Opening time: {openedAt}</p>
        </div>
        <div className="rounded-2xl border border-ledger-100 bg-white p-5 dark:border-ledger-700 dark:bg-ink-900">
          <h2 className="font-semibold text-ink-900 dark:text-white">Before opening</h2>
          <ul className="mt-3 space-y-2 text-sm text-ledger-600 dark:text-ledger-300">
            <li>• Use only a branch available to your account.</li>
            <li>• Count and enter the opening float accurately.</li>
            <li>• Your POS session stays active until the register is closed.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
