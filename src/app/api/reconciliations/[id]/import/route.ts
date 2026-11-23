import { createHash, randomUUID } from "node:crypto";
import { auditStatement, errorResponse, requestJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import type { TransactionSource } from "@/lib/types";

export const runtime = "nodejs";
const MAX_FILE_SIZE = 2_621_440;
const allowedExtensions = new Set(["csv", "xlsx", "pdf"]);
type ImportBody = { fileName?: string; contentType?: string; contentBase64?: string; sha256?: string; source?: TransactionSource; currency?: string; rowCount?: number };

function cleanFilename(value: string) {
  return value.split(/[\\/]/).pop()!.replace(/[^\p{L}\p{N} ._()-]/gu, "_").slice(0, 160);
}

function validateFile(buffer: Buffer, extension: string) {
  if (extension === "pdf" && buffer.subarray(0, 5).toString("ascii") !== "%PDF-") return false;
  if (extension === "xlsx" && buffer.subarray(0, 2).toString("ascii") !== "PK") return false;
  if (extension === "csv" && buffer.includes(0)) return false;
  return true;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser(["admin", "preparer"]);
    const { id: reconciliationId } = await context.params;
    const body = await requestJson<ImportBody>(request);
    const fileName = cleanFilename(String(body.fileName ?? "statement.csv"));
    const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
    const source = body.source;
    const rowCount = Number(body.rowCount);
    const contentBase64 = String(body.contentBase64 ?? "");
    if (!allowedExtensions.has(extension) || (source !== "bank" && source !== "ledger")) throw Object.assign(new Error("Choose a supported CSV, Excel, or PDF statement and a source side."), { status: 400 });
    if (!Number.isInteger(rowCount) || rowCount < 1 || rowCount > 5000) throw Object.assign(new Error("Each file must contain between 1 and 5,000 parsed transactions."), { status: 400 });
    if (!contentBase64 || contentBase64.length > 3_600_000) throw Object.assign(new Error("Each original file is limited to 2.5 MB."), { status: 413 });
    const content = Buffer.from(contentBase64, "base64");
    if (content.length > MAX_FILE_SIZE || !validateFile(content, extension)) throw Object.assign(new Error("The file content does not match its name or exceeds the 2.5 MB limit."), { status: 400 });
    const sha256 = createHash("sha256").update(content).digest("hex");
    if (body.sha256 && body.sha256 !== sha256) throw Object.assign(new Error("The file checksum did not match. Please retry the import."), { status: 400 });
    const sql = getDb();
    const [recon] = await sql`SELECT r.status::text, a.currency FROM reconciliations r JOIN accounts a ON a.id = r.account_id WHERE r.id = ${reconciliationId}`;
    if (!recon) throw Object.assign(new Error("Reconciliation not found."), { status: 404 });
    if (recon.status === "approved" || recon.status === "in_review") throw Object.assign(new Error("This reconciliation is locked while it is in review or approved."), { status: 409 });
    const currency = String(body.currency ?? recon.currency).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency) || currency !== String(recon.currency).trim().toUpperCase()) throw Object.assign(new Error("Transaction currency must match the selected account."), { status: 400 });
    const [duplicate] = await sql`SELECT id FROM source_files WHERE reconciliation_id = ${reconciliationId} AND source = ${source} AND sha256 = ${sha256}`;
    if (duplicate) throw Object.assign(new Error("This source file has already been imported to this reconciliation."), { status: 409 });
    const sourceFileId = randomUUID();
    await sql.transaction([
      sql`INSERT INTO source_files (id, reconciliation_id, file_name, source, content_type, file_size, sha256, row_count, original_content, uploaded_by)
        VALUES (${sourceFileId}, ${reconciliationId}, ${fileName}, ${source}, ${String(body.contentType ?? "application/octet-stream").slice(0, 100)}, ${content.length}, ${sha256}, ${rowCount}, decode(${contentBase64}, 'base64'), ${actor.id})`,
      auditStatement(sql, actor.id, "Added statement file", "source_file", sourceFileId, { reconciliationId, fileName, source, rows: rowCount, bytes: content.length, sha256 }),
    ]);
    return Response.json({ sourceFileId, rowsExpected: rowCount }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
