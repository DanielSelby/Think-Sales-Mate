"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";

export async function logReportExport(reportName: string, reportType: string, format: "pdf" | "excel" | "csv") {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "reports.view")) {
    return { error: "You don't have permission to export reports." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("generated_reports").insert({
    org_id: context.orgId,
    report_name: reportName,
    report_type: reportType,
    format,
    generated_by: context.userId
  });

  if (error) return { error: error.message };
  revalidatePath("/reports");
  return { success: true };
}

export interface RecentReportRow {
  id: string;
  reportName: string;
  reportType: string;
  format: string;
  generatedByEmail: string;
  createdAt: string;
}

export async function getRecentReports(): Promise<RecentReportRow[]> {
  const context = await getCurrentOrgContext();
  if (!context) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("generated_reports")
    .select("id, report_name, report_type, format, generated_by, created_at, profiles(full_name)")
    .eq("org_id", context.orgId)
    .order("created_at", { ascending: false })
    .limit(10);

  return (data ?? []).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      id: row.id,
      reportName: row.report_name,
      reportType: row.report_type,
      format: row.format,
      generatedByEmail: profile?.full_name ?? "—",
      createdAt: row.created_at
    };
  });
}