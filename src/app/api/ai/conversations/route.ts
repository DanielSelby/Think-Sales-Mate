import { NextResponse } from "next/server";
import { z } from "zod";
import { saveConversationSchema } from "@/lib/ai/conversation-validation";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";
import { canPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function verifiesOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !(origin && origin !== new URL(request.url).origin)
    && request.headers.get("sec-fetch-site") !== "cross-site";
}

async function getAuthorizedContext(permission: "view" | "create") {
  const context = await getCurrentOrgContext();
  if (!context) return { error: response({ error: "Sign in to use the AI Assistant." }, 401) };
  const allowed = permission === "view"
    ? can(context.role, "ai.view") && await canPermission("ai", "view")
    : can(context.role, "ai.generate") && await canPermission("ai", "create");
  if (!allowed) {
    return { error: response({ error: "You do not have permission to access AI conversation history." }, 403) };
  }
  return { context };
}

export async function GET() {
  try {
    const authorized = await getAuthorizedContext("view");
    if ("error" in authorized) return authorized.error;
    const { data, error } = await (await createClient())
      .from("ai_chat_conversations")
      .select("id, title, messages, created_at, updated_at")
      .eq("org_id", authorized.context.orgId)
      .eq("user_id", authorized.context.userId)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) {
      console.error("AI conversation history could not be loaded.", { orgId: authorized.context.orgId });
      return response({ error: "Conversation history is temporarily unavailable." }, 503);
    }
    return response({ conversations: data ?? [] });
  } catch {
    console.error("AI conversation history lookup failed.");
    return response({ error: "Your access could not be verified. Please try again." }, 503);
  }
}

export async function PUT(request: Request) {
  if (!verifiesOrigin(request)) return response({ error: "This request could not be verified." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return response({ error: "The conversation could not be saved. Please try again." }, 400);
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 150_000) return response({ error: "Conversation history is too large to save." }, 413);

  let context;
  try {
    const authorized = await getAuthorizedContext("create");
    if ("error" in authorized) return authorized.error;
    context = authorized.context;
  } catch {
    console.error("AI conversation save permission lookup failed.");
    return response({ error: "Your access could not be verified. Please try again." }, 503);
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > 150_000) {
      return response({ error: "Conversation history is too large to save." }, 413);
    }
    body = JSON.parse(text);
  } catch {
    return response({ error: "The conversation could not be saved. Please try again." }, 400);
  }
  const parsed = saveConversationSchema.safeParse(body);
  if (!parsed.success) return response({ error: "Conversation history is invalid or too large to save." }, 400);

  const supabase = await createClient();
  const { error } = await supabase.from("ai_chat_conversations").upsert({
    id: parsed.data.id,
    org_id: context.orgId,
    user_id: context.userId,
    title: parsed.data.title,
    messages: parsed.data.messages,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) {
    console.error("AI conversation could not be saved.", { orgId: context.orgId, userId: context.userId });
    return response({ error: "The conversation could not be saved. Please try again." }, 503);
  }
  return response({ ok: true });
}

export async function DELETE(request: Request) {
  if (!verifiesOrigin(request)) return response({ error: "This request could not be verified." }, 403);
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !z.string().uuid().safeParse(id).success) {
    return response({ error: "Choose a valid conversation to delete." }, 400);
  }
  try {
    const authorized = await getAuthorizedContext("view");
    if ("error" in authorized) return authorized.error;
    const { error } = await (await createClient())
      .from("ai_chat_conversations")
      .delete()
      .eq("id", id)
      .eq("org_id", authorized.context.orgId)
      .eq("user_id", authorized.context.userId);
    if (error) {
      console.error("AI conversation could not be deleted.", { orgId: authorized.context.orgId });
      return response({ error: "The conversation could not be deleted. Please try again." }, 503);
    }
    return response({ ok: true });
  } catch {
    console.error("AI conversation delete permission lookup failed.");
    return response({ error: "Your access could not be verified. Please try again." }, 503);
  }
}
