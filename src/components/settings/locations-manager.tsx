"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Plus,
  Search,
  Pencil,
  MoreVertical,
  Building2,
  CheckCircle2,
  XCircle,
  Star,
  X,
  Filter
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  createLocation,
  updateLocation,
  setPrimaryLocation,
  deleteLocation,
  getLocationStats,
  type LocationStats
} from "@/app/(dashboard)/settings/locations/actions";
import type { LocationType } from "@/types/database";

export interface LocationRow {
  id: string;
  name: string;
  code: string | null;
  locationType: LocationType;
  managerName: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
  isActive: boolean;
  createdAt: string;
}

const TYPE_LABELS: Record<LocationType, string> = {
  warehouse: "Warehouse",
  branch: "Branch",
  store: "Store",
  distribution_center: "Distribution Center",
  mobile_van: "Mobile Sales Van"
};

function formatAddress(loc: LocationRow) {
  return [loc.city, loc.region].filter(Boolean).join(", ") || "No address on file";
}

function formatMoney(value: number) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function LocationsManager({
  locations,
  canManage,
  orgName
}: {
  locations: LocationRow[];
  canManage: boolean;
  orgName: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | LocationType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [selectedId, setSelectedId] = useState<string | null>(locations[0]?.id ?? null);
  const [stats, setStats] = useState<LocationStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingLocation, setEditingLocation] = useState<LocationRow | null>(null);

  const selected = locations.find((l) => l.id === selectedId) ?? null;

  const totalActive = locations.filter((l) => l.isActive).length;
  const totalInactive = locations.length - totalActive;
  const primary = locations.find((l) => l.isPrimary);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return locations.filter((l) => {
      if (typeFilter !== "all" && l.locationType !== typeFilter) return false;
      if (statusFilter === "active" && !l.isActive) return false;
      if (statusFilter === "inactive" && l.isActive) return false;
      if (q && !l.name.toLowerCase().includes(q) && !(l.code ?? "").toLowerCase().includes(q) && !(l.managerName ?? "").toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [locations, search, typeFilter, statusFilter]);

  function selectLocation(loc: LocationRow) {
    setSelectedId(loc.id);
    setStats(null);
    setLoadingStats(true);
    getLocationStats(loc.id)
      .then(setStats)
      .finally(() => setLoadingStats(false));
  }

  function handleFormSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      if (editingLocation) {
        const isPrimary = formData.get("is_primary") === "on";
        const result = await updateLocation(editingLocation.id, {
          name: String(formData.get("name") ?? "").trim(),
          code: String(formData.get("code") ?? "").trim().toUpperCase() || null,
          location_type: String(formData.get("location_type") ?? "branch") as LocationType,
          manager_name: String(formData.get("manager_name") ?? "").trim() || null,
          address: String(formData.get("address") ?? "").trim() || null,
          city: String(formData.get("city") ?? "").trim() || null,
          region: String(formData.get("region") ?? "").trim() || null,
          country: String(formData.get("country") ?? "").trim() || null,
          phone: String(formData.get("phone") ?? "").trim() || null,
          email: String(formData.get("email") ?? "").trim() || null,
        });
        if (result?.error) {
          setError(result.error);
          return;
        }
        // updateLocation doesn't unset other locations' primary flag the
        // way createLocation does, so that's handled as its own step here.
        if (isPrimary && !editingLocation.isPrimary) {
          const primaryResult = await setPrimaryLocation(editingLocation.id);
          if (primaryResult?.error) {
            setError(primaryResult.error);
            return;
          }
        }
        setShowForm(false);
        setEditingLocation(null);
      } else {
        const result = await createLocation(formData);
        if (result?.error) setError(result.error);
        else setShowForm(false);
      }
    });
  }

  function handleToggleActive(loc: LocationRow) {
    startTransition(async () => {
      const result = await updateLocation(loc.id, { is_active: !loc.isActive });
      if (result?.error) setError(result.error);
    });
  }

  function handleDelete(loc: LocationRow) {
    if (!confirm(`Delete "${loc.name}"? This can't be undone.`)) return;
    startTransition(async () => {
      const result = await deleteLocation(loc.id);
      if (result?.error) setError(result.error);
      else if (selectedId === loc.id) setSelectedId(null);
    });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs text-ledger-400">Settings &gt; Locations</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-white">Locations / Warehouses</h1>
          <p className="text-sm text-ledger-500 dark:text-ledger-400">Manage all your business locations and warehouses.</p>
        </div>
        {canManage && (
          <Button onClick={() => { setEditingLocation(null); setShowForm((s) => !s); }}>
            <Plus className="h-3.5 w-3.5" />
            Add location
          </Button>
        )}
      </div>

      {error && (
        <p className="flex items-center justify-between rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">
          {error}
          <button onClick={() => setError(null)} aria-label="Dismiss">
            <X className="h-3.5 w-3.5" />
          </button>
        </p>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-card border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <p className="text-xs text-ledger-400">Total locations</p>
          <p className="figure mt-1 text-xl font-semibold text-ink-900 dark:text-white">{locations.length}</p>
          <p className="text-[11px] text-ledger-400">All locations</p>
        </div>
        <div className="rounded-card border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <p className="text-xs text-ledger-400">Active locations</p>
          <p className="figure mt-1 text-xl font-semibold text-signal">{totalActive}</p>
          <p className="text-[11px] text-ledger-400">Currently active</p>
        </div>
        <div className="rounded-card border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <p className="text-xs text-ledger-400">Inactive locations</p>
          <p className="figure mt-1 text-xl font-semibold text-alert">{totalInactive}</p>
          <p className="text-[11px] text-ledger-400">Currently inactive</p>
        </div>
        <div className="rounded-card border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <p className="text-xs text-ledger-400">Main location</p>
          <p className="mt-1 truncate text-sm font-semibold text-ink-900 dark:text-white">{primary?.name ?? "Not set"}</p>
          <p className="text-[11px] text-ledger-400">Primary location</p>
        </div>
      </div>

      {showForm && canManage && (
        <form
          key={editingLocation?.id ?? "new"}
          action={handleFormSubmit}
          className="space-y-3 rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink-900 dark:text-white">
              {editingLocation ? `Edit ${editingLocation.name}` : "New location"}
            </h3>
            <button type="button" onClick={() => { setShowForm(false); setEditingLocation(null); }} aria-label="Cancel">
              <X className="h-4 w-4 text-ledger-400" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input name="name" required placeholder="Location name *" defaultValue={editingLocation?.name ?? ""} />
            <Input name="code" placeholder="Code (e.g. MAIN)" className="uppercase" defaultValue={editingLocation?.code ?? ""} />
            <select
              name="location_type"
              defaultValue={editingLocation?.locationType ?? "branch"}
              className="h-10 rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
            >
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <Input name="manager_name" placeholder="Manager name" defaultValue={editingLocation?.managerName ?? ""} />
            <Input name="phone" type="tel" placeholder="Phone" defaultValue={editingLocation?.phone ?? ""} />
            <Input name="email" type="email" placeholder="Email" defaultValue={editingLocation?.email ?? ""} />
            <Input name="address" placeholder="Street address" className="sm:col-span-3" defaultValue={editingLocation?.address ?? ""} />
            <Input name="city" placeholder="City" defaultValue={editingLocation?.city ?? ""} />
            <Input name="region" placeholder="Region / State" defaultValue={editingLocation?.region ?? ""} />
            <Input name="country" placeholder="Country" defaultValue={editingLocation?.country ?? ""} />
          </div>
          <label className="flex items-center gap-2 text-sm text-ledger-600 dark:text-ledger-300">
            <input type="checkbox" name="is_primary" className="h-4 w-4 rounded border-ledger-300" defaultChecked={editingLocation?.isPrimary ?? false} />
            Set as primary location
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : editingLocation ? "Save changes" : "Save location"}
            </Button>
            <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditingLocation(null); }}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-ledger-100 bg-white p-3 shadow-card dark:border-ledger-700 dark:bg-ink-900">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ledger-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search locations…"
            className="h-9 w-full rounded-md border border-ledger-200 bg-white pl-9 pr-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
          />
        </div>
        <div className="flex items-center gap-1 text-ledger-400">
          <Filter className="h-3.5 w-3.5" />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as "all" | LocationType)}
          className="h-9 rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
        >
          <option value="all">All types</option>
          {Object.entries(TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
          className="h-9 rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Table */}
        <div className="lg:col-span-2">
          {filtered.length === 0 ? (
            <div className="rounded-card border border-dashed border-ledger-200 bg-white p-10 text-center dark:border-ledger-700 dark:bg-ink-900">
              <p className="text-sm text-ledger-500 dark:text-ledger-400">No locations match these filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-card border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
              <table className="w-full text-sm">
                <thead className="border-b border-ledger-100 text-left text-xs font-medium uppercase tracking-wide text-ledger-400 dark:border-ledger-700">
                  <tr>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-2 py-3">Code</th>
                    <th className="px-2 py-3">Type</th>
                    <th className="px-2 py-3">Manager</th>
                    <th className="px-2 py-3">Phone</th>
                    <th className="px-2 py-3">Status</th>
                    {canManage && <th className="px-2 py-3 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((loc) => (
                    <tr
                      key={loc.id}
                      onClick={() => selectLocation(loc)}
                      className={cn(
                        "cursor-pointer border-b border-ledger-50 last:border-0 dark:border-ledger-700/50",
                        selectedId === loc.id ? "bg-signal-soft/40" : "hover:bg-ledger-50 dark:hover:bg-white/[0.03]"
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-ink-900 dark:text-white">{loc.name}</span>
                          {loc.isPrimary && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-soft px-2 py-0.5 text-[10px] font-semibold text-amber">
                              <Star className="h-2.5 w-2.5 fill-current" /> Primary
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-ledger-400">{formatAddress(loc)}</p>
                      </td>
                      <td className="px-2 py-3 font-mono text-xs text-ledger-500 dark:text-ledger-400">{loc.code ?? "—"}</td>
                      <td className="px-2 py-3 text-ledger-600 dark:text-ledger-300">{TYPE_LABELS[loc.locationType]}</td>
                      <td className="px-2 py-3 text-ledger-600 dark:text-ledger-300">{loc.managerName ?? "—"}</td>
                      <td className="px-2 py-3 text-ledger-600 dark:text-ledger-300">{loc.phone ?? "—"}</td>
                      <td className="px-2 py-3">
                        {loc.isActive ? (
                          <span className="rounded-full bg-signal-soft px-2 py-0.5 text-xs font-semibold text-signal">Active</span>
                        ) : (
                          <span className="rounded-full bg-alert-soft px-2 py-0.5 text-xs font-semibold text-alert">Inactive</span>
                        )}
                      </td>
                      {canManage && (
                        <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="relative flex items-center justify-end gap-1">
                            <button
                              onClick={() => { selectLocation(loc); setEditingLocation(loc); setShowForm(true); }}
                              className="rounded-md p-1.5 text-ledger-400 hover:bg-ledger-100 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white"
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setOpenMenuId(openMenuId === loc.id ? null : loc.id)}
                              className="rounded-md p-1.5 text-ledger-400 hover:bg-ledger-100 dark:hover:bg-white/[0.06]"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                            {openMenuId === loc.id && (
                              <div className="absolute right-0 top-8 z-10 w-44 rounded-md border border-ledger-100 bg-white py-1 shadow-card-hover dark:border-ledger-700 dark:bg-ink-900">
                                {!loc.isPrimary && (
                                  <button
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      startTransition(async () => {
                                        const result = await setPrimaryLocation(loc.id);
                                        if (result?.error) setError(result.error);
                                      });
                                    }}
                                    className="block w-full px-3 py-2 text-left text-xs text-ledger-600 hover:bg-ledger-50 dark:text-ledger-300 dark:hover:bg-white/[0.06]"
                                  >
                                    Set as primary
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    handleToggleActive(loc);
                                  }}
                                  className="block w-full px-3 py-2 text-left text-xs text-ledger-600 hover:bg-ledger-50 dark:text-ledger-300 dark:hover:bg-white/[0.06]"
                                >
                                  {loc.isActive ? "Deactivate" : "Activate"}
                                </button>
                                <button
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    handleDelete(loc);
                                  }}
                                  className="block w-full px-3 py-2 text-left text-xs text-alert hover:bg-alert-soft"
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-ledger-100 px-4 py-2 text-xs text-ledger-400 dark:border-ledger-700">
                Showing {filtered.length} of {locations.length} locations
              </p>
            </div>
          )}
        </div>

        {/* Details panel */}
        <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <h3 className="text-sm font-semibold text-ink-900 dark:text-white">Location details</h3>
          {!selected ? (
            <p className="mt-3 text-sm text-ledger-400">Select a location to see its details.</p>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-signal-soft text-signal">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="flex items-center gap-1.5 font-medium text-ink-900 dark:text-white">
                    {selected.name}
                    {selected.isPrimary && <span className="rounded-full bg-amber-soft px-1.5 py-0.5 text-[10px] font-semibold text-amber">Primary</span>}
                  </p>
                  <p className="text-xs text-ledger-400">{formatAddress(selected)}</p>
                </div>
              </div>

              <dl className="space-y-2 border-t border-ledger-100 pt-3 text-sm dark:border-ledger-700">
                <Detail label="Location code" value={selected.code ?? "—"} />
                <Detail label="Location type" value={TYPE_LABELS[selected.locationType]} />
                <Detail label="Manager" value={selected.managerName ?? "—"} />
                <Detail label="Phone" value={selected.phone ?? "—"} />
                <Detail label="Email" value={selected.email ?? "—"} />
                <Detail label="Address" value={[selected.address, selected.city, selected.region, selected.country].filter(Boolean).join(", ") || "—"} />
                <Detail
                  label="Status"
                  value={
                    selected.isActive ? (
                      <span className="flex items-center gap-1 text-signal">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Active
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-alert">
                        <XCircle className="h-3.5 w-3.5" /> Inactive
                      </span>
                    )
                  }
                />
                <Detail label="Created" value={new Date(selected.createdAt).toLocaleDateString()} />
              </dl>

              <div className="border-t border-ledger-100 pt-3 dark:border-ledger-700">
                <p className="text-xs font-semibold uppercase tracking-wide text-ledger-400">Inventory at this location</p>
                {loadingStats ? (
                  <p className="mt-2 text-sm text-ledger-400">Loading…</p>
                ) : (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="rounded-md bg-ledger-50 p-2.5 dark:bg-white/[0.04]">
                      <p className="figure text-lg font-semibold text-ink-900 dark:text-white">{stats?.stockQuantity ?? 0}</p>
                      <p className="text-[11px] text-ledger-400">Units in stock</p>
                    </div>
                    <div className="rounded-md bg-ledger-50 p-2.5 dark:bg-white/[0.04]">
                      <p className="figure text-lg font-semibold text-ink-900 dark:text-white">${formatMoney(stats?.inventoryValue ?? 0)}</p>
                      <p className="text-[11px] text-ledger-400">Inventory value</p>
                    </div>
                  </div>
                )}
              </div>

              {canManage && (
                <div className="flex gap-2 border-t border-ledger-100 pt-3 dark:border-ledger-700">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => { setEditingLocation(selected); setShowForm(true); }}>
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant={selected.isActive ? "destructive" : "primary"}
                    className="flex-1"
                    onClick={() => handleToggleActive(selected)}
                  >
                    {selected.isActive ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ledger-500 dark:text-ledger-400">{label}</dt>
      <dd className="text-right text-ink-900 dark:text-white">{value}</dd>
    </div>
  );
}