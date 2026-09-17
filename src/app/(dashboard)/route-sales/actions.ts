"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";

const path = "/route-sales";

export async function createRoute(input: { name: string; territory: string; vehicle: string; routeDays: string[]; startTime: string; endTime: string; notes: string }) {
  const context = await getCurrentOrgContext();
  if (!context) return { error: "No active organization." };
  const supabase = await createClient();
  const { data, error } = await (supabase as any).from("route_sales_routes").insert({
    org_id: context.orgId, name: input.name.trim(), territory: input.territory.trim() || null, vehicle: input.vehicle.trim() || null,
    route_days: input.routeDays, start_time: input.startTime || null, end_time: input.endTime || null, notes: input.notes.trim() || null, created_by: context.userId,
  }).select("id").single();
  if (error) return { error: error.message };
  revalidatePath(path);
  return { success: true, id: data.id };
}

export async function updateVisitStatus(visitId: string, status: "Scheduled" | "In Progress" | "Completed" | "Missed") {
  const context = await getCurrentOrgContext();
  if (!context) return { error: "No active organization." };
  const supabase = await createClient();
  const { error } = await (supabase as any).from("route_sales_visits").update({ status, completed_at: status === "Completed" ? new Date().toISOString() : null }).eq("id", visitId).eq("org_id", context.orgId);
  if (error) return { error: error.message };
  revalidatePath(path);
  return { success: true };
}

export async function recordRouteCollection(input: { customerId: string; routeId?: string; outstanding: number; amount: number; paymentMethod: string }) {
  const context = await getCurrentOrgContext();
  if (!context) return { error: "No active organization." };
  const supabase = await createClient();
  const { error } = await (supabase as any).from("route_sales_collections").insert({
    org_id: context.orgId, customer_id: input.customerId, route_id: input.routeId || null,
    outstanding_amount: input.outstanding, amount_collected: input.amount, payment_method: input.paymentMethod, collector_id: context.userId,
  });
  if (error) return { error: error.message };
  revalidatePath(path);
  return { success: true };
}

export async function cloneRoute(routeId: string) {
  const context = await getCurrentOrgContext();
  if (!context) return { error: "No active organization." };
  const supabase = await createClient();
  const { data: route } = await (supabase as any).from("route_sales_routes").select("name,territory,vehicle,route_days,start_time,end_time,notes").eq("id", routeId).eq("org_id", context.orgId).maybeSingle();
  if (!route) return { error: "Route not found." };
  const { error } = await (supabase as any).from("route_sales_routes").insert({ ...route, org_id: context.orgId, name: `${route.name} (Copy)`, created_by: context.userId });
  if (error) return { error: error.message };
  revalidatePath(path);
  return { success: true };
}
