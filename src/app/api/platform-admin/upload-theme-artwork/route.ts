import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getPlatformAdmin, platformRoleCan } from "@/lib/platform-auth";
import { createPlatformServerClient } from "@/lib/supabase/platform-server";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

function getImageType(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) return "image/png";
  if (
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) return "image/webp";
  return null;
}

export async function POST(request: Request) {
  try {
    const admin = await getPlatformAdmin();
    if (!admin || !platformRoleCan(admin.role, "manage_platform")) {
      return NextResponse.json({ error: "You do not have permission to manage login themes." }, { status: 403 });
    }

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_FILE_SIZE + 64 * 1024) {
      return NextResponse.json({ error: "Artwork must be 20MB or smaller." }, { status: 413 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const themeId = formData.get("themeId");

    if (!(file instanceof File) || file.size === 0 || typeof themeId !== "string" || !themeId.trim()) {
      return NextResponse.json({ error: "Choose an artwork image to upload." }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Artwork must be 20MB or smaller." }, { status: 413 });
    }

    const supabase = await createPlatformServerClient();
    const { data: theme, error: themeError } = await supabase
      .from("login_themes")
      .select("name, theme_type, preview_image")
      .eq("id", themeId)
      .maybeSingle();
    if (themeError) throw new Error(`Could not find the login theme: ${themeError.message}`);
    if (!theme) return NextResponse.json({ error: "The selected login theme was not found." }, { status: 404 });
    if (theme.theme_type !== "modern-green") {
      return NextResponse.json({ error: "Artwork can only be uploaded for the Modern Green Login theme." }, { status: 400 });
    }

    const buffer = new Uint8Array(await file.arrayBuffer());
    const imageType = getImageType(buffer);
    if (!imageType || file.type !== imageType) {
      return NextResponse.json({ error: "Upload a valid JPG, PNG, or WebP image." }, { status: 400 });
    }

    const path = `login-themes/${themeId}/${crypto.randomUUID()}.${imageType.split("/")[1]}`;

    const { error: uploadError } = await supabase.storage.from("platform-assets").upload(path, buffer, {
      contentType: imageType,
    });

    if (uploadError) {
      throw new Error(`Could not upload login artwork: ${uploadError.message}`);
    }

    const { data } = supabase.storage.from("platform-assets").getPublicUrl(path);
    const publicUrl = data.publicUrl;

    const { error: updateError } = await supabase
      .from("login_themes")
      .update({ preview_image: publicUrl, updated_at: new Date().toISOString() })
      .eq("id", themeId);
    if (updateError) {
      throw new Error(`Artwork uploaded, but the theme could not be updated: ${updateError.message}`);
    }

    const { error: auditError } = await supabase.from("platform_audit_logs").insert({
      admin_id: admin.id,
      action: "login_theme_artwork_updated",
      module: "login_experience",
      metadata: { themeId, themeName: theme.name, previousArtwork: theme.preview_image, newArtwork: publicUrl },
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
