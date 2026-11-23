import { randomUUID } from "node:crypto";
import { auditStatement, errorResponse, requestJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
type MatchBody = { bankTransactionId?: string; ledgerTransactionId?: string };

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser(["admin", "preparer"]);
    const { id } = await context.params;
    const body = await requestJson<MatchBody>(request);
    if (!body.bankTransactionId || !body.ledgerTransactionId || body.bankTransactionId === body.ledgerTransactionId) throw Object.assign(new Error("Choose one bank row and one ledger row."), { status: 400 });
    const sql = getDb();
    const [recon] = await sql`SELECT r.status::text FROM reconciliations r JOIN accounts a ON a.id = r.account_id WHERE r.id = ${id} AND a.organization_id = ${actor.organizationId}`;
    if (!recon) throw Object.assign(new Error("Reconciliation not found."), { status: 404 });
    if (recon.status === "approved" || recon.status === "in_review") throw Object.assign(new Error("This reconciliation is locked while it is in review or approved."), { status: 409 });
    const transactions = await sql`SELECT id::text, source::text, reconciliation_id::text FROM transactions WHERE id IN (${body.bankTransactionId}, ${body.ledgerTransactionId})`;
    const bank = transactions.find((row) => String(row.id) === body.bankTransactionId);
    const ledger = transactions.find((row) => String(row.id) === body.ledgerTransactionId);
    if (!bank || !ledger || bank.source !== "bank" || ledger.source !== "ledger" || bank.reconciliation_id !== id || ledger.reconciliation_id !== id) throw Object.assign(new Error("The selected rows do not belong to opposite sides of this reconciliation."), { status: 400 });
    const [used] = await sql`SELECT count(*)::int AS used FROM match_sets WHERE bank_transaction_id IN (${body.bankTransactionId}, ${body.ledgerTransactionId}) OR ledger_transaction_id IN (${body.bankTransactionId}, ${body.ledgerTransactionId})`;
    if (Number(used?.used ?? 0)) throw Object.assign(new Error("One of these transactions is already matched."), { status: 409 });
    const matchId = randomUUID();
    await sql.transaction([
      sql`INSERT INTO match_sets (id, reconciliation_id, bank_transaction_id, ledger_transaction_id, match_method, matched_by)
        VALUES (${matchId}, ${id}, ${body.bankTransactionId}, ${body.ledgerTransactionId}, 'manual', ${actor.id})`,
      sql`UPDATE reconciliations SET updated_at = now() WHERE id = ${id}`,
      auditStatement(sql, actor.id, "Manually matched transactions", "reconciliation", id, { matchId, bankTransactionId: body.bankTransactionId, ledgerTransactionId: body.ledgerTransactionId }, actor.organizationId),
    ]);
    return Response.json({ matchId }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
