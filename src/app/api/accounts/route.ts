import { auditStatement, errorResponse, requestJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

type AccountBody = { name?: string; institution?: string; currency?: string; accountNumber?: string };

export async function POST(request: Request) {
  try {
    const actor = await requireUser(["admin"]);
    const body = await requestJson<AccountBody>(request);
    const name = String(body.name ?? "").trim().slice(0, 100);
    const institution = String(body.institution ?? "").trim().slice(0, 100);
    const currency = String(body.currency ?? "RWF").trim().toUpperCase();
    const accountNumber = String(body.accountNumber ?? "").trim().slice(-4);
    if (!name || !institution || !/^[A-Z]{3}$/.test(currency) || accountNumber.length < 4) {
      throw Object.assign(new Error("Enter an account name, institution, three-letter currency, and at least four account digits."), { status: 400 });
    }
    const sql = getDb();
    const id = randomUUID();
    await sql.transaction([
      sql`INSERT INTO accounts (id, name, institution, currency, account_number_masked) VALUES (${id}, ${name}, ${institution}, ${currency}, ${`•••• ${accountNumber}`})`,
      auditStatement(sql, actor.id, "Created account", "account", id, { name, institution, currency }),
    ]);
    return Response.json({ account: { id, name, institution, currency, accountNumber: `•••• ${accountNumber}`, active: true } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
