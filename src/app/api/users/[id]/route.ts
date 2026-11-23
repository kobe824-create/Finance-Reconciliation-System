import { auditStatement, errorResponse, requestJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import type { UserRole } from "@/lib/types";

export const runtime = "nodejs";
type PatchBody = { role?: UserRole; active?: boolean };
const roles: UserRole[] = ["admin", "preparer", "reviewer", "auditor"];

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser(["admin"]);
    const { id } = await context.params;
    const body = await requestJson<PatchBody>(request);
    if ((body.role !== undefined && !roles.includes(body.role)) || (body.active !== undefined && typeof body.active !== "boolean")) throw Object.assign(new Error("Choose a valid role or active status."), { status: 400 });
    if (id === actor.id && (body.active === false || (body.role !== undefined && body.role !== "admin"))) throw Object.assign(new Error("You cannot remove or reduce your own administrator access."), { status: 400 });
    if (body.role === undefined && body.active === undefined) throw Object.assign(new Error("No user changes were provided."), { status: 400 });
    const sql = getDb();
    const [current] = await sql`SELECT role::text, active FROM app_users WHERE id = ${id}`;
    if (!current) throw Object.assign(new Error("User not found."), { status: 404 });
    const removesAdmin = current.role === "admin" && current.active && (body.active === false || body.role !== undefined && body.role !== "admin");
    if (removesAdmin) {
      const [admins] = await sql`SELECT count(*)::int AS count FROM app_users WHERE role = 'admin' AND active = TRUE`;
      if (Number(admins.count) <= 1) throw Object.assign(new Error("Keep at least one active administrator."), { status: 409 });
    }
    const nextRole = body.role ?? current.role;
    const nextActive = body.active ?? Boolean(current.active);
    const [updatedRows] = await sql.transaction([
      sql`UPDATE app_users SET role = COALESCE(${body.role ?? null}::user_role, role), active = COALESCE(${body.active ?? null}, active) WHERE id = ${id}
        RETURNING id::text, name, email, role::text, active`,
      auditStatement(sql, actor.id, "Updated user access", "user", id, { role: nextRole, active: nextActive }),
    ]);
    const rows = updatedRows[0];
    return Response.json({ user: { id: String(rows.id), name: String(rows.name), email: String(rows.email), role: rows.role as UserRole, active: Boolean(rows.active) } });
  } catch (error) {
    return errorResponse(error);
  }
}
