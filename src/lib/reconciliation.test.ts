import { describe, expect, it } from "vitest";
import { matchTransactions } from "@/lib/reconciliation";
import { normalizeAmount, normalizeDate } from "@/lib/import-parsers";
import type { StatementTransaction } from "@/lib/types";

function txn(id: string, source: "bank" | "ledger", amount: number, date: string, description: string, reference?: string): StatementTransaction {
  return { id, reconciliationId: "recon-1", source, amount, date, description, reference, currency: "RWF" };
}

describe("transaction normalization", () => {
  it("normalizes common dates and accounting amounts", () => {
    expect(normalizeDate("23/11/2026")).toBe("2026-11-23");
    expect(normalizeDate("11/02/2026")).toBe("2026-02-11");
    expect(normalizeDate("2026-11-23")).toBe("2026-11-23");
    expect(normalizeDate("2026-02-31")).toBeUndefined();
    expect(normalizeAmount("(1,250.50)")).toBe(-1250.5);
    expect(normalizeAmount("RWF 12,500")).toBe(12500);
  });
});

describe("conservative transaction matching", () => {
  it("matches a normalized reference when the posting dates are within three days", () => {
    const result = matchTransactions([
      txn("b1", "bank", 250000, "2026-11-03", "Incoming transfer", "TX-4481"),
      txn("l1", "ledger", 250000, "2026-11-05", "Project settlement", "TX4481"),
    ]);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].confidence).toBe("reference");
  });

  it("matches clear descriptions on the same date even when references are absent", () => {
    const result = matchTransactions([
      txn("b1", "bank", -750000, "2026-11-05", "Office rent November"),
      txn("l1", "ledger", -750000, "2026-11-05", "November office rent"),
    ]);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].confidence).toBe("description");
  });

  it("leaves an amount mismatch unresolved", () => {
    const result = matchTransactions([
      txn("b1", "bank", 1000, "2026-11-05", "Grant transfer", "A-1"),
      txn("l1", "ledger", 1001, "2026-11-05", "Grant transfer", "A-1"),
    ]);
    expect(result.matches).toHaveLength(0);
    expect(result.unmatchedBank.map((row) => row.id)).toEqual(["b1"]);
    expect(result.unmatchedLedger.map((row) => row.id)).toEqual(["l1"]);
  });

  it("does not auto-pair two ledger entries against one bank entry", () => {
    const result = matchTransactions([
      txn("b1", "bank", 1500, "2026-11-05", "Service settlement", "R-5"),
      txn("l1", "ledger", 1500, "2026-11-05", "Service settlement", "R-5"),
      txn("l2", "ledger", 1500, "2026-11-05", "Service settlement", "R-5"),
    ]);
    expect(result.matches).toHaveLength(1);
    expect(result.unmatchedLedger).toHaveLength(1);
  });
});
