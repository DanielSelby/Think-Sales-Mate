export type BankStatementTransaction = {
  id: string;
  type: "deposit" | "withdrawal";
  amount: number;
  description: string | null;
  counterparty_name: string | null;
  transaction_category: string | null;
  transaction_date: string;
  created_at: string;
};

export type BankStatementLine = BankStatementTransaction & { runningBalance: number };

export function buildAccountStatement(
  openingBalance: number,
  transactions: BankStatementTransaction[],
  dateFrom: string,
  dateTo: string,
) {
  let runningBalance = openingBalance;
  let statementOpeningBalance = openingBalance;
  let reachedStatementStart = !dateFrom;
  let deposits = 0;
  let withdrawals = 0;
  const statementTransactions: BankStatementLine[] = [];

  const orderedTransactions = [...transactions].sort((left, right) =>
    left.transaction_date.localeCompare(right.transaction_date)
      || left.created_at.localeCompare(right.created_at)
      || left.id.localeCompare(right.id),
  );

  for (const transaction of orderedTransactions) {
    const amount = Number(transaction.amount);
    const signedAmount = transaction.type === "deposit" ? amount : -amount;
    if (dateFrom && transaction.transaction_date < dateFrom) {
      runningBalance += signedAmount;
      statementOpeningBalance = runningBalance;
      continue;
    }
    if (dateTo && transaction.transaction_date > dateTo) continue;
    if (!reachedStatementStart) {
      statementOpeningBalance = runningBalance;
      reachedStatementStart = true;
    }
    runningBalance += signedAmount;
    if (transaction.type === "deposit") deposits += amount;
    else withdrawals += amount;
    statementTransactions.push({ ...transaction, amount, runningBalance });
  }

  if (!reachedStatementStart) statementOpeningBalance = runningBalance;

  return {
    openingBalance: statementOpeningBalance,
    closingBalance: runningBalance,
    deposits,
    withdrawals,
    netChange: deposits - withdrawals,
    transactions: statementTransactions,
  };
}
