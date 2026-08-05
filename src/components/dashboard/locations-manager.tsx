"use client";

import { useRef, useState, useTransition } from "react";
import { MapPin, Plus, Star, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createLocation, deleteLocation, setPrimaryLocation, updateLocation } from "@/app/(dashboard)/settings/locations/actions";

export interface LocationRow {
  id: string;
  name: string;
  locationType: "warehouse" | "branch" | "store" | "distribution_center" | "mobile_van";
  address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  phone: string | null;
  isPrimary: boolean;
  isActive: boolean;
}

function formatAddress(loc: LocationRow) {
  return [loc.address, loc.city, loc.region, loc.country].filter(Boolean).join(", ") || "No address on file";
}

export function LocationsManager({ locations, canManage }: { locations: LocationRow[]; canManage: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createLocation(formData);
      if (result?.error) {
        setError(result.error);
      } else {
        formRef.current?.reset();
        setShowForm(false);
      }
    });
  }

  return (
    <div className="space-y-6">
      {canManage && (
        <div>
          {!showForm ? (
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" />
              Add location
            </Button>
          ) : (
            <form
              ref={formRef}
              action={handleCreate}
              className="space-y-4 rounded-card border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink-900 dark:text-white">New branch location</h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setError(null);
                  }}
                  className="rounded-md p-1 text-ledger-400 hover:bg-ledger-100 dark:hover:bg-white/[0.06]"
                  aria-label="Cancel"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-sm font-medium text-ledger-700 dark:text-ledger-200">Branch name *</label>
                  <Input name="name" required placeholder="e.g. Osu Branch, Warehouse 2" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-sm font-medium text-ledger-700 dark:text-ledger-200">Location type</label>
                  <select
                    name="location_type"
                    defaultValue="branch"
                    className="h-10 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                  >
                    <option value="warehouse">Warehouse</option>
                    <option value="branch">Branch</option>
                    <option value="store">Store</option>
                    <option value="distribution_center">Distribution Center</option>
                    <option value="mobile_van">Mobile Sales Van</option>
                  </select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-sm font-medium text-ledger-700 dark:text-ledger-200">Street address</label>
                  <Input name="address" placeholder="123 Independence Ave" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ledger-700 dark:text-ledger-200">City</label>
                  <Input name="city" placeholder="Accra" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ledger-700 dark:text-ledger-200">Region / State</label>
                  <Input name="region" placeholder="Greater Accra" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ledger-700 dark:text-ledger-200">Country</label>
                  <Input name="country" placeholder="Ghana" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ledger-700 dark:text-ledger-200">Phone</label>
                  <Input name="phone" type="tel" placeholder="+233 20 000 0000" />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-ledger-600 dark:text-ledger-300">
                <input type="checkbox" name="is_primary" className="h-4 w-4 rounded border-ledger-300" />
                Set as primary location
              </label>

              <div className="flex gap-2">
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Saving…" : "Save location"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      {error && <p className="rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{error}</p>}

      {locations.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-card border border-dashed border-ledger-200 text-center dark:border-ledger-700">
          <MapPin className="h-5 w-5 text-ledger-300" />
          <p className="text-sm text-ledger-400">No branches yet. Add your first location to get started.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <table className="w-full text-sm">
            <thead className="border-b border-ledger-100 text-left text-xs font-medium uppercase tracking-wide text-ledger-400 dark:border-ledger-700">
              <tr>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Status</th>
                {canManage && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {locations.map((loc) => (
                <tr key={loc.id} className="border-b border-ledger-50 last:border-0 dark:border-ledger-700/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink-900 dark:text-white">{loc.name}</span>
                      {loc.isPrimary && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-soft px-2 py-0.5 text-[11px] font-semibold text-amber">
                          <Star className="h-3 w-3 fill-current" />
                          Primary
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-ledger-100 px-2 py-0.5 text-xs capitalize text-ledger-600 dark:bg-white/[0.06] dark:text-ledger-300">
                      {loc.locationType.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ledger-500 dark:text-ledger-400">{formatAddress(loc)}</td>
                  <td className="px-4 py-3 text-ledger-500 dark:text-ledger-400">{loc.phone ?? "—"}</td>
                  <td className="px-4 py-3">
                    {canManage ? (
                      <button
                        onClick={() =>
                          startTransition(() => {
                            updateLocation(loc.id, { is_active: !loc.isActive });
                          })
                        }
                        className={
                          loc.isActive
                            ? "rounded-full bg-signal-soft px-2 py-0.5 text-xs font-semibold text-signal"
                            : "rounded-full bg-ledger-100 px-2 py-0.5 text-xs font-semibold text-ledger-500 dark:bg-white/[0.06]"
                        }
                      >
                        {loc.isActive ? "Active" : "Inactive"}
                      </button>
                    ) : (
                      <span className="capitalize text-ledger-500 dark:text-ledger-400">
                        {loc.isActive ? "Active" : "Inactive"}
                      </span>
                    )}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {!loc.isPrimary && (
                          <button
                            onClick={() =>
                              startTransition(() => {
                                setPrimaryLocation(loc.id);
                              })
                            }
                            className="text-xs font-medium text-ledger-500 hover:text-ink-900 hover:underline dark:text-ledger-400 dark:hover:text-white"
                          >
                            Make primary
                          </button>
                        )}
                        <button
                          onClick={() =>
                            startTransition(() => {
                              deleteLocation(loc.id);
                            })
                          }
                          className="text-ledger-400 hover:text-alert"
                          aria-label={`Remove ${loc.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}