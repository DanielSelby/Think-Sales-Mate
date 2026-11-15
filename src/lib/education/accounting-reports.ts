export type EducationReportAccount = {
  id: string;
  code: string;
  name: string;
  account_type: "asset" | "liability" | "equity" | "income" | "expense";
  normal_balance: "debit" | "credit";
  is_cash_account: boolean;
  cash_flow_activity: "operating" | "investing" | "financing" | null;
};

export type EducationReportLine = {
  id: string;
  journal_id: string;
  account_id: string;
  entry_date: string;
  debit: string | number;
  credit: string | number;
};

export type EducationAccountBalance = {
  account: EducationReportAccount;
  debitCents: number;
  creditCents: number;
};

export type EducationCashFlow = {
  operatingCents: number;
  investingCents: number;
  financingCents: number;
  unclassifiedCents: number;
};

function amountToCents(amount: string | number) {
  const value = String(amount);
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw new Error(`Invalid accounting report amount: ${value}`);
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

function netCents(account: EducationReportAccount, lines: EducationReportLine[]) {
  return lines.reduce((balance, line) => {
    const debit = amountToCents(line.debit);
    const credit = amountToCents(line.credit);
    return balance + (account.normal_balance === "debit" ? debit - credit : credit - debit);
  }, 0);
}

export function buildEducationTrialBalance(
  accounts: EducationReportAccount[],
  lines: EducationReportLine[],
): EducationAccountBalance[] {
  return accounts.map((account) => {
    const balance = netCents(account, lines.filter((line) => line.account_id === account.id));
    return {
      account,
      debitCents: balance >= 0
        ? account.normal_balance === "debit" ? balance : 0
        : account.normal_balance === "credit" ? -balance : 0,
      creditCents: balance >= 0
        ? account.normal_balance === "credit" ? balance : 0
        : account.normal_balance === "debit" ? -balance : 0,
    };
  }).filter((row) => row.debitCents !== 0 || row.creditCents !== 0)
    .sort((left, right) => left.account.code.localeCompare(right.account.code));
}

export function buildEducationIncomeStatement(
  accounts: EducationReportAccount[],
  lines: EducationReportLine[],
): {
  income: EducationAccountBalance[];
  expenses: EducationAccountBalance[];
  incomeCents: number;
  expensesCents: number;
  netIncomeCents: number;
} {
  const income = buildEducationTrialBalance(
    accounts.filter((account) => account.account_type === "income"),
    lines,
  );
  const expenses = buildEducationTrialBalance(
    accounts.filter((account) => account.account_type === "expense"),
    lines,
  );
  const incomeCents = income.reduce((sum, row) => sum + row.creditCents - row.debitCents, 0);
  const expensesCents = expenses.reduce((sum, row) => sum + row.debitCents - row.creditCents, 0);
  return { income, expenses, incomeCents, expensesCents, netIncomeCents: incomeCents - expensesCents };
}

export function buildEducationBalanceSheet(
  accounts: EducationReportAccount[],
  balanceLines: EducationReportLine[],
  earningsLines: EducationReportLine[],
): {
  assets: EducationAccountBalance[];
  liabilities: EducationAccountBalance[];
  equity: EducationAccountBalance[];
  currentEarningsCents: number;
  assetsCents: number;
  liabilitiesCents: number;
  equityCents: number;
} {
  const assets = buildEducationTrialBalance(
    accounts.filter((account) => account.account_type === "asset"),
    balanceLines,
  );
  const liabilities = buildEducationTrialBalance(
    accounts.filter((account) => account.account_type === "liability"),
    balanceLines,
  );
  const equity = buildEducationTrialBalance(
    accounts.filter((account) => account.account_type === "equity"),
    balanceLines,
  );
  const currentEarningsCents = buildEducationIncomeStatement(accounts, earningsLines).netIncomeCents;
  const assetsCents = assets.reduce((sum, row) => sum + row.debitCents - row.creditCents, 0);
  const liabilitiesCents = liabilities.reduce((sum, row) => sum + row.creditCents - row.debitCents, 0);
  const equityCents = equity.reduce((sum, row) => sum + row.creditCents - row.debitCents, 0)
    + currentEarningsCents;
  return { assets, liabilities, equity, currentEarningsCents, assetsCents, liabilitiesCents, equityCents };
}

export function buildEducationCashFlow(
  accounts: EducationReportAccount[],
  lines: EducationReportLine[],
): EducationCashFlow {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const journalLines = new Map<string, EducationReportLine[]>();
  for (const line of lines) {
    const current = journalLines.get(line.journal_id) ?? [];
    current.push(line);
    journalLines.set(line.journal_id, current);
  }

  const totals: EducationCashFlow = {
    operatingCents: 0,
    investingCents: 0,
    financingCents: 0,
    unclassifiedCents: 0,
  };
  for (const group of journalLines.values()) {
    let cashChange = 0;
    const activities = new Set<EducationCashFlowKey>();
    for (const line of group) {
      const account = accountById.get(line.account_id);
      if (!account) continue;
      if (account.is_cash_account) {
        cashChange += amountToCents(line.debit) - amountToCents(line.credit);
      } else if (account.cash_flow_activity) {
        activities.add(account.cash_flow_activity);
      }
    }
    if (cashChange === 0) continue;
    const activity = activities.size === 1 ? Array.from(activities)[0] : null;
    const key = activity ? `${activity}Cents` as const : "unclassifiedCents";
    totals[key] += cashChange;
  }
  return totals;
}

type EducationCashFlowKey = "operating" | "investing" | "financing";
