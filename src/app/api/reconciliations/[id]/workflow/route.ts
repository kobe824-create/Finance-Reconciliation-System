import { auditStatement, errorResponse, requestJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
type WorkflowBody = { action?: "submit" | "approve" | "return"; note?: string };

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser();
    const { id } = await context.params;
    const { action, note } = await requestJson<WorkflowBody>(request);
    const sql = getDb();
    const [recon] = await sql`SELECT status::text, preparer_id::text, statement_balance::text, book_balance::text,
        (SELECT count(*)::int FROM transactions t WHERE t.reconciliation_id = reconciliations.id AND NOT EXISTS (
          SELECT 1 FROM match_sets m WHERE m.bank_transaction_id = t.id OR m.ledger_transaction_id = t.id
        )) AS unmatched,
        (SELECT count(*)::int FROM source_files f WHERE f.reconciliation_id = reconciliations.id AND f.import_complete = FALSE) AS incomplete_files,
        (SELECT count(*)::int FROM source_files f WHERE f.reconciliation_id = reconciliations.id AND f.source = 'bank') AS bank_files,
        (SELECT count(*)::int FROM source_files f WHERE f.reconciliation_id = reconciliations.id AND f.source = 'ledger') AS ledger_files
      FROM reconciliations JOIN accounts scoped_account ON scoped_account.id = reconciliations.account_id
      WHERE reconciliations.id = ${id} AND scoped_account.organization_id = ${actor.organizationId}`;
    if (!recon) throw Object.assign(new Error("Reconciliation not found."), { status: 404 });
    if (recon.status === "approved") throw Object.assign(new Error("Approved reconciliations are locked."), { status: 409 });

    if (action === "submit") {
      if (!["admin", "preparer"].includes(actor.role)) throw Object.assign(new Error("Only a preparer can submit a reconciliation."), { status: 403 });
      if (recon.status === "in_review") throw Object.assign(new Error("This reconciliation is already in review."), { status: 409 });
      if (Number(recon.incomplete_files) > 0) throw Object.assign(new Error("Finish all statement imports before sending this reconciliation for review."), { status: 409 });
      if (Number(recon.bank_files) < 1 || Number(recon.ledger_files) < 1) throw Object.assign(new Error("Import at least one bank statement and one ledger file before review."), { status: 409 });
      await sql.transaction([
        sql`UPDATE reconciliations SET status = 'in_review', reviewer_id = NULL, reviewer_note = NULL, updated_at = now() WHERE id = ${id}`,
        auditStatement(sql, actor.id, "Submitted reconciliation for review", "reconciliation", id, { unmatched: Number(recon.unmatched) }, actor.organizationId),
      ]);
      return Response.json({ status: "in_review" });
    }

    if (action === "approve") {
      if (!["admin", "reviewer"].includes(actor.role)) throw Object.assign(new Error("Only a reviewer can approve a reconciliation."), { status: 403 });
      if (actor.id === String(recon.preparer_id)) throw Object.assign(new Error("The preparer cannot approve their own reconciliation."), { status: 403 });
      if (recon.status !== "in_review") throw Object.assign(new Error("Submit this reconciliation before approving it."), { status: 409 });
      if (Number(recon.incomplete_files) > 0) throw Object.assign(new Error("Finish all statement imports before approval."), { status: 409 });
      if (Number(recon.bank_files) < 1 || Number(recon.ledger_files) < 1) throw Object.assign(new Error("Approval requires both a bank statement and a ledger file."), { status: 409 });
      if (Number(recon.unmatched) > 0 || Math.round(Number(recon.statement_balance) * 100) !== Math.round(Number(recon.book_balance) * 100)) throw Object.assign(new Error("Resolve all unmatched transactions and balance differences before approval."), { status: 409 });
      await sql.transaction([
        sql`UPDATE reconciliations SET status = 'approved', reviewer_id = ${actor.id}, reviewer_note = NULL, updated_at = now() WHERE id = ${id}`,
        auditStatement(sql, actor.id, "Approved reconciliation", "reconciliation", id, {}, actor.organizationId),
      ]);
      return Response.json({ status: "approved" });
    }

    if (action === "return") {
      if (!["admin", "reviewer"].includes(actor.role)) throw Object.assign(new Error("Only a reviewer can return a reconciliation."), { status: 403 });
      if (recon.status !== "in_review") throw Object.assign(new Error("Only a reconciliation in review can be returned."), { status: 409 });
      const reviewerNote = String(note ?? "").trim().slice(0, 1000);
      if (!reviewerNote) throw Object.assign(new Error("Add a review note describing the issue."), { status: 400 });
      await sql.transaction([
        sql`UPDATE reconciliations SET status = 'needs_attention', reviewer_id = ${actor.id}, reviewer_note = ${reviewerNote}, updated_at = now() WHERE id = ${id}`,
        auditStatement(sql, actor.id, "Returned reconciliation for changes", "reconciliation", id, { note: reviewerNote }, actor.organizationId),
      ]);
      return Response.json({ status: "needs_attention" });
    }

    throw Object.assign(new Error("Choose submit, approve, or return."), { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}
