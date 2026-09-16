import { createPlatformServiceClient } from "@/lib/supabase/platform-service";
import SupportPageClient, { type Contact } from "./support-page-client";

export const metadata = { title: "Support Center · ThinkSales" };

export default async function SupportPage() {
  let contacts: Contact[] = [];
  try {
    const supabase = createPlatformServiceClient();
    const result = await supabase.from("platform_support_contacts").select("*").eq("is_active", true).order("name");
    if (result.error) throw new Error(result.error.message);
    contacts = result.data ?? [];
  } catch (error) {
    console.error("Support directory could not be loaded:", error);
  }
  return <SupportPageClient contacts={contacts} />;
}
