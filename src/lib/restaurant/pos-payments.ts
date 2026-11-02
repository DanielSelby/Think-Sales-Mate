export interface RestaurantPosPayment {
  method: string;
  amount: number;
}

export function getRestaurantPosPaymentAccountIndexes(
  payments: RestaurantPosPayment[],
  tipAmount: number,
): number[] {
  return payments.flatMap((payment, index) =>
    (payment.amount > 0 || (index === 0 && tipAmount > 0))
      && (payment.method === "card" || payment.method === "mobile_money")
      ? [index]
      : []
  );
}
