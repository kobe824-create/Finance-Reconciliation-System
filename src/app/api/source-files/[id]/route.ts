import { errorResponse } from "@/lib/api";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser();
    const { id } = await context.params;
    const sql = getDb();
    const [file] = await sql`SELECT f.file_name, f.content_type, f.original_content FROM source_files f JOIN reconciliations r ON r.id = f.reconciliation_id JOIN accounts a ON a.id = r.account_id WHERE f.id = ${id} AND a.organization_id = ${actor.organizationId}`;
    if (!file) throw Object.assign(new Error("Source file not found."), { status: 404 });
    const bytes = Buffer.from(file.original_content as Uint8Array);
    const safeName = String(file.file_name).replace(/[\r\n"\\]/g, "_");
    return new Response(bytes, { headers: {
      "Content-Type": String(file.content_type || "application/octet-stream"),
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Content-Length": String(bytes.byteLength),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    } });
  } catch (error) {
    return errorResponse(error);
  }
}
