"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { CalendarDays, CheckCircle2, DollarSign, Edit3, Plus, Route as RouteIcon, Trash2, X, type LucideIcon } from "lucide-react";
import { formatMoney } from "@/lib/currency";
import {
  assignRouteRep,
  createMobileOrder,
  createRoute,
  deleteRoute,
  recordRouteCollection,
  scheduleRouteVisit,
  updateMobileOrderStatus,
  updateRoute,
  updateVisitStatus,
} from "@/app/(dashboard)/route-sales/actions";

type RouteRow = { id: string; name: string; territory: string | null; vehicle: string | null; status: string; route_days: string[]; start_time: string | null; end_time: string | null; assigned_rep_id: string | null; notes?: string | null };
type Customer = { id: string; name: string; company: string | null; phone: string | null; email: string | null };
type Visit = { id: string; route_id: string; customer_id: string; visit_date: string; status: string; sequence_no: number };
type Collection = { id: string; route_id: string | null; customer_id: string; outstanding_amount: number; amount_collected: number; collection_date: string; payment_method: string };
type Product = { id: string; name: string; sku?: string | null; unit_price?: number | null };
type MobileOrder = { id: string; customer_id: string; route_id: string | null; status: string; total: number; price_level: string; offline_created: boolean; created_at: string };
type InitialData = { routes: RouteRow[]; customers: Customer[]; visits: Visit[]; collections: Collection[]; sales: Array<{ total: number; created_at: string; customer_name: string | null; status: string }>; locations: Array<{ id: string; name: string }>; reps: Array<{ id: string; full_name: string | null }>; products: Product[]; mobileOrders: MobileOrder[] };
type RouteStop = { id: string; label: string; customerId?: string; status: "Completed" | "In Progress" | "Missed" | "Scheduled"; lat: number; lng: number };

const workspaceTabs = ["Dashboard", "Routes", "Customers", "Field Sales Reps", "Collections", "Mobile Orders", "Route Reports"] as const;
const detailTabs = ["Details", "Customers", "Schedule", "Collections", "Performance", "Notes", "Attachments"] as const;
const money = (n: number, currency: string) => formatMoney(n, currency);
const inputClass = "h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs dark:border-slate-700 dark:bg-ink-900";

const liveRouteStops: RouteStop[] = [
  { id: "hub", label: "Depot", status: "Scheduled", lat: 5.6037, lng: -0.187 },
  { id: "osu", label: "Osu Market", status: "Completed", lat: 5.5579, lng: -0.1929 },
  { id: "labone", label: "Labone", status: "In Progress", lat: 5.573, lng: -0.1748 },
  { id: "airport", label: "Airport West", status: "Scheduled", lat: 5.5575, lng: -0.163 },
  { id: "east-legon", label: "East Legon", status: "Missed", lat: 5.6504, lng: -0.1711 },
];

const statusColors: Record<RouteStop["status"], string> = {
  Completed: "#22c55e",
  "In Progress": "#f59e0b",
  Missed: "#ef4444",
  Scheduled: "#3b82f6",
};

