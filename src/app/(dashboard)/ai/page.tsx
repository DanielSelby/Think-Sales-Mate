import { cookies } from "next/headers";
import { Sparkles } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { generateInsights } from "@/app/(dashboard)/ai/actions";

export default async function AiAssistantPage({ searchParams }: { searchParams: { error?: string } }) {
  const activeOrgId = await (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();
  const { data: insights } = await supabase
    .from("ai_insights")
    .select("id, content, created_at")
    .eq("org_id", context.orgId)
    .order("created_at", { ascending: false })
    .limit(10);

  const canGenerate = can(context.role, "ai.generate");
  const latest = insights?.[0];
  const history = insights?.slice(1) ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">AI Assistant</h1>
          <p className="text-sm text-ledger-500 dark:text-ledger-400">
            An executive summary of your last 30 days, generated from real data — sales, expenses, stock, and top sellers.
          </p>
        </div>
        {canGenerate && (
          <form action={generateInsights}>
            <Button type="submit">
              <Sparkles className="h-4 w-4" />
              Generate insights
            </Button>
          </form>
        )}
      </div>

      {searchParams.error && <p className="rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{searchParams.error}</p>}

      {!latest ? (
        <div className="rounded-card border border-dashed border-ledger-200 bg-white p-10 text-center dark:border-ledger-700 dark:bg-ink-900">
          <Sparkles className="mx-auto h-5 w-5 text-ledger-300" />
          <p className="mt-2 text-sm text-ledger-500 dark:text-ledger-400">
            {canGenerate
              ? "No insights generated yet — click Generate insights to get your first summary."
              : "No insights yet. Ask a manager to generate the first one."}
          </p>
        </div>
      ) : (
        <Card accent="signal">
          <CardContent className="pt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ledger-400">
              {new Date(latest.created_at).toLocaleString()}
            </p>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-900 dark:text-white">{latest.content}</p>
          </CardContent>
        </Card>
      )}

      {history.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ledger-400">Previous summaries</p>
          {history.map((item) => (
            <Card key={item.id}>
              <CardContent className="pt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-ledger-400">
                  {new Date(item.created_at).toLocaleString()}
                </p>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ledger-600 dark:text-ledger-300">
                  {item.content}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}