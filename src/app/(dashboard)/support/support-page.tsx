import { createPlatformServiceClient } from "@/lib/supabase/platform-service";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { DEFAULT_SUPPORT_CENTER_HERO_IMAGE_URL, getSupportCenterHeroStoragePath } from "@/lib/support/branding";
import SupportPageClient, { type Contact, type SupportTicket } from "./support-page-client";

export default async function SupportPageContent({ fromProductHub = false }: { fromProductHub?: boolean }) {
  const context = await getCurrentOrgContext();
  if (!context) return null;

  let contacts: Contact[] = [];
  let tickets: SupportTicket[] = [];
  let contactDirectoryError: string | null = null;
  let ticketHistoryError: string | null = null;
  let heroArtworkError: string | null = null;
  let heroImageUrl = DEFAULT_SUPPORT_CENTER_HERO_IMAGE_URL;
  let contactQueryCompleted = false;
  try {
    const supabase = createPlatformServiceClient();
    const [contactsResult, ticketsResult, brandingResult] = await Promise.all([
      supabase.from("platform_support_contacts").select("*").eq("is_active", true).order("name"),
      supabase
        .from("platform_complaints")
        .select("id, ticket_number, category, subject, description, priority, status, created_at, updated_at")
        .eq("organization_id", context.orgId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase.from("platform_settings").select("value").eq("key", "support_center_branding").maybeSingle(),
    ]);
    contactQueryCompleted = true;
    if (contactsResult.error) {
      console.error("Support directory could not be loaded:", contactsResult.error);
      contactDirectoryError = "Support contact details are temporarily unavailable.";
    } else contacts = contactsResult.data ?? [];
    if (ticketsResult.error) throw new Error(ticketsResult.error.message);
    tickets = ticketsResult.data ?? [];
    if (brandingResult.error) {
      console.error("Support Center hero artwork could not be loaded:", brandingResult.error);
      heroArtworkError = "Custom Support Center artwork is temporarily unavailable.";
    } else {
      const heroStoragePath = getSupportCenterHeroStoragePath(brandingResult.data?.value);
      if (heroStoragePath) {
        heroImageUrl = supabase.storage.from("platform-assets").getPublicUrl(heroStoragePath).data.publicUrl;
      }
    }
  } catch (error) {
    console.error("Support ticket history could not be loaded:", error);
    if (!contactQueryCompleted) contactDirectoryError = "Support contact details are temporarily unavailable.";
    ticketHistoryError = "Support ticket history is temporarily unavailable.";
  }
  return (
    <SupportPageClient
      contacts={contacts}
      tickets={tickets}
      contactDirectoryError={contactDirectoryError}
      ticketHistoryError={ticketHistoryError}
      heroArtworkError={heroArtworkError}
      heroImageUrl={heroImageUrl}
      fromProductHub={fromProductHub}
    />
  );
}
