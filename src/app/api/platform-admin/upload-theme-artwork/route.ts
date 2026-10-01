import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getPlatformAdmin, platformRoleCan } from "@/lib/platform-auth";
import { createPlatformServerClient } from "@/lib/supabase/platform-server";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const admin = await getPlatformAdmin();
    if (!admin || !platformRoleCan(admin.role, "manage_platform")) {
      return NextResponse.json({ error: "You do not have permission to manage login themes." }, { status: 403 });
    }

    const body = await request.json() as { themeId?: unknown; storagePath?: unknown };
    if (typeof body.themeId !== "string" || typeof body.storagePath !== "string") {
      return NextResponse.json({ error: "Missing login theme or uploaded artwork." }, { status: 400 });
    }

    const supabase = await createPlatformServerClient();
    const { data: theme, error: themeError } = await supabase
      .from("login_themes")
      .select("name, theme_type, preview_image")
      .eq("id", body.themeId)
      .maybeSingle();
    if (themeError) throw new Error(`Could not find the login theme: ${themeError.message}`);
    if (!theme) return NextResponse.json({ error: "The selected login theme was not found." }, { status: 404 });
    if (theme.theme_type !== "modern-green") {
      return NextResponse.json({ error: "Artwork can only be uploaded for the Modern Green Login theme." }, { status: 400 });
    }

    const match = body.storagePath.match(/^login-themes\/([a-zA-Z0-9_-]+)\/([0-9a-f-]{36})\.(jpg|png|webp)$/i);
    if (!match || match[1] !== body.themeId) {
      return NextResponse.json({ error: "Invalid login artwork storage path." }, { status: 400 });
    }

    const path = body.storagePath;
    const { data: objects, error: listError } = await supabase.storage
      .from("platform-assets")
      .list(`login-themes/${body.themeId}`, { search: match[2] });
    if (listError) throw new Error(`Could not verify uploaded artwork: ${listError.message}`);
    const uploadedObject = objects?.find((object) => object.name === `${match[2]}.${match[3]}`);
    if (!uploadedObject) return NextResponse.json({ error: "The uploaded artwork could not be found." }, { status: 404 });
    const fileSize = uploadedObject.metadata?.size;
    if (typeof fileSize === "number" && (fileSize <= 0 || fileSize > MAX_FILE_SIZE)) {
      return NextResponse.json({ error: "Artwork must be 20MB or smaller." }, { status: 413 });
    }

    const { data } = supabase.storage.from("platform-assets").getPublicUrl(path);
    const publicUrl = data.publicUrl;

    const { error: updateError } = await supabase
      .from("login_themes")
      .update({ preview_image: publicUrl, updated_at: new Date().toISOString() })
      .eq("id", body.themeId);
    if (updateError) {
      throw new Error(`Artwork uploaded, but the theme could not be updated: ${updateError.message}`);
    }

    const { error: auditError } = await supabase.from("platform_audit_logs").insert({
      admin_id: admin.id,
      action: "login_theme_artwork_updated",
      module: "login_experience",
      metadata: { themeId: body.themeId, themeName: theme.name, previousArtwork: theme.preview_image, newArtwork: publicUrl },
    });
    if (auditError) throw new Error(`Artwork was saved, but its audit record failed: ${auditError.message}`);

    revalidatePath("/platform-admin");
    revalidatePath("/login");
    return NextResponse.json({ url: publicUrl });
  } catch (error) {
    console.error("Login theme artwork upload failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Login artwork upload failed." },
      { status: 500 },
    );
  }
}
