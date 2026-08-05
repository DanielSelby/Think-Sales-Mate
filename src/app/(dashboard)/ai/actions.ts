"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { getFinancialSummary } from "@/lib/accounting/metrics";
import { can } from "@/lib/rbac";

function redirectWithError(message: string): never {
  redirect(`/ai?error=${encodeURIComponent(message)}`);
}

export async function generateInsights(): Promise<void> {
  const context = await getCurrentOrgContext();
  if (!context) redirectWithError("Your session expired — please sign in again.");
  if (!can(context.role, "ai.generate")) {
    redirectWithError("You don't have permission to generate AI insights.");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    redirectWithError("AI Assistant isn't configured yet — add ANTHROPIC_API_KEY to your environment.");
  }

  const supabase = createClient();
  const summary = await getFinancialSummary(context.orgId);

  const { data: lowStockProducts } = await supabase
    .from("products")
    .select("name, stock_quantity, low_stock_threshold")
    .eq("org_id", context.orgId)
    .eq("is_active", true);

  const lowStock = (lowStockProducts ?? []).filter((p) => p.stock_quantity <= p.low_stock_threshold);

  const { data: expenseRows } = await supabase
    .from("expenses")
    .select("category, amount")
    .eq("org_id", context.orgId)
    .gte("expense_date", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));

  const expensesByCategory = new Map<string, number>();
  for (const row of expenseRows ?? []) {
    expensesByCategory.set(row.category, (expensesByCategory.get(row.category) ?? 0) + Number(row.amount));
  }

  const prompt = `You are a business analyst for a small business called "${context.orgName}". Based on the following real data from the last 30 days, write a short executive summary (3-4 sentences) followed by 2-3 concrete, specific recommendations. Be direct and practical, not generic. Use plain text, no markdown headers.

Revenue: $${summary.revenue30d.toFixed(2)} across ${summary.saleCount30d} sales
Gross profit: $${summary.grossProfit30d.toFixed(2)}${summary.hasCostData ? "" : " (incomplete — not all products have cost prices set)"}
Expenses: $${summary.expenses30d.toFixed(2)}
Net profit: $${summary.netProfit30d.toFixed(2)}
Cash flow: $${summary.cashFlow30d.toFixed(2)}
Outstanding invoices: $${summary.outstandingInvoicesTotal.toFixed(2)} across ${summary.outstandingInvoicesCount} unpaid
Inventory value: $${summary.inventoryValue.toFixed(2)}
Low stock items: ${lowStock.length === 0 ? "none" : lowStock.map((p) => `${p.name} (${p.stock_quantity} left)`).join(", ")}
Top sellers: ${
    summary.bestSellers30d.length === 0
      ? "none yet"
      : summary.bestSellers30d.map((s) => `${s.name} (${s.quantity} units, $${s.revenue.toFixed(2)})`).join(", ")
  }
Expense breakdown: ${
    expensesByCategory.size === 0
      ? "none"
      : [...expensesByCategory.entries()].map(([cat, amt]) => `${cat}: $${amt.toFixed(2)}`).join(", ")
  }`;

  let content: string;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      redirectWithError(`AI request failed (${response.status}): ${errBody.slice(0, 200)}`);
    }

    const data = await response.json();
    content = data.content
      ?.map((block: { type: string; text?: string }) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();

    if (!content) redirectWithError("The AI response was empty — try again.");
  } catch (err) {
    redirectWithError(err instanceof Error ? err.message : "Could not reach the AI service.");
  }

  const { error } = await supabase.from("ai_insights").insert({
    org_id: context.orgId,
    content,
    generated_by: context.userId
  });

  if (error) redirectWithError(error.message);

  revalidatePath("/ai");
  redirect("/ai");
}