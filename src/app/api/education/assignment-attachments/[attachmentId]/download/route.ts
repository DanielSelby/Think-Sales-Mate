import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const preparedDownloadSchema = z.object({
  storage_path: z.string().min(1),
  file_name: z.string().min(1).max(255),
  content_type: z.string().min(1),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attachmentId: string }> }
) {
  const { attachmentId } = await params;
  if (!z.string().uuid().safeParse(attachmentId).success) {
    return NextResponse.json({ error: "The attachment could not be found." }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) {
    console.error("Could not verify assignment attachment download session:", userError.message);
    return NextResponse.json({ error: "Your session could not be verified." }, { status: 503 });
  }
  if (!user) return NextResponse.json({ error: "Sign in to download this attachment." }, { status: 401 });

  const { data, error } = await supabase.rpc("education_assignment_attachment_prepare_download", {
    p_attachment_id: attachmentId,
  });
  if (error) {
    if (error.code === "P0002") return NextResponse.json({ error: "The attachment could not be found." }, { status: 404 });
    if (error.code === "42501") return NextResponse.json({ error: "You cannot access this attachment." }, { status: 403 });
    console.error("Could not prepare assignment attachment download:", error.message);
    return NextResponse.json({ error: "The attachment is temporarily unavailable." }, { status: 503 });
  }
  const prepared = preparedDownloadSchema.safeParse(data);
  if (!prepared.success) {
    console.error("Assignment attachment download returned unexpected data.");
    return NextResponse.json({ error: "The attachment is temporarily unavailable." }, { status: 503 });
  }

  const { data: signedUrl, error: signedUrlError } = await supabase.storage
    .from("education-assignment-attachments")
    .createSignedUrl(prepared.data.storage_path, 60, { download: prepared.data.file_name });
  if (signedUrlError || !signedUrl.signedUrl) {
    if (signedUrlError) console.error("Could not sign assignment attachment download:", signedUrlError.message);
    return NextResponse.json({ error: "The attachment is temporarily unavailable." }, { status: 503 });
  }

  return NextResponse.redirect(signedUrl.signedUrl, {
    status: 303,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
