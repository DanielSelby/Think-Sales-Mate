import { cookies } from "next/headers";
import { AlertTriangle, Sparkles } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { Card, CardContent } from "@/components/ui/card";
import { generateInsights } from "@/app/(dashboard)/ai/actions";
import { AiChat } from "@/app/(dashboard)/ai/ai-chat";
import { AiGenerateButton } from "@/app/(dashboard)/ai/ai-generate-button";
import { canPermission } from "@/lib/rbac/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AiAssistantPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const actionError = params.error?.startsWith("NEXT_REDIRECT")
    ? "The request was redirected unexpectedly. Refresh the page and try again. If it continues, check the server logs."
    : params.error;
  const activeOrgId = await (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const canView = can(context.role, "ai.view") && await canPermission("ai", "view", context.orgId);
  if (!canView) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-ink-900 dark:text-slate-300">
        You do not have permission to view the AI Assistant.
      </div>
    );
  }

  const supabase = await createClient();
  const { data: insights, error: insightsError } = await supabase
    .from("ai_insights")
    .select("id, content, created_at")
    .eq("org_id", context.orgId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (insightsError) console.error("AI insight history could not be loaded.", { orgId: context.orgId });

  const canGenerate = can(context.role, "ai.generate") && await canPermission("ai", "create", context.orgId);
  const latest = insights?.[0];
  const history = insights?.slice(1) ?? [];
  const canViewUsage = context.role === "owner" || context.role === "admin";
  let usageSummary: {
    total_requests: number;
    successful_requests: number;
    failed_requests: number;
    input_tokens: number;
    output_tokens: number;
    average_latency_ms: number;
    recent_errors: unknown;
  } | null = null;
  let usageSummaryUnavailable = false;
  if (canViewUsage) {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("get_ai_usage_summary", { p_org_id: context.orgId }).maybeSingle();
    if (error) {
      console.error("AI usage summary could not be loaded.", { orgId: context.orgId });
      usageSummaryUnavailable = true;
    } else {
      usageSummary = data;
    }
  }
  const recentErrors = usageSummary?.recent_errors
    && typeof usageSummary.recent_errors === "object"
    && !Array.isArray(usageSummary.recent_errors)
    ? Object.entries(usageSummary.recent_errors).filter(([code, count]) =>
        /^[a-z_]{1,50}$/.test(code) && typeof count === "number" && count > 0)
    : [];

  return (
    <div className="w-full space-y-5">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--theme-primary)] text-white shadow-sm">
          <Sparkles className="h-5 w-5" />
          </span>
          <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">ThinkSales Ai Agent</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Get instant answers, insights and help with your ThinkSales Pro data.
          </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {canGenerate && (
          <form action={generateInsights}>
            <AiGenerateButton />
          </form>
          )}
        </div>
      </header>

      {actionError && (
        <div role="alert" className="relative flex items-start gap-3 overflow-hidden rounded-2xl border border-rose-200 bg-gradient-to-br from-white via-rose-50 to-rose-100 px-4 py-3.5 text-sm text-rose-900 shadow-[0_7px_0_0_rgba(190,24,93,0.12),0_14px_28px_-12px_rgba(190,24,93,0.25)] ring-1 ring-white/80 dark:border-rose-900 dark:from-rose-950 dark:via-rose-950/80 dark:to-slate-950 dark:text-rose-100 dark:ring-rose-900/50">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-[0_4px_0_0_rgba(159,18,57,0.65)]">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold">We couldn&apos;t complete that action</p>
            <p className="mt-0.5 text-xs leading-5 text-rose-800 dark:text-rose-200">{actionError}</p>
          </div>
        </div>
      )}
      {insightsError && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          AI insight history is temporarily unavailable.
        </p>
      )}

      {canGenerate ? (
        <AiChat key={context.orgId} userLabel="You" />
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-ink-900">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--theme-primary-pale)] text-[var(--theme-primary)]"><Sparkles className="h-5 w-5" /></span>
          <p className="mt-3 text-sm font-medium text-slate-800 dark:text-white">Your AI Assistant access is read-only.</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Ask an organization manager to grant AI Assistant access if you need to send questions.</p>
        </div>
      )}

      {canViewUsage && (
        <Card className="border border-slate-200/90 border-l-4 border-l-indigo-400 bg-white shadow-sm dark:border-slate-700 dark:border-l-indigo-400 dark:bg-ink-900">
          <CardContent className="pt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">AI usage · last 30 days</p>
          {usageSummaryUnavailable ? (
            <p className="mt-2 text-sm text-rose-700 dark:text-rose-300">Usage information is temporarily unavailable.</p>
          ) : usageSummary ? (
            <>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div><p className="text-slate-500 dark:text-slate-400">Requests</p><p className="font-semibold text-slate-900 dark:text-white">{usageSummary.total_requests}</p></div>
                <div><p className="text-slate-500 dark:text-slate-400">Successful</p><p className="font-semibold text-slate-900 dark:text-white">{usageSummary.successful_requests}</p></div>
                <div><p className="text-slate-500 dark:text-slate-400">Failed</p><p className="font-semibold text-slate-900 dark:text-white">{usageSummary.failed_requests}</p></div>
                <div><p className="text-slate-500 dark:text-slate-400">Avg. latency</p><p className="font-semibold text-slate-900 dark:text-white">{Math.round(usageSummary.average_latency_ms)} ms</p></div>
              </div>
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Tokens: {usageSummary.input_tokens.toLocaleString()} input · {usageSummary.output_tokens.toLocaleString()} output
              </p>
              {recentErrors.length > 0 && (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Recent error types: {recentErrors.map(([code, count]) => `${code} (${count})`).join(", ")}
                </p>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">No AI usage has been recorded in the last 30 days.</p>
          )}
          </CardContent>
        </Card>
      )}

      {!insightsError && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Saved business insights</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Generated summaries remain saved to your organization history.</p>
          </div>
          </div>

          {!latest ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-7 text-center dark:border-slate-700 dark:bg-ink-900">
            <Sparkles className="mx-auto h-5 w-5 text-[var(--theme-primary)]" />
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{canGenerate ? "No summaries yet. Generate an insight when you're ready." : "No saved summaries are available yet."}</p>
          </div>
          ) : (
          <Card className="border border-slate-200/90 border-l-4 border-l-sky-400 bg-white shadow-sm dark:border-slate-700 dark:border-l-sky-400 dark:bg-ink-900">
            <CardContent className="pt-5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Latest summary · {new Date(latest.created_at).toLocaleString()}
              </p>
              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700 dark:text-slate-200">{latest.content}</p>
            </CardContent>
          </Card>
          )}

          {history.length > 0 && (
          <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-ink-900">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-xs font-semibold text-slate-700 marker:hidden dark:text-slate-200">
              Previous summaries ({history.length})
              <span className="text-slate-400 transition group-open:rotate-180">⌄</span>
            </summary>
            <div className="space-y-3 border-t border-slate-100 p-4 dark:border-slate-800">
              {history.map((item) => (
                <article key={item.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{new Date(item.created_at).toLocaleString()}</p>
                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700 dark:text-slate-300">{item.content}</p>
                </article>
              ))}
            </div>
          </details>
          )}
        </section>
      )}
    </div>
  );
}