import { errorResponse } from "@/lib/api";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import type { WorkspaceData } from "@/lib/types";

export const runtime = "nodejs";

const s = (value: unknown) => value == null ? "" : String(value);
const n = (value: unknown) => Number(value ?? 0);
const dateOnly = (value: unknown) => s(value).slice(0, 10);

export async function GET() {
  try {
    await requireUser();
    const sql = getDb();
    const [accountRows, userRows, reconRows, txnRows, fileRows, auditRows] = await Promise.all([
      sql`SELECT id::text, name, institution, currency, account_number_masked, active FROM accounts ORDER BY name`,
      sql`SELECT id::text, name, email, role::text, active FROM app_users ORDER BY name`,
      sql`SELECT r.id::text, r.account_id::text, a.name AS account_name, a.institution, a.currency,
                 r.period_start::text, r.period_end::text, r.statement_balance::text, r.book_balance::text,
                 r.status::text, r.preparer_id::text, p.name AS preparer_name, r.reviewer_id::text, r.reviewer_note,
                 reviewer.name AS reviewer_name, r.created_at, r.updated_at,
                 count(DISTINCT m.id)::int AS matched_count,
                 count(DISTINCT t.id) FILTER (WHERE t.source = 'bank' AND m.id IS NULL)::int AS unmatched_bank_count,
                 count(DISTINCT t.id) FILTER (WHERE t.source = 'ledger' AND m.id IS NULL)::int AS unmatched_ledger_count
          FROM reconciliations r
          JOIN accounts a ON a.id = r.account_id
          JOIN app_users p ON p.id = r.preparer_id
          LEFT JOIN app_users reviewer ON reviewer.id = r.reviewer_id
          LEFT JOIN transactions t ON t.reconciliation_id = r.id
          LEFT JOIN match_sets m ON m.reconciliation_id = r.id AND (m.bank_transaction_id = t.id OR m.ledger_transaction_id = t.id)
          GROUP BY r.id, a.id, p.id, reviewer.id
          ORDER BY r.period_end DESC, r.updated_at DESC`,
      sql`SELECT t.id::text, t.reconciliation_id::text, t.source_file_id::text, t.source::text,
                 t.transaction_date::text, t.description, t.reference, t.amount::text, t.currency,
                 m.id::text AS match_id
          FROM transactions t
          LEFT JOIN match_sets m ON m.bank_transaction_id = t.id OR m.ledger_transaction_id = t.id
          ORDER BY t.transaction_date DESC, t.created_at DESC LIMIT 5000`,
      sql`SELECT f.id::text, f.reconciliation_id::text, f.file_name, f.source::text, f.row_count,
                 f.file_size, f.sha256, f.imported_at, f.uploaded_by::text, f.import_complete
          FROM source_files f ORDER BY f.imported_at DESC LIMIT 1000`,
      sql`SELECT l.id::text, l.actor_id::text, u.name AS actor_name, l.action, l.entity_type,
                 l.entity_id, l.details, l.created_at
          FROM audit_log l JOIN app_users u ON u.id = l.actor_id ORDER BY l.created_at DESC LIMIT 500`,
    ]);

    const data: WorkspaceData = {
      accounts: accountRows.map((row) => ({ id: s(row.id), name: s(row.name), institution: s(row.institution), currency: s(row.currency).trim(), accountNumber: s(row.account_number_masked), active: Boolean(row.active) })),
      users: userRows.map((row) => ({ id: s(row.id), name: s(row.name), email: s(row.email), role: row.role as WorkspaceData["users"][number]["role"], active: Boolean(row.active) })),
      reconciliations: reconRows.map((row) => {
        const statementBalance = n(row.statement_balance);
        const bookBalance = n(row.book_balance);
        return {
          id: s(row.id), accountId: s(row.account_id), accountName: s(row.account_name), institution: s(row.institution), currency: s(row.currency).trim(),
          periodStart: dateOnly(row.period_start), periodEnd: dateOnly(row.period_end), statementBalance, bookBalance,
          status: row.status as WorkspaceData["reconciliations"][number]["status"], preparerId: s(row.preparer_id), preparerName: s(row.preparer_name),
          reviewerId: row.reviewer_id ? s(row.reviewer_id) : undefined, reviewerName: row.reviewer_name ? s(row.reviewer_name) : undefined,
          reviewerNote: row.reviewer_note ? s(row.reviewer_note) : undefined,
          createdAt: new Date(s(row.created_at)).toISOString(), updatedAt: new Date(s(row.updated_at)).toISOString(),
          matchedCount: n(row.matched_count), unmatchedBankCount: n(row.unmatched_bank_count), unmatchedLedgerCount: n(row.unmatched_ledger_count), difference: statementBalance - bookBalance,
        };
      }),
      transactions: txnRows.map((row) => ({ id: s(row.id), reconciliationId: s(row.reconciliation_id), sourceFileId: row.source_file_id ? s(row.source_file_id) : undefined, source: row.source as WorkspaceData["transactions"][number]["source"], date: dateOnly(row.transaction_date), description: s(row.description), reference: row.reference ? s(row.reference) : undefined, amount: n(row.amount), currency: s(row.currency).trim(), matchId: row.match_id ? s(row.match_id) : undefined })),
      sourceFiles: fileRows.map((row) => ({ id: s(row.id), reconciliationId: s(row.reconciliation_id), fileName: s(row.file_name), source: row.source as WorkspaceData["sourceFiles"][number]["source"], rowCount: n(row.row_count), fileSize: n(row.file_size), sha256: s(row.sha256), importedAt: new Date(s(row.imported_at)).toISOString(), uploadedBy: s(row.uploaded_by), importComplete: Boolean(row.import_complete) })),
      auditLog: auditRows.map((row) => ({ id: s(row.id), actorId: s(row.actor_id), actorName: s(row.actor_name), action: s(row.action), entityType: s(row.entity_type), entityId: s(row.entity_id), details: (row.details ?? {}) as Record<string, unknown>, createdAt: new Date(s(row.created_at)).toISOString() })),
    };
    return Response.json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}
