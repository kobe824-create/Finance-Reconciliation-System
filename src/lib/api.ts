import type { NextResponse } from "next/server";

export function errorResponse(error: unknown) {
  const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : 500;
  const message = status < 500 && error instanceof Error ? error.message : "The request could not be completed.";
  if (status === 500) console.error("API request failed", error);
  return Response.json({ error: message }, { status }) as NextResponse;
}

export async function requestJson<T>(request: Request): Promise<T> {
  try {
    return await request.json() as T;
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON."), { status: 400 });
  }
}

export async function writeAudit(sql: ReturnType<typeof import("@/lib/db").getDb>, actorId: string, action: string, entityType: string, entityId: string, details: Record<string, unknown> = {}, organizationId: string | null = null) {
  await sql`INSERT INTO audit_log (organization_id, actor_id, action, entity_type, entity_id, details) VALUES (${organizationId}, ${actorId}, ${action}, ${entityType}, ${entityId}, ${JSON.stringify(details)}::jsonb)`;
}

export function auditStatement(sql: ReturnType<typeof import("@/lib/db").getDb>, actorId: string, action: string, entityType: string, entityId: string, details: Record<string, unknown> = {}, organizationId: string | null = null) {
  return sql`INSERT INTO audit_log (organization_id, actor_id, action, entity_type, entity_id, details) VALUES (${organizationId}, ${actorId}, ${action}, ${entityType}, ${entityId}, ${JSON.stringify(details)}::jsonb)`;
}
