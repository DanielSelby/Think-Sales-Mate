export type AnomalySeverity = "Low" | "Medium" | "High" | "Critical";

export type AnomalyResult = {
  detected: boolean;
  severity: AnomalySeverity;
  riskScore: number;
  anomalyType: string;
  confidence: number;
  reason: string;
  evidence: string[];
};

type TransactionInput = {
  amount?: number | null;
  discountRate?: number | null;
  quantity?: number | null;
  baselineAmount?: number | null;
  operation?: string;
};

function severity(score: number): AnomalySeverity {
  if (score >= 85) return "Critical";
  if (score >= 65) return "High";
  if (score >= 40) return "Medium";
  return "Low";
}

export function evaluateTransaction(input: TransactionInput): AnomalyResult {
  const amount = Math.max(0, Number(input.amount ?? 0));
  const discount = Math.max(0, Number(input.discountRate ?? 0));
  const baseline = Math.max(0, Number(input.baselineAmount ?? 0));
  const evidence: string[] = [];
  let score = 0;
  let anomalyType = "transaction_outlier";

  if (amount >= 10000) {
    score += 45;
    evidence.push(`Transaction amount is ${amount.toLocaleString()} and exceeds the high-value review threshold.`);
    anomalyType = "high_value_transaction";
  }
  if (discount >= 30) {
    score += Math.min(40, Math.round(discount * 0.8));
    evidence.push(`Discount rate is ${discount.toFixed(1)}%, above the normal review threshold.`);
    anomalyType = "unusual_discount";
  }
  if (baseline > 0 && amount > baseline * 1.5) {
    score += 20;
    evidence.push("Amount is materially above the available historical baseline.");
  }
  if (Number(input.quantity ?? 0) >= 100) {
    score += 20;
    evidence.push("Quantity is unusually large for a single transaction.");
    anomalyType = "unusual_quantity";
  }

  const riskScore = Math.min(100, score);
  return {
    detected: riskScore >= 40,
    severity: severity(riskScore),
    riskScore,
    anomalyType,
    confidence: Math.min(0.98, 0.55 + evidence.length * 0.12),
    reason: evidence.join(" "),
    evidence,
  };
}

export function evaluatePriceOverride(systemPrice: number, transactionPrice: number): AnomalyResult {
  const change = systemPrice > 0 ? Math.abs(transactionPrice - systemPrice) / systemPrice * 100 : 100;
  const result = evaluateTransaction({ amount: transactionPrice, baselineAmount: systemPrice });
  const score = Math.min(100, Math.round(Math.max(result.riskScore, change >= 50 ? 75 : change >= 25 ? 50 : 30)));
  return {
    ...result,
    detected: score >= 30,
    riskScore: score,
    severity: severity(score),
    anomalyType: "manual_price_override",
    confidence: Math.min(0.99, 0.65 + Math.min(change, 50) / 100),
    reason: `Transaction price differs from the system price by ${change.toFixed(1)}%.`,
    evidence: [`System price: ${systemPrice}`, `Transaction price: ${transactionPrice}`, `Difference: ${change.toFixed(1)}%`],
  };
}
