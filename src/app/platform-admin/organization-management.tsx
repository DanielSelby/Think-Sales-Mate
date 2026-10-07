"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowDownUp,
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Eye,
  FileClock,
  Filter,
  Mail,
  MapPin,
  MoreVertical,
  Search,
  Shield,
  ShieldAlert,
  Users,
  X,
} from "lucide-react";
import {
  setOrganizationFeatureAccess,
  updateOrganizationBusinessDetails,
  updatePlatformOrganization,
} from "./actions";
import { reviewOrganizationRegistration, type RegistrationReviewResult } from "./registration-actions";
import type { PlatformModule } from "@/types/platform-database";
import { PLATFORM_MODULES } from "@/lib/platform-modules";
import { useAppStore } from "@/store/useAppStore";

type RegistrationState = "pending" | "information_requested" | "approved" | "rejected";
type OrganizationStatus = "active" | "trial" | "pending" | "rejected" | "suspended" | "expired";

export type ManagedOrganization = {
  id: string;
  organization_id: string;
  name: string;
  plan_id: string | null;
  status: OrganizationStatus;
  expires_at: string | null;
  max_users_override: number | null;
  max_branches_override: number | null;
  created_at: string;
  updated_at: string;
  industry: string | null;
  owner_user_id: string | null;
  owner_email: string | null;
  registration_state: RegistrationState;
  registration_notes: string | null;
  business_type: string | null;
  country: string | null;
  logo_url: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  branch_count: number;
  user_count: number;
  read_only: boolean;
  owner_users: Array<{ name: string; email: string; phone: string; status: string }>;
  branches: Array<{ id: string; name: string; country: string | null; is_active: boolean }>;
};

type Plan = { id: string; name: string; monthly_price: number; max_users: number | null; max_branches: number | null };
type TabKey = "all" | "pending" | "active" | "suspended" | "rejected" | "read_only" | "trial";
type Props = {
  organizations: ManagedOrganization[];
  plans: Plan[];
  canManage: boolean;
  asOf: string;
  onOpenTab: (tab: "Billing & Subscriptions" | "Activity Logs" | "Impersonation", organizationId?: string) => void;
  onEdit: (organizationId: string) => void;
};

const organizationTabs: Array<{ key: TabKey; label: string }> = [
  { key: "all", label: "All Organizations" },
  { key: "pending", label: "Pending Registrations" },
  { key: "active", label: "Active" },
  { key: "suspended", label: "Suspended" },
  { key: "rejected", label: "Rejected" },
  { key: "read_only", label: "Read Only" },
  { key: "trial", label: "Trial" },
];

const statusStyle: Record<OrganizationStatus, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  trial: "bg-blue-50 text-blue-700 ring-blue-200",
  pending: "bg-amber-50 text-amber-800 ring-amber-200",
  rejected: "bg-rose-50 text-rose-700 ring-rose-200",
  suspended: "bg-red-50 text-red-700 ring-red-200",
  expired: "bg-slate-100 text-slate-600 ring-slate-200",
};

function statusLabel(organization: ManagedOrganization) {
  if (organization.status === "pending") return "Pending Approval";
  if (organization.read_only && organization.status === "active") return "Read Only";
  return organization.status.charAt(0).toUpperCase() + organization.status.slice(1);
}

