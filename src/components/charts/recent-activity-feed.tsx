import { ShoppingCart, Receipt, UserPlus, CheckCircle2 } from "lucide-react";
import { formatMoney } from "@/lib/currency";
import type { ActivityItem } from "@/lib/accounting/metrics";

const ICONS: Record<ActivityItem["type"], React.ComponentType<{ className?: string }>> = {
  sale: ShoppingCart,
  expense: Receipt,
  customer: UserPlus,
  invoice_paid: CheckCircle2
};

const ICON_STYLES: Record<ActivityItem["type"], string> = {
  sale: "bg-signal-soft text-signal",
  expense: "bg-alert-soft text-alert",
  customer: "bg-accentBlue/10 text-accentBlue",
  invoice_paid: "bg-signal-soft text-signal"
};

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function RecentActivityFeed({ items, currency }: { items: ActivityItem[]; currency: string }) {
  if (items.length === 0) {
    return (
      <div className="flex h-32 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-ledger-200 text-center dark:border-ledger-700">
        <p className="text-sm text-ledger-400">No activity yet.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const Icon = ICONS[item.type];
        return (
          <li key={item.id} className="flex items-center gap-3">
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${ICON_STYLES[item.type]}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ink-900 dark:text-white">{item.description}</p>
              <p className="text-xs text-ledger-400">{timeAgo(item.createdAt)}</p>
            </div>
            {item.amount !== null && (
              <span className={`figure shrink-0 text-sm font-medium ${item.amount >= 0 ? "text-signal" : "text-alert"}`}>
                {item.amount >= 0 ? "+" : "−"}
                {formatMoney(Math.abs(item.amount), currency)}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}