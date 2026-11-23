import { auditStatement, errorResponse, requestJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { isValidIsoDate } from "@/lib/dates";

export const runtime = "nodejs";
type ImportedRow = { date?: string; description?: string; reference?: string; amount?: number };
type ChunkBody = { startRow?: number; totalRows?: number; rows?: ImportedRow[] };
const CHUNK_SIZE = 500;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser(["admin", "preparer"]);
    const { id: sourceFileId } = await context.params;
    const body = await requestJson<ChunkBody>(request);
    const startRow = Number(body.startRow);
    const totalRows = Number(body.totalRows);
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!Number.isInteger(startRow) || startRow < 0 || !Number.isInteger(totalRows) || totalRows < 1 || totalRows > 5000 || !rows.length || rows.length > CHUNK_SIZE || startRow + rows.length > totalRows) {
      throw Object.assign(new Error("Transaction batches must contain 1–500 rows and stay within the file row count."), { status: 400 });
    }
    const normalized = rows.map((row) => {
      const date = String(row.date ?? "");
      const description = String(row.description ?? "").trim().slice(0, 500);
      const amount = Number(row.amount);
      const reference = String(row.reference ?? "").trim().slice(0, 128);
      if (!isValidIsoDate(date) || !description || !Number.isFinite(amount) || Math.abs(amount) > 1_000_000_000_000) {
        throw Object.assign(new Error("Every imported row needs a valid date, description, and finite amount."), { status: 400 });
      }
      return { date, description, reference: reference || null, amount: Math.round(amount * 100) / 100 };
    });
    const sql = getDb();
    const [file] = await sql`SELECT f.reconciliation_id::text, f.source::text, f.row_count, f.import_complete,
        r.status::text, a.currency
      FROM source_files f JOIN reconciliations r ON r.id = f.reconciliation_id JOIN accounts a ON a.id = r.account_id
      WHERE f.id = ${sourceFileId} AND a.organization_id = ${actor.organizationId}`;
    if (!file) throw Object.assign(new Error("Source file not found."), { status: 404 });
    if (file.import_complete) throw Object.assign(new Error("This statement import is already complete."), { status: 409 });
    if (file.status === "approved" || file.status === "in_review") throw Object.assign(new Error("This reconciliation is locked while it is in review or approved."), { status: 409 });
    if (Number(file.row_count) !== totalRows) throw Object.assign(new Error("The transaction count does not match the statement file."), { status: 409 });
    const reconciliationId = String(file.reconciliation_id);
    const currency = String(file.currency).trim().toUpperCase();
    const values = JSON.stringify(normalized);
    await sql.transaction([
      sql`INSERT INTO transactions (reconciliation_id, source_file_id, source, source_row_number, transaction_date, description, reference, amount, currency)
        SELECT ${reconciliationId}, ${sourceFileId}, ${file.source}, ${startRow} + entry.ordinality::int - 1,
          row_data.date::date, row_data.description, row_data.reference, row_data.amount::numeric, ${currency}
        FROM jsonb_array_elements(${values}::jsonb) WITH ORDINALITY AS entry(value, ordinality)
        CROSS JOIN LATERAL jsonb_to_record(entry.value) AS row_data(date text, description text, reference text, amount numeric)
        ON CONFLICT (source_file_id, source_row_number) DO UPDATE SET transaction_date = EXCLUDED.transaction_date,
          description = EXCLUDED.description, reference = EXCLUDED.reference, amount = EXCLUDED.amount, currency = EXCLUDED.currency`,
      sql`UPDATE reconciliations SET updated_at = now() WHERE id = ${reconciliationId}`,
    ]);

    const finalChunk = startRow + normalized.length === totalRows;
    if (finalChunk) {
      const [count] = await sql`SELECT count(*)::int AS rows FROM transactions WHERE source_file_id = ${sourceFileId}`;
      if (Number(count.rows) !== totalRows) throw Object.assign(new Error("A transaction batch is missing. Retry the missing rows before finishing this import."), { status: 409 });
      await sql.transaction([
        sql`UPDATE source_files SET import_complete = TRUE WHERE id = ${sourceFileId}`,
        auditStatement(sql, actor.id, "Completed statement import", "source_file", sourceFileId, { reconciliationId, rows: totalRows, source: file.source }, actor.organizationId),
      ]);
    }
    return Response.json({ accepted: normalized.length, importComplete: finalChunk });
  } catch (error) {
    return errorResponse(error);
  }
}