function registrationTimestamp(value: string) {
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function OrganizationManagement({
  organizations,
  plans,
  canManage,
  asOf,
  onOpenTab,
  onEdit,
}: Props) {
  const [tab, setTab] = useState<TabKey>("pending");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "name">("newest");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(organizations.find((org) => org.status === "pending")?.id ?? organizations[0]?.id ?? null);
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
  const [moreActionsId, setMoreActionsId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"overview" | "details" | "history" | "notes" | "users" | "branches">("overview");
  const [dialog, setDialog] = useState<"reject" | "request_information" | null>(null);
  const [dialogReason, setDialogReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; kind: "success" | "warning" | "error" } | null>(null);
  const [editedLimits, setEditedLimits] = useState<Record<string, { users: string; branches: string }>>({});
  const [businessEdits, setBusinessEdits] = useState<Record<string, { name: string; businessType: string; country: string }>>({});
  const router = useRouter();

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim().toLowerCase()), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const planById = useMemo(() => new Map(plans.map((plan) => [plan.id, plan])), [plans]);
  const countries = useMemo(
    () => [...new Set(organizations.map((organization) => organization.country).filter((country): country is string => Boolean(country)))].sort(),
    [organizations],
  );
  const tabCounts = useMemo(() => ({
    all: organizations.length,
    pending: organizations.filter((org) => org.status === "pending" && ["pending", "information_requested"].includes(org.registration_state)).length,
    active: organizations.filter((org) => org.status === "active" && !org.read_only).length,
    suspended: organizations.filter((org) => org.status === "suspended").length,
    rejected: organizations.filter((org) => org.status === "rejected" || org.registration_state === "rejected").length,
    read_only: organizations.filter((org) => org.read_only).length,
    trial: organizations.filter((org) => org.status === "trial").length,
  }), [organizations]);
  const pendingCount = tabCounts.pending;
  const currentTime = Date.parse(asOf);
  const expiringCount = organizations.filter((organization) => {
    if (!organization.expires_at || !["active", "trial"].includes(organization.status)) return false;
    const expiresAt = Date.parse(organization.expires_at);
    return expiresAt >= currentTime && expiresAt <= currentTime + 30 * 24 * 60 * 60 * 1000;
  }).length;
  const filteredOrganizations = useMemo(() => {
    let result = organizations.filter((organization) => {
      const matchesTab = tab === "all"
        || (tab === "pending" && organization.status === "pending" && ["pending", "information_requested"].includes(organization.registration_state))
        || (tab === "active" && organization.status === "active" && !organization.read_only)
        || (tab === "suspended" && organization.status === "suspended")
        || (tab === "rejected" && (organization.status === "rejected" || organization.registration_state === "rejected"))
        || (tab === "read_only" && organization.read_only)
        || (tab === "trial" && organization.status === "trial");
      const matchesSearch = !search || [
        organization.name,
        organization.organization_id,
        organization.owner_name,
        organization.owner_email,
        organization.country,
        organization.owner_phone,
      ].some((value) => value?.toLowerCase().includes(search));
      return matchesTab
        && matchesSearch
        && (!planFilter || organization.plan_id === planFilter)
        && (!countryFilter || organization.country === countryFilter)
        && (!statusFilter || organization.status === statusFilter);
    });
    result = [...result].sort((left, right) => sortBy === "name"
      ? left.name.localeCompare(right.name)
      : sortBy === "oldest"
        ? new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
        : new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
    return result;
  }, [organizations, tab, search, planFilter, countryFilter, statusFilter, sortBy]);
  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(filteredOrganizations.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const pageOrganizations = filteredOrganizations.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const selected = organizations.find((organization) => organization.id === selectedId) ?? null;
  const selectedPlan = selected ? planById.get(selected.plan_id ?? "") : undefined;
  const selectedBusinessEdit = selected ? businessEdits[selected.id] : undefined;
  const businessNameInput = selectedBusinessEdit?.name ?? selected?.name ?? "";
  const businessTypeInput = selectedBusinessEdit?.businessType ?? selected?.business_type ?? selected?.industry ?? "";
  const countryInput = selectedBusinessEdit?.country ?? selected?.country ?? "";
  const selectedLimitEdits = selected ? editedLimits[selected.id] : undefined;
  const userLimitInput = selectedLimitEdits?.users ?? (selected?.max_users_override?.toString() ?? "");
  const branchLimitInput = selectedLimitEdits?.branches ?? (selected?.max_branches_override?.toString() ?? "");
  const saveOrganizationLimits = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const parseLimit = (value: string) => value.trim() ? Number(value) : null;
    void runAction(
      () => updatePlatformOrganization(selected.id, {
        maxUsersOverride: parseLimit(userLimitInput),
        maxBranchesOverride: parseLimit(branchLimitInput),
      }),
      "Organization capacity limits saved.",
    );
  };
  const saveBusinessDetails = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    void runAction(
      () => updateOrganizationBusinessDetails({
        platformOrganizationId: selected.id,
        name: businessNameInput,
        businessType: businessTypeInput,
        country: countryInput,
      }),
      "Organization business details updated.",
    );
  };
  const clearFilters = () => {
    setSearchInput("");
    setPlanFilter("");
    setCountryFilter("");
    setStatusFilter("");
    setSortBy("newest");
    setPage(0);
  };

  const runAction = async <T,>(
    action: () => Promise<T>,
    successText: string | ((result: T) => { text: string; warning?: boolean }),
  ) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await action();
      const success = typeof successText === "function" ? successText(result) : { text: successText };
      setMessage({ text: success.text, kind: success.warning ? "warning" : "success" });
      router.refresh();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "The action could not be completed.", kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  const submitRegistrationDecision = (decision: "approve" | "reject" | "request_information") => {
    if (!selected) return;
    if (decision !== "approve" && !dialogReason.trim()) {
      setMessage({ text: decision === "reject" ? "A rejection reason is required." : "Enter the information you need from the owner.", kind: "error" });
      return;
    }
    const formData = new FormData();
    formData.set("id", selected.id);
    formData.set("decision", decision);
    formData.set("reason", dialogReason.trim());
    void runAction(
      () => reviewOrganizationRegistration(formData),
      (result: RegistrationReviewResult) => {
        const actionText = decision === "approve"
          ? `${selected.name} approved.`
          : decision === "reject"
            ? `${selected.name} rejected.`
            : "Information request saved.";
        return result.notification.status === "sent"
          ? { text: `${actionText} Owner email sent.` }
          : {
            text: `${actionText} Owner email was not sent: ${result.notification.message}`,
            warning: true,
          };
      },
    );
    setDialog(null);
    setDialogReason("");
  };

  const toggleReadOnly = async (organization: ManagedOrganization, makeReadOnly: boolean) => {
    const platformModules = PLATFORM_MODULES.map((module) => module.key);
    await runAction(async () => {
      for (const moduleKey of platformModules) {
        await setOrganizationFeatureAccess(
          organization.organization_id,
            moduleKey as PlatformModule,
          makeReadOnly ? "read_only" : "enabled",
        );
      }
    }, makeReadOnly ? "Organization access changed to read-only." : "Organization access restored.");
  };

  const detailsPanel = (isDrawer: boolean) => selected && (
    <section className={`${isDrawer ? "fixed inset-0 z-40 flex items-end bg-slate-950/50 md:hidden" : "hidden xl:block"} ${isDrawer ? "" : ""}`}>
      <div className={isDrawer ? "max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl" : "sticky top-5 max-h-[calc(100vh-2.5rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-sm"}>
        <div className="border-b border-slate-100 p-5">
          <div className="flex items-start gap-3">
            <OrganizationLogo key={`${selected.id}-${selected.logo_url ?? ""}`} name={selected.name} logoUrl={selected.logo_url} size="detail" />
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-bold text-slate-900">{selected.name}</h2>
              <p className="text-xs text-slate-500">{selected.business_type || selected.industry || "Business registration"}</p>
            </div>
            <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ring-1 ${statusStyle[selected.status]}`}>
              {statusLabel(selected)}
            </span>
            {isDrawer && <button type="button" onClick={() => setMobileDetailsOpen(false)} aria-label="Close details" className="rounded-lg p-2 text-slate-500"><X className="h-4 w-4" /></button>}
          </div>
          <nav className="mt-4 flex gap-4 overflow-x-auto border-b border-slate-100 text-xs font-semibold">
            {(["overview", "details", "history", "notes"] as const).map((key) => (
              <button type="button" key={key} onClick={() => setDetailTab(key)} className={`whitespace-nowrap border-b-2 px-1 pb-2 capitalize ${detailTab === key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500"}`}>
                {key}
              </button>
            ))}
          </nav>
        </div>
        <div className="space-y-5 p-5">
          {detailTab === "overview" || detailTab === "details" ? (
            <>
              {canManage && <form onSubmit={saveBusinessDetails} className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
                <h3 className="mb-2 text-xs font-bold text-slate-800">Business Details</h3>
                <div className="space-y-2">
                  <label className="block text-[10px] font-semibold text-slate-600">Business name
                    <input value={businessNameInput} maxLength={160} required onChange={(event) => setBusinessEdits((current) => ({ ...current, [selected.id]: { name: event.target.value, businessType: businessTypeInput, country: countryInput } }))} className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-normal text-slate-800" />
                  </label>
                  <label className="block text-[10px] font-semibold text-slate-600">Business type
                    <input value={businessTypeInput} maxLength={120} onChange={(event) => setBusinessEdits((current) => ({ ...current, [selected.id]: { name: businessNameInput, businessType: event.target.value, country: countryInput } }))} placeholder="e.g. Retail, Wholesale, Restaurant" className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-normal text-slate-800" />
                  </label>
                  <label className="block text-[10px] font-semibold text-slate-600">Country
                    <input value={countryInput} maxLength={120} onChange={(event) => setBusinessEdits((current) => ({ ...current, [selected.id]: { name: businessNameInput, businessType: businessTypeInput, country: event.target.value } }))} placeholder="Country" className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-normal text-slate-800" />
                  </label>
                </div>
                <button type="submit" disabled={busy} className="mt-3 w-full rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? "Saving..." : "Save business details"}</button>
              </form>}
              <div>
                <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-700"><Building2 className="h-4 w-4 text-blue-600" />Organization Information</h3>
                <dl className="space-y-2.5 text-xs">
                  <Detail label="Organization Name" value={selected.name} />
                  <Detail label="Business Type" value={selected.business_type || selected.industry || "—"} />
                  <Detail label="Country" value={selected.country || "—"} />
                  <Detail label="Plan" value={planById.get(selected.plan_id ?? "")?.name ?? "Not assigned"} />
                  <Detail label="Number of Branches" value={String(selected.branch_count)} />
                  <Detail label="Users" value={String(selected.user_count)} />
                  <Detail label="Registration Date" value={registrationTimestamp(selected.created_at)} />
                  <Detail label="Organization ID" value={selected.organization_id} />
                </dl>
              </div>
              <div className="border-t border-slate-100 pt-4">
                <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-700"><Users className="h-4 w-4 text-blue-600" />Owner Information</h3>
                <dl className="space-y-2.5 text-xs">
                  <Detail label="Full Name" value={selected.owner_name || "—"} />
                  <Detail label="Email" value={selected.owner_email || "—"} />
                  <Detail label="Phone" value={selected.owner_phone || "—"} />
                </dl>
              </div>
              <div className="border-t border-slate-100 pt-4">
                <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-700"><Shield className="h-4 w-4 text-blue-600" />Status &amp; Actions</h3>
                {selected.status === "pending" ? (
                  <>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                      <strong>Pending Approval</strong><br />This organization is awaiting Platform Admin approval. The owner will be notified of your decision.
                    </div>
                    {canManage && <div className="mt-3 grid grid-cols-2 gap-2">
                      <button disabled={busy} type="button" onClick={() => submitRegistrationDecision("approve")} className="rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-emerald-700"><Check className="mr-1 inline h-3.5 w-3.5" />Approve</button>
                      <button disabled={busy} type="button" onClick={() => { setDialog("reject"); setDialogReason(""); }} className="rounded-lg bg-rose-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-rose-700"><X className="mr-1 inline h-3.5 w-3.5" />Reject</button>
                      <button disabled={busy} type="button" onClick={() => { setDialog("request_information"); setDialogReason(""); }} className="col-span-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs font-bold text-blue-800 hover:bg-blue-100"><Mail className="mr-1 inline h-3.5 w-3.5" />Request More Information</button>
                    </div>}
                  </>
                ) : selected.status === "active" ? (
                  <div className="grid grid-cols-2 gap-2">
                    {canManage && <>
                      <button disabled={busy} type="button" onClick={() => void runAction(() => updatePlatformOrganization(selected.id, { status: "suspended" }), "Organization suspended.")} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700">Suspend</button>
                      <button disabled={busy} type="button" onClick={() => void toggleReadOnly(selected, !selected.read_only)} className="rounded-lg border border-violet-200 px-3 py-2 text-xs font-semibold text-violet-700">{selected.read_only ? "Restore Access" : "Read Only"}</button>
                    </>}
                    <button type="button" onClick={() => { setDetailTab("details"); if (isDrawer) setMobileDetailsOpen(true); }} className="col-span-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">View Details</button>
                  </div>
                ) : selected.status === "suspended" ? (
                  <div className="grid grid-cols-2 gap-2">
                    {canManage && <button disabled={busy} type="button" onClick={() => void runAction(() => updatePlatformOrganization(selected.id, { status: "active" }), "Organization activated.")} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Activate</button>}
                    <button type="button" onClick={() => setDetailTab("details")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold">View Details</button>
                  </div>
                ) : selected.status === "rejected" ? (
                  <p className="rounded-lg bg-rose-50 p-3 text-xs text-rose-800">Registration rejected{selected.registration_notes ? `: ${selected.registration_notes}` : "."}</p>
                ) : (
                  <p className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800">Organization status: {statusLabel(selected)}.</p>
                )}
              </div>
            </>
          ) : detailTab === "users" ? (
            <div>
              <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-700"><Users className="h-4 w-4 text-blue-600" />Organization Users ({selected.user_count})</h3>
              {selected.owner_users.length ? <div className="divide-y divide-slate-100">{selected.owner_users.map((user, index) => <div key={`${user.email}-${index}`} className="py-2.5"><p className="text-xs font-semibold text-slate-800">{user.name}</p><p className="mt-0.5 break-all text-[10px] text-slate-500">{user.email || "Email unavailable"}</p><p className="mt-0.5 text-[10px] text-slate-500">{user.status} · {user.phone || "No phone"}</p></div>)}</div> : <p className="text-xs text-slate-500">No organization user records are available.</p>}
            </div>
          ) : detailTab === "branches" ? (
            <div>
              <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-700"><MapPin className="h-4 w-4 text-blue-600" />Branches ({selected.branch_count})</h3>
              {selected.branches.length ? <div className="divide-y divide-slate-100">{selected.branches.map((branch) => <div key={branch.id} className="py-2.5"><p className="text-xs font-semibold text-slate-800">{branch.name}</p><p className="mt-0.5 text-[10px] text-slate-500">{branch.country || "Country unavailable"} · {branch.is_active ? "Active" : "Inactive"}</p></div>)}</div> : <p className="text-xs text-slate-500">No branch records are available.</p>}
            </div>
          ) : detailTab === "history" ? (
            <div>
              <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-700"><FileClock className="h-4 w-4 text-blue-600" />Registration History</h3>
              <p className="text-xs text-slate-600">Registered {registrationTimestamp(selected.created_at)}.</p>
              {selected.registration_state !== "pending" && <p className="mt-2 text-xs capitalize text-slate-600">Review state: {selected.registration_state.replaceAll("_", " ")}.</p>}
              {selected.registration_notes && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{selected.registration_notes}</p>}
            </div>
          ) : (
            <div>
              <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-700"><CircleHelp className="h-4 w-4 text-blue-600" />Notes</h3>
              <p className="whitespace-pre-wrap text-xs leading-5 text-slate-600">{selected.registration_notes || "No registration notes."}</p>
            </div>
          )}
          <div className="border-t border-slate-100 pt-4">
            <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-700">Capacity Limits</h3>
            <p className="mb-3 text-[11px] leading-4 text-slate-500">Set organization-specific caps. Leave a field blank to use the assigned plan limit.</p>
            <p className="mb-3 text-[11px] text-slate-600">
              Current usage: {selected.user_count} users · {selected.branch_count} branches
            </p>
            {canManage ? (
              <form onSubmit={saveOrganizationLimits} className="space-y-2.5">
                <label className="block text-[11px] font-semibold text-slate-600">
                  Maximum users
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={userLimitInput}
                    placeholder={selectedPlan?.max_users === null || !selectedPlan ? "Unlimited (plan default)" : `Plan limit: ${selectedPlan.max_users}`}
                    onChange={(event) => setEditedLimits((current) => ({ ...current, [selected.id]: { users: event.target.value, branches: branchLimitInput } }))}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2.5 text-xs font-normal text-slate-800"
                  />
                </label>
                <label className="block text-[11px] font-semibold text-slate-600">
                  Maximum branches
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={branchLimitInput}
                    placeholder={selectedPlan?.max_branches === null || !selectedPlan ? "Unlimited (plan default)" : `Plan limit: ${selectedPlan.max_branches}`}
                    onChange={(event) => setEditedLimits((current) => ({ ...current, [selected.id]: { users: userLimitInput, branches: event.target.value } }))}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2.5 text-xs font-normal text-slate-800"
                  />
                </label>
                <button type="submit" disabled={busy} className="w-full rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                  {busy ? "Saving..." : "Save capacity limits"}
                </button>
              </form>
            ) : (
              <p className="text-xs text-slate-700">
                Users: {selected.max_users_override ?? selectedPlan?.max_users ?? "Unlimited"} · Branches: {selected.max_branches_override ?? selectedPlan?.max_branches ?? "Unlimited"}
              </p>
            )}
          </div>
          <div className="border-t border-slate-100 pt-4">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-700">Quick Actions</h3>
            {canManage && <QuickAction label="Edit Organization" icon={<Eye className="h-4 w-4" />} onClick={() => onEdit(selected.id)} />}
            {canManage && <QuickAction label="Manage Subscription" icon={<ArrowDownUp className="h-4 w-4" />} onClick={() => onOpenTab("Billing & Subscriptions", selected.organization_id)} />}
            <QuickAction label="Manage Users" icon={<Users className="h-4 w-4" />} onClick={() => { setDetailTab("users"); if (isDrawer) setMobileDetailsOpen(true); }} />
            <QuickAction label="Manage Branches" icon={<MapPin className="h-4 w-4" />} onClick={() => { setDetailTab("branches"); if (isDrawer) setMobileDetailsOpen(true); }} />
            <QuickAction label="View Activity" icon={<FileClock className="h-4 w-4" />} onClick={() => onOpenTab("Activity Logs", selected.organization_id)} />
            <QuickAction label="Impersonate Organization" icon={<ShieldAlert className="h-4 w-4" />} disabled onClick={() => onOpenTab("Impersonation")} />
          </div>
        </div>
      </div>
    </section>
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Kpi icon={<Building2 className="h-5 w-5" />} color="blue" label="Total Organization" value={organizations.length} detail="All organizations" />
        <Kpi icon={<Clock3 className="h-5 w-5" />} color="amber" label="Pending Registrations" value={pendingCount} detail="Awaiting approval" />
        <Kpi icon={<Check className="h-5 w-5" />} color="emerald" label="Active Organizations" value={organizations.filter((organization) => organization.status === "active").length} detail="Currently active" />
        <Kpi icon={<Clock3 className="h-5 w-5" />} color="violet" label="Trial Organization" value={tabCounts.trial} detail="On a trial plan" />
        <Kpi icon={<ShieldAlert className="h-5 w-5" />} color="amber" label="Suspended Organization" value={tabCounts.suspended} detail="Access suspended" />
        <Kpi icon={<Eye className="h-5 w-5" />} color="rose" label="Expiring Organizations" value={expiringCount} detail="Expiring in the next 30 days" />
      </div>

      {message && <div role={message.kind === "error" ? "alert" : "status"} className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${message.kind === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : message.kind === "warning" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}><span>{message.text}</span><button type="button" onClick={() => setMessage(null)} aria-label="Dismiss message"><X className="h-4 w-4" /></button></div>}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 px-3 pt-2">
            {organizationTabs.map((item) => (
              <button key={item.key} type="button" onClick={() => { setTab(item.key); setPage(0); }} className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-xs font-semibold transition ${tab === item.key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-900"}`}>
                {item.label}
                {item.key === "pending" && pendingCount > 0 && <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] text-white">{pendingCount}</span>}
              </button>
            ))}
          </nav>

          <div className="space-y-3 p-4">
            <div className="flex flex-wrap gap-2">
              <label className="flex h-10 min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 focus-within:border-blue-400">
                <Search className="h-4 w-4 shrink-0 text-slate-400" />
                <input value={searchInput} onChange={(event) => { setSearchInput(event.target.value); setPage(0); }} placeholder="Search organizations, owners, email..." className="min-w-0 flex-1 text-xs outline-none placeholder:text-slate-400" />
              </label>
              <SelectFilter label="All Plans" value={planFilter} onChange={(value) => { setPlanFilter(value); setPage(0); }}>
                <option value="">All Plans</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
              </SelectFilter>
              <SelectFilter label="All Countries" value={countryFilter} onChange={(value) => { setCountryFilter(value); setPage(0); }}>
                <option value="">All Countries</option>{countries.map((country) => <option key={country} value={country}>{country}</option>)}
              </SelectFilter>
              <SelectFilter label="All Statuses" value={statusFilter} onChange={(value) => { setStatusFilter(value); setPage(0); }}>
                <option value="">All Statuses</option>{organizationTabs.filter((item) => item.key !== "all" && item.key !== "read_only").map((item) => <option key={item.key} value={item.key === "pending" ? "pending" : item.key}>{item.label}</option>)}
              </SelectFilter>
              <SelectFilter label="Sort: Newest" value={sortBy} onChange={(value) => setSortBy(value as typeof sortBy)}>
                <option value="newest">Sort: Newest</option><option value="oldest">Sort: Oldest</option><option value="name">Sort: Name</option>
              </SelectFilter>
              <button type="button" onClick={clearFilters} className="inline-flex h-10 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Filter className="h-3.5 w-3.5" />Reset</button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>{["Organization", "Owner", "Email", "Phone", "Registered", "Status", "Actions"].map((heading) => <th key={heading} className="px-3 py-3 font-semibold">{heading}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageOrganizations.map((organization) => (
                    <tr key={organization.id} onClick={() => setSelectedId(organization.id)} className={`cursor-pointer transition hover:bg-blue-50/60 ${selectedId === organization.id ? "bg-blue-50/70" : ""}`}>
                      <td className="px-3 py-3"><div className="flex items-center gap-2.5"><OrganizationLogo key={`${organization.id}-${organization.logo_url ?? ""}`} name={organization.name} logoUrl={organization.logo_url} size="table" /><div><p className="max-w-[170px] truncate text-xs font-bold text-slate-900">{organization.name}</p><p className="mt-0.5 text-[10px] text-slate-500">{organization.business_type || organization.industry || "Organization"}</p></div></div></td>
                      <td className="px-3 py-3 text-xs text-slate-700">{organization.owner_name || "—"}</td>
                      <td className="px-3 py-3 text-xs text-slate-600">{organization.owner_email || "—"}</td>
                      <td className="px-3 py-3 text-xs text-slate-600">{organization.owner_phone || "—"}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-[10px] text-slate-600">{registrationTimestamp(organization.created_at)}</td>
                      <td className="px-3 py-3"><span className={`whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-semibold ring-1 ${statusStyle[organization.status]}`}>{statusLabel(organization)}</span></td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          {organization.status === "pending" && canManage
                            ? <button type="button" onClick={(event) => { event.stopPropagation(); setSelectedId(organization.id); setMobileDetailsOpen(true); }} className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[10px] font-bold text-blue-800">Review</button>
                            : <button type="button" onClick={(event) => { event.stopPropagation(); setSelectedId(organization.id); setMobileDetailsOpen(true); }} className="rounded-md border border-slate-200 px-2.5 py-1.5 text-[10px] font-semibold text-slate-700">View</button>}
                          <div className="relative">
                            <button type="button" aria-label="More organization actions" onClick={(event) => { event.stopPropagation(); setMoreActionsId(moreActionsId === organization.id ? null : organization.id); }} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"><MoreVertical className="h-4 w-4" /></button>
                            {moreActionsId === organization.id && <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
                              <MenuAction label="View details" onClick={() => { setSelectedId(organization.id); setMobileDetailsOpen(true); setMoreActionsId(null); }} />
                              <MenuAction label="Manage users" onClick={() => { setSelectedId(organization.id); setDetailTab("users"); setMobileDetailsOpen(true); setMoreActionsId(null); }} />
                              <MenuAction label="Manage branches" onClick={() => { setSelectedId(organization.id); setDetailTab("branches"); setMobileDetailsOpen(true); setMoreActionsId(null); }} />
                              <MenuAction label="View activity" onClick={() => { setSelectedId(organization.id); onOpenTab("Activity Logs", organization.organization_id); setMoreActionsId(null); }} />
                            </div>}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!pageOrganizations.length && <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">No organizations match the selected tab and filters.</td></tr>}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
              <span>Showing {filteredOrganizations.length ? currentPage * pageSize + 1 : 0}–{Math.min((currentPage + 1) * pageSize, filteredOrganizations.length)} of {filteredOrganizations.length} {tab === "pending" ? "pending registrations" : "organizations"}</span>
              <div className="flex items-center gap-1">
                <button type="button" disabled={currentPage === 0} onClick={() => setPage((value) => Math.max(0, value - 1))} aria-label="Previous page" className="rounded border border-slate-200 p-1.5 disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /></button>
                <span className="rounded bg-blue-600 px-2.5 py-1 text-xs font-bold text-white">{currentPage + 1}</span>
                <button type="button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} aria-label="Next page" className="rounded border border-slate-200 p-1.5 disabled:opacity-40"><ChevronRight className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          </div>
        </section>
        {detailsPanel(false)}
      </div>

      {mobileDetailsOpen && detailsPanel(true)}

      {dialog && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <section role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div><h2 className="text-lg font-bold text-slate-900">{dialog === "reject" ? "Reject registration" : "Request more information"}</h2><p className="mt-1 text-xs text-slate-500">{selected.name}</p></div>
              <button type="button" onClick={() => setDialog(null)} aria-label="Close dialog" className="rounded-lg p-1 text-slate-500"><X className="h-5 w-5" /></button>
            </div>
            <label htmlFor="registration-reason" className="mt-5 block text-xs font-semibold text-slate-700">{dialog === "reject" ? "Rejection reason (required)" : "Information requested (required)"}</label>
            <textarea id="registration-reason" autoFocus required maxLength={4000} value={dialogReason} onChange={(event) => setDialogReason(event.target.value)} rows={5} className="mt-2 w-full rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDialog(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700">Cancel</button>
              <button type="button" disabled={busy || !dialogReason.trim()} onClick={() => submitRegistrationDecision(dialog)} className={`rounded-lg px-4 py-2 text-xs font-bold text-white disabled:opacity-50 ${dialog === "reject" ? "bg-rose-600" : "bg-blue-600"}`}>{busy ? "Sending..." : dialog === "reject" ? "Reject registration" : "Send request"}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-2"><dt className="text-slate-500">{label}</dt><dd className="break-words text-right font-medium text-slate-800">{value}</dd></div>;
}

function OrganizationLogo({ name, logoUrl, size }: { name: string; logoUrl: string | null; size: "table" | "detail" }) {
  const [failed, setFailed] = useState(false);
  const sizeClass = size === "detail" ? "h-11 w-11 text-lg" : "h-9 w-9 text-xs";
  if (logoUrl && !failed) {
    return <Image src={logoUrl} alt={`${name} logo`} width={44} height={44} unoptimized onError={() => setFailed(true)} className={`${sizeClass} shrink-0 rounded-full border border-slate-200 bg-white object-contain p-1`} />;
  }
  const color = ["bg-blue-600", "bg-emerald-600", "bg-indigo-600", "bg-teal-600", "bg-amber-500"][name.charCodeAt(0) % 5];
  return <span className={`flex ${sizeClass} shrink-0 items-center justify-center rounded-full ${color} font-bold text-white`}>{name.slice(0, 1).toUpperCase()}</span>;
}

function Kpi({ icon, color, label, value, detail }: { icon: React.ReactNode; color: "blue" | "emerald" | "amber" | "rose" | "violet"; label: string; value: number; detail: string }) {
  const styles = {
    blue: "bg-blue-50 text-blue-700 ring-blue-100",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
    rose: "bg-rose-50 text-rose-700 ring-rose-100",
    violet: "bg-violet-50 text-violet-700 ring-violet-100",
  }[color];
  return <article className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${styles}`}>{icon}</div><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 text-2xl font-extrabold leading-none text-slate-900">{value}</p><p className="mt-1 text-[10px] text-slate-400">{detail}</p></div></article>;
}

function SelectFilter({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <div className="relative"><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="h-10 max-w-[145px] appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-7 text-xs text-slate-700 outline-none focus:border-blue-400">{children}</select><ChevronDown className="pointer-events-none absolute right-2 top-3 h-3.5 w-3.5 text-slate-400" /></div>;
}

function QuickAction({ label, icon, onClick, disabled = false }: { label: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button type="button" disabled={disabled} title={disabled ? "A secure impersonation feature is not available in this system." : undefined} onClick={onClick} className="mt-1.5 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45">{icon}{label}{disabled && <span className="ml-auto text-[9px]">Unavailable</span>}</button>;
}

function MenuAction({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="w-full rounded-md px-2.5 py-2 text-left text-xs text-slate-700 hover:bg-slate-50">{label}</button>;
}
