import { NextResponse } from "next/server";
import type { Interactions } from "@google/genai";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";
import { canPermission } from "@/lib/rbac/permissions";
import {
  createGeminiClient,
  GEMINI_MODEL,
  geminiErrorCode,
  isGeminiConfigured,
  safeGeminiErrorDetails,
  userFacingGeminiError,
} from "@/lib/ai/gemini";
import { finishAiUsage, reserveAiUsage } from "@/lib/ai/usage";

export const dynamic = "force-dynamic";

function configResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  let context;
  try {
    context = await getCurrentOrgContext();
  } catch {
    console.error("AI configuration session lookup failed.");
    return configResponse({ error: "Your session could not be verified. Please try again." }, 503);
  }
  if (!context) return configResponse({ error: "Sign in to use the AI Assistant." }, 401);
  let permitted: boolean;
  try {
    permitted = can(context.role, "ai.view") && await canPermission("ai", "view");
  } catch {
    console.error("AI configuration permission lookup failed.", { orgId: context.orgId });
    return configResponse({ error: "Your access could not be verified. Please try again." }, 503);
  }
  if (!permitted) {
    return configResponse({ error: "You do not have permission to view the AI Assistant." }, 403);
  }
  return configResponse({ configured: isGeminiConfigured() });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (
    (origin && origin !== new URL(request.url).origin)
    || request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    return configResponse({ error: "This request could not be verified." }, 403);
  }

  let context;
  try {
    context = await getCurrentOrgContext();
  } catch {
    console.error("AI connection test session lookup failed.");
    return configResponse({ error: "Your session could not be verified. Please try again." }, 503);
  }
  if (!context) return configResponse({ error: "Sign in to use the AI Assistant." }, 401);

  let permitted: boolean;
  try {
    permitted = can(context.role, "ai.generate") && await canPermission("ai", "create");
  } catch {
    console.error("AI connection test permission lookup failed.", { orgId: context.orgId });
    return configResponse({ error: "Your access could not be verified. Please try again." }, 503);
  }
  if (!permitted) {
    return configResponse({ error: "You do not have permission to test the AI connection." }, 403);
  }
  if (!isGeminiConfigured()) {
    return configResponse({ error: "GEMINI_API_KEY is not configured on this server." }, 503);
  }

  const reservation = await reserveAiUsage(context, GEMINI_MODEL);
  if (!reservation.ok) {
    return configResponse({
      error: reservation.reason === "limited"
        ? "The AI request limit has been reached. Please wait before testing again."
        : "The connection test is temporarily unavailable. Please try again shortly.",
    }, reservation.reason === "limited" ? 429 : 503);
  }

  const startedAt = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    const response = await createGeminiClient().interactions.create({
      model: GEMINI_MODEL,
      input: "Reply with OK.",
      generation_config: { max_output_tokens: 8, temperature: 0 },
      store: false,
    });
    inputTokens = response.usage?.total_input_tokens ?? 0;
    outputTokens = response.usage?.total_output_tokens ?? 0;
    const responseText = (response.steps ?? [])
      .filter((step): step is Interactions.ModelOutputStep => step.type === "model_output")
      .flatMap((step) => step.content ?? [])
      .filter((content): content is Interactions.TextContent => content.type === "text")
      .map((content) => content.text)
      .join("")
      .trim();
    if (!responseText) throw new Error("empty_response");

    const usageSaved = await finishAiUsage({
      id: reservation.id,
      orgId: context.orgId,
      userId: context.userId,
      status: "succeeded",
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - startedAt,
    });
    if (!usageSaved) {
      return configResponse({
        error: "Gemini responded, but the usage record could not be saved. Please contact an administrator.",
      }, 503);
    }
    return configResponse({ ok: true, model: GEMINI_MODEL });
  } catch (error) {
    const errorCode = error instanceof Error && error.message === "empty_response"
      ? "empty_response"
      : geminiErrorCode(error);
    console.error("AI connection test failed.", {
      orgId: context.orgId,
      errorCode,
      model: GEMINI_MODEL,
      ...safeGeminiErrorDetails(error),
    });
    await finishAiUsage({
      id: reservation.id,
      orgId: context.orgId,
      userId: context.userId,
      status: "failed",
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - startedAt,
      errorCode,
    });
    const errorMessage = errorCode === "empty_response"
      ? "Gemini was reached, but it returned an empty test response."
      : userFacingGeminiError(errorCode);
    return configResponse({ error: errorMessage, model: GEMINI_MODEL }, 502);
  }
}
