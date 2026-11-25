import { redirect } from "next/navigation";
import { ExpenseListPage } from "./expense-list-page";

export const metadata = { title: "Expenses · Think Digital Solutions" };

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string; category?: string; view?: string }>;
}) {
  const filters = await searchParams;
  if (filters.view === "approvals") redirect("/approvals?type=expense");
  return <ExpenseListPage searchParams={Promise.resolve(filters)} />;
}
