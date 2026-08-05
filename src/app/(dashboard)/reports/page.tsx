import Link from "next/link";
import { Receipt, Boxes, ArrowRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function ReportsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">Reports</h1>
        <p className="text-sm text-ledger-500 dark:text-ledger-400">
          More reports arrive here as each module matures — starting with Sales and Inventory.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link href="/reports/sales">
          <Card className="cursor-pointer">
            <CardHeader>
              <CardTitle>Sales report</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-ledger-500 dark:text-ledger-400">
                <Receipt className="h-4 w-4" />
                <span className="text-sm">Filter by date range, export CSV</span>
              </div>
              <ArrowRight className="h-4 w-4 text-ledger-300" />
            </CardContent>
          </Card>
        </Link>

        <Link href="/reports/inventory">
          <Card className="cursor-pointer">
            <CardHeader>
              <CardTitle>Inventory valuation</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-ledger-500 dark:text-ledger-400">
                <Boxes className="h-4 w-4" />
                <span className="text-sm">Current stock value by product</span>
              </div>
              <ArrowRight className="h-4 w-4 text-ledger-300" />
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}