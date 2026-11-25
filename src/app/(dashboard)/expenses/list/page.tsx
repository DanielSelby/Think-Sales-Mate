import { ExpenseListPage } from "../expense-list-page";

export const metadata = { title: "List Expenses · Think Digital Solutions" };

export default async function ListExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string; category?: string }>;
}) {
  return <ExpenseListPage searchParams={searchParams} />;
}
