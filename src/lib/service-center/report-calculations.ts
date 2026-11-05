export type ServicePaymentReportRow = {
  amount: number;
  payment_method: string;
};

export type ServicePartMovementReportRow = {
  movement_type: "issued" | "returned";
  quantity: number;
  unit_cost: number;
};

function roundCurrency(amount: number) {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function calculateServicePaymentSummary(rows: ServicePaymentReportRow[]) {
  const methods = new Map<string, { count: number; amount: number }>();
  let total = 0;
  let count = 0;

  for (const row of rows) {
    const amount = Number(row.amount);
    if (!Number.isFinite(amount) || amount < 0) continue;
    count += 1;
    total += amount;
    const method = methods.get(row.payment_method) ?? { count: 0, amount: 0 };
    method.count += 1;
    method.amount += amount;
    methods.set(row.payment_method, method);
  }

  return {
    total: roundCurrency(total),
    count,
    methods: Array.from(methods, ([name, summary]) => ({
      name,
      count: summary.count,
      amount: roundCurrency(summary.amount),
    }))
      .sort((left, right) => right.amount - left.amount || left.name.localeCompare(right.name)),
  };
}

export function calculateServicePartsSummary(rows: ServicePartMovementReportRow[]) {
  let issuedQuantity = 0;
  let returnedQuantity = 0;
  let netCost = 0;

  for (const row of rows) {
    const quantity = Number(row.quantity);
    const unitCost = Number(row.unit_cost);
    if (!Number.isFinite(quantity) || !Number.isFinite(unitCost) || quantity <= 0 || unitCost < 0) continue;
    if (row.movement_type === "issued") {
      issuedQuantity += quantity;
      netCost += quantity * unitCost;
    } else {
      returnedQuantity += quantity;
      netCost -= quantity * unitCost;
    }
  }

  return { issuedQuantity, returnedQuantity, netCost: roundCurrency(netCost) };
}

export function calculateAverageServiceTurnaroundDays(
  jobs: Array<{ id: string; created_at: string }>,
  closedAtByJobId: Map<string, string>,
) {
  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const durations: number[] = [];

  for (const [jobId, closedAt] of closedAtByJobId) {
    const job = jobById.get(jobId);
    if (!job) continue;
    const duration = new Date(closedAt).getTime() - new Date(job.created_at).getTime();
    if (Number.isFinite(duration) && duration >= 0) durations.push(duration / 86_400_000);
  }

  if (!durations.length) return null;
  return durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
}
