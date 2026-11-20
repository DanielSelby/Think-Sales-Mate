import { redirect } from "next/navigation";
import { OfflineCenter } from "@/components/offline/offline-center";
import { getCurrentOrgContext } from "@/lib/organizations/current";

export const metadata = { title: "Think Education Offline Center" };

export default async function EducationOfflinePage() {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");

  return (
    <OfflineCenter
      education
      productLabel="Think Education"
    />
  );
}
