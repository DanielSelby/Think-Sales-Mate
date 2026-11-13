export type EducationInventoryItemStatus = "active" | "archived";
export type EducationAssetStatus = "available" | "assigned" | "maintenance" | "retired";

export interface EducationInventoryReportItem {
  branch_id: string;
  category: string;
  unit: string;
  quantity_on_hand: number;
  reorder_level: number;
  status: EducationInventoryItemStatus;
}

export interface EducationInventorySummary {
  branch_id: string;
  category: string;
  unit: string;
  item_count: number;
  quantity_on_hand: number;
  low_stock_count: number;
}

export interface EducationAssetReportRecord {
  branch_id: string;
  category: string;
  status: EducationAssetStatus;
}

export interface EducationAssetSummary extends EducationAssetReportRecord {
  asset_count: number;
}

export function summarizeEducationInventory(
  records: readonly EducationInventoryReportItem[],
): EducationInventorySummary[] {
  const grouped = new Map<string, EducationInventorySummary>();
  for (const record of records) {
    if (record.status !== "active") continue;
    const key = `${record.branch_id}\u0000${record.category}\u0000${record.unit}`;
    const summary = grouped.get(key);
    if (summary) {
      summary.item_count += 1;
      summary.quantity_on_hand += record.quantity_on_hand;
      if (record.quantity_on_hand <= record.reorder_level) summary.low_stock_count += 1;
    } else {
      grouped.set(key, {
        branch_id: record.branch_id,
        category: record.category,
        unit: record.unit,
        item_count: 1,
        quantity_on_hand: record.quantity_on_hand,
        low_stock_count: record.quantity_on_hand <= record.reorder_level ? 1 : 0,
      });
    }
  }
  return Array.from(grouped.values()).sort((left, right) =>
    left.branch_id.localeCompare(right.branch_id)
    || left.category.localeCompare(right.category)
    || left.unit.localeCompare(right.unit),
  );
}

export function summarizeEducationAssets(
  records: readonly EducationAssetReportRecord[],
): EducationAssetSummary[] {
  const grouped = new Map<string, EducationAssetSummary>();
  for (const record of records) {
    const key = `${record.branch_id}\u0000${record.category}\u0000${record.status}`;
    const summary = grouped.get(key);
    if (summary) {
      summary.asset_count += 1;
    } else {
      grouped.set(key, { ...record, asset_count: 1 });
    }
  }
  return Array.from(grouped.values()).sort((left, right) =>
    left.branch_id.localeCompare(right.branch_id)
    || left.category.localeCompare(right.category)
    || left.status.localeCompare(right.status),
  );
}
