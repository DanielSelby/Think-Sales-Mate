"use server";

import { revalidatePath } from "next/cache";
import { isPlatformProductSlug } from "@/types/platform-database";
import { platformRoleCan, requirePlatformAdminPage } from "@/lib/platform-auth";
import { createPlatformAdminClient } from "@/lib/supabase/platform-admin";

type AnnouncementStatus = "draft" | "published" | "archived";

interface AnnouncementInput {
  id?: string;
  title: string;
  summary: string;
  linkUrl: string;
  productSlugs: string[];
  status: "draft" | "published";
  expiresOn: string;
}

async function requireAnnouncementManager() {
  const admin = await requirePlatformAdminPage("Announcements");
  if (!platformRoleCan(admin.role, "manage_platform")) {
    throw new Error("You do not have permission to manage Product Hub announcements.");
  }
  return admin;
}

function parseLink(value: string): string | null {
  const link = value.trim();
  if (!link) return null;
  if (link.startsWith("/") && !link.startsWith("//") && !link.includes("\\")) return link;
  try {
    const url = new URL(link);
    if (url.protocol === "https:") return url.toString();
  } catch {
    throw new Error("Enter a valid HTTPS URL or an internal path beginning with /.");
  }
  throw new Error("Announcement links must use HTTPS or an internal path beginning with /.");
}

function parseExpiry(value: string): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Enter a valid expiry date.");
  const date = new Date(`${value}T23:59:59.999Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("Enter a valid expiry date.");
  }
  return date.toISOString();
}

async function writeAudit(
  adminId: string,
  action: string,
  announcementId: string,
  metadata: Record<string, unknown> = {},
) {
  const platform = createPlatformAdminClient();
  const { error } = await platform.from("platform_audit_logs").insert({
    admin_id: adminId,
    organization_id: null,
    action,
    module: "product_hub_announcements",
    metadata: { announcement_id: announcementId, ...metadata },
  });
  if (error) throw new Error(`Announcement was saved, but its audit record failed: ${error.message}`);
}

function revalidateAnnouncementSurfaces() {
  revalidatePath("/platform-admin/announcements");
  revalidatePath("/product-hub");
}

export async function saveHubAnnouncement(input: AnnouncementInput) {
  const admin = await requireAnnouncementManager();
  if (!input || typeof input !== "object"
    || typeof input.title !== "string"
    || typeof input.summary !== "string"
    || typeof input.linkUrl !== "string"
    || typeof input.expiresOn !== "string"
    || !Array.isArray(input.productSlugs)) {
    throw new Error("Provide valid announcement details.");
  }
  if (input.id !== undefined && typeof input.id !== "string") {
    throw new Error("Invalid announcement.");
  }
  const title = input.title.trim();
  const summary = input.summary.trim();
  if (!title || title.length > 160) throw new Error("Title is required and must be 160 characters or fewer.");
  if (!summary || summary.length > 500) throw new Error("Summary is required and must be 500 characters or fewer.");
  if (input.status !== "draft" && input.status !== "published") throw new Error("Choose a valid announcement status.");
  const linkUrl = parseLink(input.linkUrl);
  if (linkUrl && linkUrl.length > 2048) throw new Error("Announcement links must be 2048 characters or fewer.");

  if (input.productSlugs.some((slug) => typeof slug !== "string")) {
    throw new Error("Choose only published platform products.");
  }
  const requestedProductSlugs = [...new Set(input.productSlugs)];
  const productSlugs = requestedProductSlugs.filter(isPlatformProductSlug);
  if (productSlugs.length > 3 || productSlugs.length !== requestedProductSlugs.length) {
    throw new Error("Choose only published platform products.");
  }

  const platform = createPlatformAdminClient();
  if (productSlugs.length > 0) {
    const { data: publishedProducts, error: productsError } = await platform
      .from("platform_products")
      .select("slug")
      .eq("is_published", true)
      .in("slug", productSlugs);
    if (productsError) throw new Error(`Could not validate affected products: ${productsError.message}`);
    const allowedSlugs = new Set((publishedProducts ?? []).map((product) => product.slug));
    if (productSlugs.some((slug) => !allowedSlugs.has(slug))) {
      throw new Error("Announcements can only target products that are currently published.");
    }
  }

  const now = new Date().toISOString();
  const expiresAt = parseExpiry(input.expiresOn);
  if (input.status === "published" && expiresAt && expiresAt <= now) {
    throw new Error("A published announcement must expire in the future.");
  }

  let existingPublishedAt: string | null = null;
  if (input.id) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id)) {
      throw new Error("Invalid announcement.");
    }
    const { data, error } = await platform
      .from("platform_hub_announcements")
      .select("published_at")
      .eq("id", input.id)
      .single();
    if (error) throw new Error(`Could not load announcement: ${error.message}`);
    existingPublishedAt = data.published_at;
  }

  const publishedAt = input.status === "published"
    ? existingPublishedAt ?? now
    : null;
  if (publishedAt && expiresAt && expiresAt <= publishedAt) {
    throw new Error("Expiry must be later than the publication date.");
  }

  const values = {
    title,
    summary,
    link_url: linkUrl,
    product_slugs: productSlugs,
    status: input.status,
    published_at: publishedAt,
    expires_at: expiresAt,
    updated_by: admin.id,
    updated_at: now,
  };
  const result = input.id
    ? await platform.from("platform_hub_announcements").update(values).eq("id", input.id).select("id").single()
    : await platform.from("platform_hub_announcements").insert({
      ...values,
      created_by: admin.id,
    }).select("id").single();
  if (result.error) throw new Error(`Could not save announcement: ${result.error.message}`);

  const action = input.id
    ? input.status === "published" ? "updated_and_published" : "updated"
    : input.status === "published" ? "created_and_published" : "created";
  await writeAudit(admin.id, action, result.data.id, { status: input.status, product_slugs: productSlugs });
  revalidateAnnouncementSurfaces();
}

export async function setHubAnnouncementStatus(id: string, status: AnnouncementStatus) {
  const admin = await requireAnnouncementManager();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("Invalid announcement.");
  }
  if (status !== "draft" && status !== "published" && status !== "archived") {
    throw new Error("Choose a valid announcement status.");
  }

  const platform = createPlatformAdminClient();
  const { data: current, error: loadError } = await platform
    .from("platform_hub_announcements")
    .select("status, published_at, expires_at")
    .eq("id", id)
    .single();
  if (loadError) throw new Error(`Could not load announcement: ${loadError.message}`);

  const now = new Date().toISOString();
  if (status === "published" && current.expires_at && current.expires_at <= now) {
    throw new Error("This announcement has expired. Edit its expiry date before publishing it again.");
  }
  const publishedAt = status === "published" ? current.published_at ?? now : null;
  if (publishedAt && current.expires_at && current.expires_at <= publishedAt) {
    throw new Error("Expiry must be later than the publication date.");
  }

  const { error } = await platform
    .from("platform_hub_announcements")
    .update({ status, published_at: publishedAt, updated_by: admin.id, updated_at: now })
    .eq("id", id);
  if (error) throw new Error(`Could not update announcement status: ${error.message}`);

  await writeAudit(admin.id, `status_changed_to_${status}`, id, { previous_status: current.status });
  revalidateAnnouncementSurfaces();
}
