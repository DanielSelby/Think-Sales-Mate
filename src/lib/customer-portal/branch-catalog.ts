export interface BranchStockLevel {
  locationId: string;
  quantity: number;
}

export function getStorefrontStockQuantity({
  organizationStock,
  branchId,
  activeLocationCount,
  visibleLocationIds,
  stockLevels,
}: {
  organizationStock: number;
  branchId?: string;
  activeLocationCount: number;
  visibleLocationIds: string[];
  stockLevels: BranchStockLevel[];
}): number | null {
  if (branchId) {
    return stockLevels.find((level) => level.locationId === branchId)?.quantity ?? null;
  }

  if (activeLocationCount === 0) return organizationStock;

  const visibleLevels = stockLevels.filter((level) => visibleLocationIds.includes(level.locationId));
  if (visibleLevels.length > 0) {
    return visibleLevels.reduce((total, level) => total + level.quantity, 0);
  }

  return stockLevels.length > 0 ? null : organizationStock;
}
