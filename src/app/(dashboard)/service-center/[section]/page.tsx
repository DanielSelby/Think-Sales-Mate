import { notFound, redirect } from "next/navigation";

const sectionRedirects: Record<string, string> = {
  appointments: "/service-center?view=appointments",
  customers: "/service-center?view=assets",
  quotations: "/service-center?view=quotations",
  invoices: "/service-center?view=invoices",
  warranty: "/service-center?view=warranty",
};

export default async function ServiceCenterSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const destination = sectionRedirects[section];
  if (!destination) notFound();
  redirect(destination);
}
