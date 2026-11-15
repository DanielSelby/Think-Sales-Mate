export type EducationLedgerInput = {
  id: string;
  entryDate: string;
  journalNumber: number;
  lineNumber: number;
  debit: string | number;
  credit: string | number;
  description: string;
};

export type EducationLedgerEntry = EducationLedgerInput & {
  debitCents: number;
  creditCents: number;
  runningBalanceCents: number;
};

function amountToCents(amount: string | number) {
  const value = String(amount);
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw new Error(`Invalid ledger amount: ${value}`);
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

export function calculateEducationLedger(
  entries: EducationLedgerInput[],
  normalBalance: "debit" | "credit",
): EducationLedgerEntry[] {
  let runningBalanceCents = 0;
  return [...entries]
    .sort((left, right) =>
      left.entryDate.localeCompare(right.entryDate)
      || left.journalNumber - right.journalNumber
      || left.lineNumber - right.lineNumber
    )
    .map((entry) => {
      const debitCents = amountToCents(entry.debit);
      const creditCents = amountToCents(entry.credit);
      runningBalanceCents += normalBalance === "debit"
        ? debitCents - creditCents
        : creditCents - debitCents;
      return { ...entry, debitCents, creditCents, runningBalanceCents };
    });
}