const markerIcon = (color: string) =>
  L.divIcon({
    className: "route-sales-map-marker",
    html: `<span style="display:block; width:16px; height:16px; border-radius:9999px; background:${color}; border:2px solid white; box-shadow:0 0 0 4px rgba(148,163,184,0.2);"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

function LiveRouteMap({ selectedRouteName, routes }: { selectedRouteName?: string | null; routes: RouteRow[] }) {
  const [repLocation, setRepLocation] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (position) => setRepLocation([position.coords.latitude, position.coords.longitude]),
      () => setRepLocation(null),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const stops = useMemo<RouteStop[]>(() => {
    if (!routes.length) return liveRouteStops;
    const match = routes.find((route) => route.name === selectedRouteName) ?? routes[0];
    if (!match) return liveRouteStops;
    return liveRouteStops.map((stop, index) => ({
      ...stop,
      label: `${match.name} · ${stop.label}`,
      status: index === 2 ? "In Progress" : index === 4 ? "Missed" : [0, 1, 3].includes(index) ? "Completed" : "Scheduled",
    }));
  }, [routes, selectedRouteName]);

  const center: [number, number] = repLocation ?? [stops[0].lat, stops[0].lng];
  const polyline = stops.map((point) => [point.lat, point.lng] as [number, number]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-ink-900">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Live Route Map</p>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{selectedRouteName ?? "Active route"}</h3>
        </div>
        <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700">
          {repLocation ? "GPS live" : "Demo mode"}
        </span>
      </div>
      <div className="h-[340px] w-full">
        <MapContainer center={center} zoom={12} scrollWheelZoom className="h-full w-full">
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Polyline positions={polyline} pathOptions={{ color: "#3b82f6", weight: 4, opacity: 0.8, dashArray: "10 10" }} />
          {stops.map((stop) => (
            <Marker key={stop.id} position={[stop.lat, stop.lng]} icon={markerIcon(statusColors[stop.status])}>
              <Popup>
                <div className="space-y-1 text-xs">
                  <p className="font-semibold">{stop.label}</p>
                  <p>Status: {stop.status}</p>
                </div>
              </Popup>
            </Marker>
          ))}
          {repLocation && (
            <Marker position={repLocation} icon={markerIcon("#0ea5e9")}>
              <Popup>
                <div className="text-xs">
                  <p className="font-semibold">Field rep current location</p>
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>
      </div>
    </div>
  );
}

export default function RouteSalesWorkspace({ initial, currency }: { orgId: string; currency: string; initial: InitialData }) {
  const [tab, setTab] = useState<typeof workspaceTabs[number]>("Dashboard");
  const [detailTab, setDetailTab] = useState<typeof detailTabs[number]>("Details");
  const [selectedId, setSelectedId] = useState<string | null>(initial.routes[0]?.id ?? null);
  const [routes, setRoutes] = useState(initial.routes);
  const [visits, setVisits] = useState(initial.visits);
  const [notice, setNotice] = useState("");
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RouteRow | null>(null);
  const [form, setForm] = useState({ name: "", territory: "", vehicle: "", startTime: "08:00", endTime: "17:00", notes: "", routeDays: ["Monday"], assignedRepId: "" });
  const [schedule, setSchedule] = useState({ customerId: "", visitDate: new Date().toISOString().slice(0, 10), sequenceNo: "1" });
  const [collection, setCollection] = useState({ customerId: "", outstanding: "", amount: "", paymentMethod: "Cash" });
  const [order, setOrder] = useState({ customerId: "", routeId: "", priceLevel: "Retail", productId: "", quantity: "1", unitPrice: "", discount: "0", offlineCreated: false });
  const [mobileOrders, setMobileOrders] = useState(initial.mobileOrders);

  const selected = routes.find((r) => r.id === selectedId) ?? routes[0] ?? null;
  const customerName = (id: string) => initial.customers.find((c) => c.id === id)?.name ?? "Customer";
  const repName = (id: string | null) => initial.reps.find((r) => r.id === id)?.full_name ?? "Unassigned";
  const notify = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(""), 4000); };

  const run = (work: () => Promise<{ error?: string }>, success: string, after?: () => void) =>
    startTransition(async () => {
      const result = await work();
      notify(result.error ?? success);
      if (!result.error) after?.();
    });

  const openNew = () => { setEditing(null); setForm({ name: "", territory: "", vehicle: "", startTime: "08:00", endTime: "17:00", notes: "", routeDays: ["Monday"], assignedRepId: "" }); setShowForm(true); };
  const openEdit = (route: RouteRow) => { setEditing(route); setForm({ name: route.name, territory: route.territory ?? "", vehicle: route.vehicle ?? "", startTime: route.start_time ?? "08:00", endTime: route.end_time ?? "17:00", notes: route.notes ?? "", routeDays: route.route_days ?? [], assignedRepId: route.assigned_rep_id ?? "" }); setShowForm(true); };
  const saveRoute = () => {
    if (!form.name.trim()) return notify("Enter a route name.");
    run(() => (editing ? updateRoute(editing.id, form) : createRoute(form)), editing ? "Route updated." : "Route created.", () => { setShowForm(false); window.location.reload(); });
  };
  const scheduleVisit = () => {
    if (!selected || !schedule.customerId) return notify("Select a customer and route date.");
    run(() => scheduleRouteVisit({ routeId: selected.id, customerId: schedule.customerId, visitDate: schedule.visitDate, sequenceNo: Number(schedule.sequenceNo) || 1 }), "Visit scheduled.", () => window.location.reload());
  };
  const recordCollection = () => {
    if (!collection.customerId || !collection.amount) return notify("Select a customer and enter an amount.");
    run(() => recordRouteCollection({ customerId: collection.customerId, routeId: selected?.id, outstanding: Number(collection.outstanding) || 0, amount: Number(collection.amount), paymentMethod: collection.paymentMethod }), "Collection recorded.", () => window.location.reload());
  };
  const saveMobileOrder = () => {
    if (!order.customerId || !order.productId) return notify("Select a customer and product.");
    run(() => createMobileOrder({ customerId: order.customerId, routeId: order.routeId || undefined, priceLevel: order.priceLevel, offlineCreated: order.offlineCreated, items: [{ productId: order.productId, quantity: Number(order.quantity) || 1, unitPrice: Number(order.unitPrice) || Number(initial.products.find((p) => p.id === order.productId)?.unit_price || 0), discount: Number(order.discount) || 0 }] }), "Mobile order saved.", () => window.location.reload());
  };

  const reportSales = initial.sales.reduce((n, sale) => n + Number(sale.total || 0), 0);
  const reportVisits = visits.length;
  const reportCompleted = visits.filter((v) => v.status === "Completed").length;
  const reportMissed = visits.filter((v) => v.status === "Missed" || (v.visit_date < new Date().toISOString().slice(0, 10) && v.status === "Scheduled")).length;
  const reportCollections = initial.collections.reduce((n, c) => n + Number(c.amount_collected || 0), 0);
  const routeVisits = selected ? visits.filter((v) => v.route_id === selected.id) : [];
  const routeCollections = selected ? initial.collections.filter((c) => c.route_id === selected.id) : initial.collections;
  const totalCollections = initial.collections.reduce((n, c) => n + Number(c.amount_collected || 0), 0);

  return (
    <div className="space-y-5">
      {notice && (
        <button onClick={() => setNotice("")} className="w-full rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-left text-xs text-blue-800">
          {notice}
          <X className="float-right h-4 w-4" />
        </button>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">Sales · Route Operations</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">Route Sales Management</h1>
          <p className="mt-1 text-sm text-slate-500">Manage routes, visits, field reps and collections.</p>
        </div>
        <button onClick={openNew} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white">
          <Plus className="mr-1 inline h-4 w-4" /> Create Route
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-ink-900">
        {workspaceTabs.map((item) => (
          <button key={item} onClick={() => setTab(item)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold ${tab === item ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}>
            {item}
          </button>
        ))}
      </div>

      {tab === "Dashboard" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {([
              { label: "Routes", value: routes.length, icon: RouteIcon },
              { label: "Completed Visits", value: visits.filter((v) => v.status === "Completed").length, icon: CheckCircle2 },
              { label: "Scheduled Visits", value: visits.filter((v) => v.status === "Scheduled").length, icon: CalendarDays },
              { label: "Collections", value: money(totalCollections, currency), icon: DollarSign },
            ] as Array<{ label: string; value: string | number; icon: LucideIcon }>).map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-ink-900">
                <Icon className="h-5 w-5 text-blue-600" />
                <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
                <p className="mt-1 text-xl font-bold">{String(value)}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.8fr_0.8fr]">
            <LiveRouteMap selectedRouteName={selected?.name} routes={routes} />
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-ink-900">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Route performance</p>
                <div className="mt-4 space-y-3 text-sm text-slate-700 dark:text-slate-200">
                  <div className="flex items-center justify-between"><span>Customers assigned</span><span className="font-semibold">{initial.customers.length}</span></div>
                  <div className="flex items-center justify-between"><span>Customers visited</span><span className="font-semibold">{reportCompleted}</span></div>
                  <div className="flex items-center justify-between"><span>Completion %</span><span className="font-semibold">{reportVisits ? `${Math.round((reportCompleted / reportVisits) * 100)}%` : "0%"}</span></div>
                  <div className="flex items-center justify-between"><span>Sales generated</span><span className="font-semibold">{money(reportSales, currency)}</span></div>
                  <div className="flex items-center justify-between"><span>Collections received</span><span className="font-semibold">{money(reportCollections, currency)}</span></div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-ink-900">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Quick actions</p>
                <div className="mt-3 grid gap-2 text-xs">
                  { ["Create Route", "Add Customer", "Assign Rep", "Record Collection", "Create Mobile Order", "View Route Report"].map((action) => (
                    <button key={action} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left hover:border-blue-200 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900">{action}</button>
                  )) }
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {tab === "Routes" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-ink-900">
          <h2 className="mb-4 font-bold">Routes</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {routes.map((route) => (
              <button key={route.id} onClick={() => { setSelectedId(route.id); setDetailTab("Details"); }} className={`rounded-xl border p-4 text-left ${selectedId === route.id ? "border-blue-500 ring-1 ring-blue-500" : "border-slate-200 dark:border-slate-700"}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{route.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{route.territory || "No territory"} · {route.vehicle || "No vehicle"}</p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] text-emerald-700">{route.status}</span>
                </div>
                <p className="mt-3 text-xs text-slate-500">Rep: {repName(route.assigned_rep_id)}</p>
                <div className="mt-3 flex gap-2">
                  <span onClick={(e) => { e.stopPropagation(); openEdit(route); }} className="rounded-lg border px-2 py-1 text-[11px]"><Edit3 className="mr-1 inline h-3 w-3" /> Edit</span>
                  <span onClick={(e) => { e.stopPropagation(); if (confirm("Delete this route and its visits?")) run(() => deleteRoute(route.id), "Route deleted.", () => setRoutes((current) => current.filter((r) => r.id !== route.id))); }} className="rounded-lg border px-2 py-1 text-[11px] text-red-600"><Trash2 className="mr-1 inline h-3 w-3" /> Delete</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {tab === "Customers" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-ink-900">
          <h2 className="mb-4 font-bold">Assign customers to routes</h2>
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <select className={inputClass} value={schedule.customerId} onChange={(e) => setSchedule({ ...schedule, customerId: e.target.value })}><option value="">Select customer</option>{initial.customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.company ? ` · ${c.company}` : ""}</option>)}</select>
            <select className={inputClass} value={selectedId ?? ""} onChange={(e) => setSelectedId(e.target.value)}><option value="">Select route</option>{routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
            <button onClick={() => selectedId && scheduleRouteVisit({ routeId: selectedId, customerId: schedule.customerId, visitDate: schedule.visitDate }).then((r) => { notify(r.error ?? "Customer assigned."); if (!r.error) window.location.reload(); })} className="rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white">Assign</button>
          </div>
        </section>
      )}

      {tab === "Field Sales Reps" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-ink-900">
          <h2 className="mb-4 font-bold">Assign field sales reps</h2>
          <div className="space-y-3">{routes.map((r) => <div key={r.id} className="grid items-center gap-3 md:grid-cols-[1fr_1fr]"><span className="text-sm font-medium">{r.name}</span><select className={inputClass} value={r.assigned_rep_id ?? ""} onChange={(e) => run(() => assignRouteRep(r.id, e.target.value || null), "Rep assigned.", () => setRoutes((current) => current.map((x) => x.id === r.id ? { ...x, assigned_rep_id: e.target.value || null } : x)))}><option value="">Unassigned</option>{initial.reps.map((rep) => <option key={rep.id} value={rep.id}>{rep.full_name || "Unnamed rep"}</option>)}</select></div>)}</div>
        </section>
      )}

      {tab === "Collections" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-ink-900">
          <h2 className="mb-4 font-bold">Record collection</h2>
          <div className="grid gap-3 md:grid-cols-4"><select className={inputClass} value={collection.customerId} onChange={(e) => setCollection({ ...collection, customerId: e.target.value })}><option value="">Customer</option>{initial.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><input className={inputClass} placeholder="Outstanding" type="number" value={collection.outstanding} onChange={(e) => setCollection({ ...collection, outstanding: e.target.value })} /><input className={inputClass} placeholder="Amount collected" type="number" value={collection.amount} onChange={(e) => setCollection({ ...collection, amount: e.target.value })} /><button onClick={recordCollection} className="rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white">Record</button></div>
          <CollectionTable collections={initial.collections} customerName={customerName} currency={currency} />
        </section>
      )}

      {tab === "Mobile Orders" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-ink-900">
          <h2 className="mb-4 font-bold">Mobile Orders</h2>
          <div className="grid gap-3 md:grid-cols-4"><select className={inputClass} value={order.customerId} onChange={(e) => setOrder({ ...order, customerId: e.target.value })}><option value="">Select customer</option>{initial.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><select className={inputClass} value={order.productId} onChange={(e) => setOrder({ ...order, productId: e.target.value, unitPrice: String(initial.products.find((p) => p.id === e.target.value)?.unit_price ?? "") })}><option value="">Select product</option>{initial.products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ""}</option>)}</select><input className={inputClass} type="number" min="1" placeholder="Quantity" value={order.quantity} onChange={(e) => setOrder({ ...order, quantity: e.target.value })} /><select className={inputClass} value={order.priceLevel} onChange={(e) => setOrder({ ...order, priceLevel: e.target.value })}><option>Retail</option><option>Wholesale</option><option>Distributor</option></select><input className={inputClass} type="number" min="0" step="0.01" placeholder="Unit price" value={order.unitPrice} onChange={(e) => setOrder({ ...order, unitPrice: e.target.value })} /><input className={inputClass} type="number" min="0" step="0.01" placeholder="Discount" value={order.discount} onChange={(e) => setOrder({ ...order, discount: e.target.value })} /><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={order.offlineCreated} onChange={(e) => setOrder({ ...order, offlineCreated: e.target.checked })} />Offline-created</label><button onClick={saveMobileOrder} disabled={isPending} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Save Draft</button></div>
          <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b text-slate-500"><th className="p-2">Customer</th><th className="p-2">Total</th><th className="p-2">Price level</th><th className="p-2">Status</th><th className="p-2">Offline</th><th className="p-2">Action</th></tr></thead><tbody>{mobileOrders.map((o) => <tr key={o.id} className="border-b"><td className="p-2">{customerName(o.customer_id)}</td><td className="p-2">{money(Number(o.total), currency)}</td><td className="p-2">{o.price_level}</td><td className="p-2">{o.status}</td><td className="p-2">{o.offline_created ? "Yes" : "No"}</td><td className="p-2">{o.status !== "Converted" && <button onClick={() => run(() => updateMobileOrderStatus(o.id, o.status === "Draft" ? "Submitted" : "Converted"), "Order status updated.", () => setMobileOrders((current) => current.map((item) => item.id === o.id ? { ...item, status: item.status === "Draft" ? "Submitted" : "Converted" } : item)))} className="text-blue-600">{o.status === "Draft" ? "Submit" : "Convert"}</button>}</td></tr>)}</tbody></table></div>
        </section>
      )}

      {tab === "Route Reports" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-ink-900">
          <h2 className="mb-4 font-bold">Route Reports</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Sales</p><p className="text-xl font-bold">{money(reportSales, currency)}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Collections</p><p className="text-xl font-bold">{money(reportCollections, currency)}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Route efficiency</p><p className="text-xl font-bold">{reportVisits ? `${Math.round((reportCompleted / reportVisits) * 100)}%` : "0%"}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Rep productivity</p><p className="text-xl font-bold">{initial.reps.length ? `${Math.round(reportCompleted / initial.reps.length)} visits/rep` : "0 visits"}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Customer visits</p><p className="text-xl font-bold">{reportVisits}</p></div><div className="rounded-xl bg-amber-50 p-4"><p className="text-xs text-amber-700">Missed visits</p><p className="text-xl font-bold text-amber-800">{reportMissed}</p></div></div>
        </section>
      )}

      {selected && (
        <section className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm dark:bg-ink-900">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">{selected.name}</h2><p className="text-xs text-slate-500">{selected.territory || "No territory"} · Rep: {repName(selected.assigned_rep_id)}</p></div><div className="flex gap-1 overflow-x-auto">{detailTabs.map((item) => <button key={item} onClick={() => setDetailTab(item)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${detailTab === item ? "bg-blue-600 text-white" : "text-slate-500"}`}>{item}</button>)}</div></div>
          {detailTab === "Details" && <div className="mt-5 grid gap-3 sm:grid-cols-3 text-sm"><p><b>Vehicle</b><br />{selected.vehicle || "—"}</p><p><b>Days</b><br />{selected.route_days?.join(", ") || "—"}</p><p><b>Hours</b><br />{selected.start_time || "—"} – {selected.end_time || "—"}</p></div>}
          {detailTab === "Customers" && <div className="mt-5 space-y-2">{routeVisits.map((v) => <p key={v.id} className="rounded-lg bg-slate-50 p-3 text-xs">{customerName(v.customer_id)} · {v.visit_date}</p>)}{!routeVisits.length && <p className="text-sm text-slate-500">No customers assigned.</p>}</div>}
          {detailTab === "Schedule" && <><div className="mt-5 grid gap-3 md:grid-cols-4"><select className={inputClass} value={schedule.customerId} onChange={(e) => setSchedule({ ...schedule, customerId: e.target.value })}><option value="">Customer</option>{initial.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><input type="date" className={inputClass} value={schedule.visitDate} onChange={(e) => setSchedule({ ...schedule, visitDate: e.target.value })} /><input type="number" className={inputClass} value={schedule.sequenceNo} onChange={(e) => setSchedule({ ...schedule, sequenceNo: e.target.value })} /><button onClick={scheduleVisit} className="rounded-lg bg-blue-600 text-xs font-semibold text-white">Schedule visit</button></div><div className="mt-5 space-y-2">{routeVisits.map((v) => <div key={v.id} className="flex items-center justify-between rounded-lg border p-3 text-xs"><span>{customerName(v.customer_id)} · {v.visit_date}</span><select className="rounded border px-2 py-1" value={v.status} onChange={(e) => run(() => updateVisitStatus(v.id, e.target.value as "Scheduled" | "In Progress" | "Completed" | "Missed"), "Visit updated.", () => setVisits((current) => current.map((item) => item.id === v.id ? { ...item, status: e.target.value } : item)))}><option>Scheduled</option><option>In Progress</option><option>Completed</option><option>Missed</option></select></div>)}</div></>}
          {detailTab === "Collections" && <CollectionTable collections={routeCollections} customerName={customerName} currency={currency} />}
          {detailTab === "Performance" && <div className="mt-5 grid gap-3 sm:grid-cols-3"><p><b>{routeVisits.length}</b><br /><span className="text-xs text-slate-500">Visits</span></p><p><b>{routeVisits.filter((v) => v.status === "Completed").length}</b><br /><span className="text-xs text-slate-500">Completed</span></p><p><b>{money(routeCollections.reduce((n, c) => n + Number(c.amount_collected || 0), 0), currency)}</b><br /><span className="text-xs text-slate-500">Collected</span></p></div>}
          {detailTab === "Notes" && <p className="mt-5 text-sm text-slate-600">{selected.notes || "No notes recorded."}</p>}
          {detailTab === "Attachments" && <p className="mt-5 text-sm text-slate-500">No attachments recorded.</p>}
        </section>
      )}

      {showForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"><div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl dark:bg-ink-900"><div className="mb-4 flex justify-between"><h2 className="font-bold">{editing ? "Edit route" : "Create route"}</h2><button onClick={() => setShowForm(false)}><X className="h-4 w-4" /></button></div><div className="grid gap-3 sm:grid-cols-2"><input className={inputClass} placeholder="Route name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /><input className={inputClass} placeholder="Territory" value={form.territory} onChange={(e) => setForm({ ...form, territory: e.target.value })} /><input className={inputClass} placeholder="Vehicle" value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })} /><select className={inputClass} value={form.assignedRepId} onChange={(e) => setForm({ ...form, assignedRepId: e.target.value })}><option value="">Unassigned rep</option>{initial.reps.map((r) => <option key={r.id} value={r.id}>{r.full_name || "Unnamed rep"}</option>)}</select><input type="time" className={inputClass} value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /><input type="time" className={inputClass} value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /><textarea className="sm:col-span-2 rounded-lg border p-3 text-xs" placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div><button disabled={isPending} onClick={saveRoute} className="mt-4 w-full rounded-lg bg-blue-600 py-2 text-xs font-semibold text-white">{isPending ? "Saving…" : "Save route"}</button></div></div>}
    </div>
  );
}

function CollectionTable({ collections, customerName, currency }: { collections: Collection[]; customerName: (id: string) => string; currency: string }) {
  return <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b text-slate-500"><th className="p-2">Customer</th><th className="p-2">Date</th><th className="p-2">Method</th><th className="p-2 text-right">Amount</th></tr></thead><tbody>{collections.slice(0, 20).map((c) => <tr key={c.id} className="border-b border-slate-100"><td className="p-2">{customerName(c.customer_id)}</td><td className="p-2">{c.collection_date}</td><td className="p-2">{c.payment_method}</td><td className="p-2 text-right">{money(Number(c.amount_collected), currency)}</td></tr>)}</tbody></table></div>;
}
