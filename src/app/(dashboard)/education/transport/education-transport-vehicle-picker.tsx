"use client";

import { useEffect, useState } from "react";

type VehicleOption = { id: string; registration_number: string; make_model: string; capacity: number };

export function EducationTransportVehiclePicker({ branchId }: { branchId: string }) {
  const [search, setSearch] = useState("");
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const query = search.trim();
    if (query.length < 2 || !branchId) {
      setVehicles([]);
      setSelectedVehicle("");
      setError("");
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ branch: branchId, search: query });
      try {
        const response = await fetch(`/api/education/transport/active-vehicles?${params}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const result = await response.json() as { vehicles?: VehicleOption[]; error?: string };
        if (!response.ok) throw new Error(result.error || "Could not search active vehicles.");
        setVehicles(result.vehicles ?? []);
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setVehicles([]);
        setError(requestError instanceof Error ? requestError.message : "Could not search active vehicles.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [branchId, search]);

  return <div className="space-y-2">
    <label className="block text-sm font-medium text-slate-700" htmlFor="transport-vehicle-search">Find active vehicle
      <input
        id="transport-vehicle-search"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setSelectedVehicle("");
          setVehicles([]);
        }}
        autoComplete="off"
        placeholder="Search registration or make / model"
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
      />
    </label>
    <select
      required
      name="vehicle_id"
      value={selectedVehicle}
      onChange={(event) => setSelectedVehicle(event.target.value)}
      className="w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
    >
      <option value="" disabled>{loading ? "Searching..." : "Select a matching vehicle"}</option>
      {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>
        {vehicle.registration_number} · {vehicle.make_model} · {vehicle.capacity} seats
      </option>)}
    </select>
    {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
    {!loading && !error && search.trim().length >= 2 && vehicles.length === 0 && <p className="text-xs text-slate-500">No active vehicles match that search.</p>}
    {search.trim().length < 2 && <p className="text-xs text-slate-500">Enter at least two characters to find a vehicle.</p>}
  </div>;
}
