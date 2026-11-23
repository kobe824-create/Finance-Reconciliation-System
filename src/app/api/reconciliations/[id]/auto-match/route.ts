import { auditStatement, errorResponse } from "@/lib/api";
import { getDb } from "@/lib/db";
import { matchTransactions } from "@/lib/reconciliation";
import { requireUser } from "@/lib/session";
import type { StatementTransaction } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser(["admin", "preparer"]);
    const { id } = await context.params;
    const sql = getDb();
    const [recon] = await sql`SELECT status::text FROM reconciliations WHERE id = ${id}`;
    if (!recon) throw Object.assign(new Error("Reconciliation not found."), { status: 404 });
    if (recon.status === "approved" || recon.status === "in_review") throw Object.assign(new Error("This reconciliation is locked while it is in review or approved."), { status: 409 });
    const rows = await sql`SELECT t.id::text, t.reconciliation_id::text, t.source_file_id::text, t.source::text,
        t.transaction_date::text, t.description, t.reference, t.amount::text, t.currency,
        m.id::text AS match_id
      FROM transactions t LEFT JOIN match_sets m ON m.bank_transaction_id = t.id OR m.ledger_transaction_id = t.id
      WHERE t.reconciliation_id = ${id} ORDER BY t.transaction_date, t.id`;
    const transactions: StatementTransaction[] = rows.map((row) => ({
      id: String(row.id), reconciliationId: String(row.reconciliation_id), sourceFileId: row.source_file_id ? String(row.source_file_id) : undefined,
      source: row.source as StatementTransaction["source"], date: String(row.transaction_date).slice(0, 10), description: String(row.description),
      reference: row.reference ? String(row.reference) : undefined, amount: Number(row.amount), currency: String(row.currency).trim(), matchId: row.match_id ? String(row.match_id) : undefined,
    }));
    const result = matchTransactions(transactions);
    let inserted = 0;
    if (result.matches.length) {
      const pairs = JSON.stringify(result.matches.map((pair) => ({ bankId: pair.bank.id, ledgerId: pair.ledger.id, method: pair.confidence })));
      const [insertedRows] = await sql.transaction([
        sql`INSERT INTO match_sets (reconciliation_id, bank_transaction_id, ledger_transaction_id, match_method, matched_by)
          SELECT ${id}, pair.bank_id::uuid, pair.ledger_id::uuid, pair.match_method, ${actor.id}
          FROM jsonb_to_recordset(${pairs}::jsonb) AS pair(bank_id text, ledger_id text, match_method text)
          ON CONFLICT DO NOTHING RETURNING id`,
        sql`UPDATE reconciliations SET updated_at = now() WHERE id = ${id}`,
        auditStatement(sql, actor.id, "Auto-matched transactions", "reconciliation", id, { proposedCount: result.matches.length, unmatchedBank: result.unmatchedBank.length, unmatchedLedger: result.unmatchedLedger.length }),
      ]);
      inserted = insertedRows.length;
    }
    return Response.json({ matched: inserted, unmatchedBank: result.unmatchedBank.length, unmatchedLedger: result.unmatchedLedger.length });
  } catch (error) {
    return errorResponse(error);
  }
}
