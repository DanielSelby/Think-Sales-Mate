import { NextRequest, NextResponse } from "next/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { educationDocumentDownloadSchema } from "@/lib/education/documents";

function documentsPage(request: NextRequest, error?: string) {
  const url = new URL(getProductAppPath("think-education", "/documents"), request.url);
  if (error) url.searchParams.set("error", error);
  return NextResponse.redirect(url);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const context = await getCurrentOrgContext();
  if (!context) return documentsPage(request, "auth");
  if (!await canTabPermission("education_documents", "documents", "library", "view")) {
    return documentsPage(request, "permission");
  }
  const { documentId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentId)) {
    return documentsPage(request, "not-found");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("education_document_prepare_download", {
    p_org_id: context.orgId,
    p_document_id: documentId,
  });
  if (error) {
    if (error.code === "P0002") return documentsPage(request, "not-found");
    if (error.code === "42501") return documentsPage(request, "permission");
    console.error("Could not authorize Think Education document download:", error.message);
    return documentsPage(request, "download");
  }
  const parsed = educationDocumentDownloadSchema.safeParse(data);
  if (!parsed.success) {
    console.error("Think Education document download returned unexpected data:", parsed.error.flatten());
    return documentsPage(request, "download");
  }

  const { data: signedUrl, error: signedUrlError } = await supabase.storage
    .from("education-documents")
    .createSignedUrl(parsed.data.storage_path, 60, { download: parsed.data.file_name });
  if (signedUrlError || !signedUrl?.signedUrl) {
    console.error("Could not create a secure Think Education document link:", signedUrlError?.message ?? "No signed URL returned.");
    return documentsPage(request, "download");
  }
  return NextResponse.redirect(signedUrl.signedUrl);
}
