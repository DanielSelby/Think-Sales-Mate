"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import type { SupplierStatus } from "@/types/database";

export interface CreateSupplierInput {
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  category: string | null;
  country: string | null;
  paymentTerms: string | null;
  currency: string;
  address: string | null;
}

export interface CreateSupplierResult {
  ok: boolean;
  error?: string;
  supplierId?: string;
}

export async function createSupplier(input: CreateSupplierInput): Promise<CreateSupplierResult> {
  if (!input.name.trim()) return { ok: false, error: "Supplier name is required." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "No active organization." };

  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      org_id: context.orgId,
      name: input.name.trim(),
      contact_person: input.contactPerson,
      phone: input.phone,
      email: input.email,
      category: input.category,
      country: input.country,
      payment_terms: input.paymentTerms,
      currency: input.currency || context.currency,
      address: input.address,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "Couldn't create the supplier." };

  await supabase.from("audit_logs").insert({
    org_id: context.orgId,
    actor_id: user.id,
    action: "supplier.created",
    entity_type: "suppliers",
    entity_id: data.id,
    metadata: { name: input.name },
  });

  revalidatePath("/purchases/suppliers");
  return { ok: true, supplierId: data.id };
}

export interface UpdateSupplierStatusResult {
  ok: boolean;
  error?: string;
}

export async function updateSupplierStatus(supplierId: string, status: SupplierStatus): Promise<UpdateSupplierStatusResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: supplier, error: fetchError } = await supabase
    .from("suppliers")
    .select("org_id, name")
    .eq("id", supplierId)
    .single();
  if (fetchError || !supplier) return { ok: false, error: "Supplier not found." };

  const { error } = await supabase.from("suppliers").update({ status }).eq("id", supplierId);
  if (error) return { ok: false, error: error.message };

  await supabase.from("audit_logs").insert({
    org_id: supplier.org_id,
    actor_id: user.id,
    action: "supplier.status_changed",
    entity_type: "suppliers",
    entity_id: supplierId,
    metadata: { name: supplier.name, status },
  });

  revalidatePath("/purchases/suppliers");
  return { ok: true };
}

export interface BulkUpdateSupplierStatusResult {
  ok: boolean;
  error?: string;
  updated?: number;
}

export async function bulkUpdateSupplierStatus(supplierIds: string[], status: SupplierStatus): Promise<BulkUpdateSupplierStatusResult> {
  if (supplierIds.length === 0) return { ok: false, error: "No suppliers selected." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: suppliers, error: fetchError } = await supabase
    .from("suppliers")
    .select("id, org_id, name")
    .in("id", supplierIds);
  if (fetchError || !suppliers || suppliers.length === 0) return { ok: false, error: "Suppliers not found." };

  const { error } = await supabase.from("suppliers").update({ status }).in("id", supplierIds);
  if (error) return { ok: false, error: error.message };

  await supabase.from("audit_logs").insert(
    suppliers.map((s) => ({
      org_id: s.org_id,
      actor_id: user.id,
      action: "supplier.status_changed",
      entity_type: "suppliers",
      entity_id: s.id,
      metadata: { name: s.name, status, bulk: true },
    }))
  );

  revalidatePath("/purchases/suppliers");
  return { ok: true, updated: suppliers.length };
}

export interface BulkDeleteSuppliersResult {
  ok: boolean;
  error?: string;
  deleted?: number;
}

export async function bulkDeleteSuppliers(supplierIds: string[]): Promise<BulkDeleteSuppliersResult> {
  if (supplierIds.length === 0) return { ok: false, error: "No suppliers selected." };

  const supabase = await createClient();

  // Suppliers with purchase history shouldn't be hard-deleted — blacklist
  // instead so the purchase records they're attached to stay intact.
  const { data: withPurchases } = await supabase
    .from("purchases")
    .select("supplier_id")
    .in("supplier_id", supplierIds);
  const blockedIds = new Set((withPurchases ?? []).map((p) => p.supplier_id));
  const deletableIds = supplierIds.filter((id) => !blockedIds.has(id));

  if (deletableIds.length === 0) {
    return { ok: false, error: "These suppliers have purchase history and can't be deleted — deactivate or blacklist them instead." };
  }

  const { error } = await supabase.from("suppliers").delete().in("id", deletableIds);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/purchases/suppliers");
  return {
    ok: true,
    deleted: deletableIds.length,
    error: blockedIds.size > 0 ? `${blockedIds.size} supplier(s) with purchase history were skipped.` : undefined,
  };
}

// ---------------------------------------------------------------------------
// Bulk import (rows already parsed client-side, e.g. via papaparse)
// ---------------------------------------------------------------------------

export interface ImportSupplierRow {
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  category?: string;
  country?: string;
  paymentTerms?: string;
}

export interface ImportSuppliersResult {
  ok: boolean;
  error?: string;
  imported?: number;
  skipped?: number;
}

export async function importSuppliers(rows: ImportSupplierRow[]): Promise<ImportSuppliersResult> {
  const valid = rows.filter((r) => r.name?.trim());
  if (valid.length === 0) return { ok: false, error: "No valid rows found — every row needs at least a supplier name." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "No active organization." };

  const { error } = await supabase.from("suppliers").insert(
    valid.map((r) => ({
      org_id: context.orgId,
      name: r.name.trim(),
      contact_person: r.contactPerson || null,
      phone: r.phone || null,
      email: r.email || null,
      category: r.category || null,
      country: r.country || null,
      payment_terms: r.paymentTerms || null,
      currency: context.currency,
      created_by: user.id,
    }))
  );

  if (error) return { ok: false, error: error.message };

  await supabase.from("audit_logs").insert({
    org_id: context.orgId,
    actor_id: user.id,
    action: "supplier.imported",
    entity_type: "suppliers",
    entity_id: null,
    metadata: { count: valid.length },
  });

  revalidatePath("/purchases/suppliers");
  return { ok: true, imported: valid.length, skipped: rows.length - valid.length };
}