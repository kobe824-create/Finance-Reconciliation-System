import { hash } from "bcryptjs";
import { auditStatement, errorResponse, requestJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import type { UserRole } from "@/lib/types";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

type UserBody = { name?: string; email?: string; role?: UserRole; password?: string };
const roles: UserRole[] = ["admin", "preparer", "reviewer", "auditor"];

export async function POST(request: Request) {
  try {
    const actor = await requireUser(["admin"]);
    const body = await requestJson<UserBody>(request);
    const name = String(body.name ?? "").trim().slice(0, 100);
    const email = String(body.email ?? "").trim().toLowerCase().slice(0, 254);
    const password = String(body.password ?? "");
    const role = body.role;
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || !role || !roles.includes(role) || password.length < 12 || password.length > 128) {
      throw Object.assign(new Error("Enter a name, valid email, role, and temporary password of at least 12 characters."), { status: 400 });
    }
    const passwordHash = await hash(password, 12);
    const sql = getDb();
    const id = randomUUID();
    await sql.transaction([
      sql`INSERT INTO app_users (id, name, email, password_hash, role) VALUES (${id}, ${name}, ${email}, ${passwordHash}, ${role})`,
      auditStatement(sql, actor.id, "Created user", "user", id, { email, role }),
    ]);
    return Response.json({ user: { id, name, email, role, active: true } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
