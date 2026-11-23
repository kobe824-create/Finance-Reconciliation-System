import type { StatementTransaction, TransactionSource } from "@/lib/types";

export type MatchPair = { bank: StatementTransaction; ledger: StatementTransaction; confidence: "reference" | "description" };
export type MatchResult = { matches: MatchPair[]; unmatchedBank: StatementTransaction[]; unmatchedLedger: StatementTransaction[] };

const compact = (value = "") => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const cents = (value: number) => Math.round(value * 100);
const day = (value: string) => Date.parse(`${value.slice(0, 10)}T00:00:00Z`);

function sameDayOrNear(a: string, b: string, toleranceDays: number) {
  const difference = Math.abs(day(a) - day(b));
  return Number.isFinite(difference) && difference <= toleranceDays * 86_400_000;
}

function tokenSimilarity(a: string, b: string) {
  const left = new Set(a.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2));
  const right = new Set(b.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2));
  if (!left.size || !right.size) return 0;
  const shared = [...left].filter((word) => right.has(word)).length;
  return shared / Math.max(left.size, right.size);
}

/**
 * Conservative one-to-one matching. A pair is auto-matched only when amounts
 * agree to the cent and either the reference agrees or the descriptions are
 * strongly alike on the same posting date. Other candidates stay in review.
 */
export function matchTransactions(transactions: StatementTransaction[], toleranceDays = 1): MatchResult {
  const bankRows = transactions.filter((row) => row.source === "bank" && !row.matchId);
  const ledgerRows = transactions.filter((row) => row.source === "ledger" && !row.matchId);
  const usedLedger = new Set<string>();
  const matches: MatchPair[] = [];
  const ledgerByAmount = new Map<number, StatementTransaction[]>();
  for (const ledger of ledgerRows) {
    const amount = cents(ledger.amount);
    const bucket = ledgerByAmount.get(amount) ?? [];
    bucket.push(ledger);
    ledgerByAmount.set(amount, bucket);
  }

  for (const bank of bankRows) {
    const candidates = (ledgerByAmount.get(cents(bank.amount)) ?? [])
      .filter((ledger) => !usedLedger.has(ledger.id) && cents(ledger.amount) === cents(bank.amount))
      .map((ledger) => {
        const referenceEqual = !!compact(bank.reference) && compact(bank.reference) === compact(ledger.reference);
        const similarity = tokenSimilarity(bank.description, ledger.description);
        const nearDate = sameDayOrNear(bank.date, ledger.date, toleranceDays);
        const confidence = referenceEqual && sameDayOrNear(bank.date, ledger.date, 3)
          ? "reference"
          : nearDate && similarity >= 0.66
            ? "description"
            : undefined;
        return { ledger, confidence, score: (referenceEqual ? 100 : 0) + similarity * 10 - Math.abs(day(bank.date) - day(ledger.date)) / 86_400_000 };
      })
      .filter((candidate) => candidate.confidence)
      .sort((a, b) => b.score - a.score);

    if (candidates[0]) {
      usedLedger.add(candidates[0].ledger.id);
      matches.push({ bank, ledger: candidates[0].ledger, confidence: candidates[0].confidence as MatchPair["confidence"] });
    }
  }

  return {
    matches,
    unmatchedBank: bankRows.filter((row) => !matches.some((match) => match.bank.id === row.id)),
    unmatchedLedger: ledgerRows.filter((row) => !usedLedger.has(row.id)),
  };
}

export function oppositeSource(source: TransactionSource): TransactionSource {
  return source === "bank" ? "ledger" : "bank";
}

export function reconciledStatus(difference: number, unmatchedCount: number) {
  return Math.abs(difference) < 0.005 && unmatchedCount === 0 ? "approved" : "needs_attention";
}
