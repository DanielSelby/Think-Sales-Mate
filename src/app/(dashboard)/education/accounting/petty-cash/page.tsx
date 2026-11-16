import { redirect } from "next/navigation";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { getProductAppPath } from "@/lib/product-app-routes";

type SearchParams = {
  created?: string;
  error?: string;
  paid?: string;
  reviewed?: string;
};

export default async function EducationPettyCashPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_expenses", "expenses", "records", "view")) {
    redirect("/dashboard?accessDenied=think-education.expenses");
  }

  const params = await searchParams;
  const query = new URLSearchParams({ category: "Petty Cash" });
  if (params.created === "1") query.set("created", "1");
  if (params.paid === "1") query.set("paid", "1");
  if (params.reviewed === "approved" || params.reviewed === "rejected") query.set("reviewed", params.reviewed);
  if (params.error && [
    "invalid",
    "transition",
    "accounting-mapping",
    "accounting-period",
    "not-found",
    "save",
  ].includes(params.error)) query.set("error", params.error);

  redirect(getProductAppPath("think-education", `/expenses?${query.toString()}`));
}
