import { auditStatement, errorResponse, requestJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { randomUUID } from "node:crypto";
import { isValidIsoDate } from "@/lib/dates";

export const runtime = "nodejs";

type ReconciliationBody = { accountId?: string; periodStart?: string; periodEnd?: string; statementBalance?: number; bookBalance?: number };
const validDate = (value: unknown) => typeof value === "string" && isValidIsoDate(value);

export async function POST(request: Request) {
  try {
    const actor = await requireUser(["admin", "preparer"]);
    const body = await requestJson<ReconciliationBody>(request);
    const { accountId, periodStart, periodEnd } = body;
    const statementBalance = Number(body.statementBalance);
    const bookBalance = Number(body.bookBalance);
    if (!accountId || !validDate(periodStart) || !validDate(periodEnd) || periodStart! > periodEnd! || !Number.isFinite(statementBalance) || !Number.isFinite(bookBalance)) {
      throw Object.assign(new Error("Choose an account and valid period, then enter both closing balances."), { status: 400 });
    }
    const sql = getDb();
    const [account] = await sql`SELECT id FROM accounts WHERE id = ${accountId} AND organization_id = ${actor.organizationId} AND active = TRUE`;
    if (!account) throw Object.assign(new Error("The selected account is unavailable."), { status: 404 });
    const id = randomUUID();
    const [result] = await sql.transaction([
      sql`INSERT INTO reconciliations (id, account_id, period_start, period_end, statement_balance, book_balance, preparer_id)
        SELECT ${id}, a.id, ${periodStart}::date, ${periodEnd}::date, ${statementBalance}, ${bookBalance}, ${actor.id}
        FROM accounts a WHERE a.id = ${accountId} AND a.organization_id = ${actor.organizationId} AND a.active = TRUE RETURNING id::text`,
      auditStatement(sql, actor.id, "Created reconciliation", "reconciliation", id, { accountId, periodStart, periodEnd, statementBalance, bookBalance }, actor.organizationId),
    ]);
    if (!result[0]) throw Object.assign(new Error("The selected account is unavailable."), { status: 404 });
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
