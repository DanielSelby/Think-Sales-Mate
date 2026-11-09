export function calculateRestaurantLoyaltyDiscount(points: number, orderTotal: number): number {
  if (!Number.isInteger(points) || points < 0 || !Number.isFinite(orderTotal) || orderTotal < 0) return 0;
  const roundedTotal = Math.round(orderTotal * 100) / 100;
  return Math.min(roundedTotal, points / 100);
}

export function calculateRestaurantLoyaltyPointsEarned(paidTotal: number): number {
  if (!Number.isFinite(paidTotal) || paidTotal <= 0) return 0;
  return Math.floor(paidTotal);
}
