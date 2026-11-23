import { errorResponse, requestJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { createSession, requirePlatformAdmin } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const actor = await requirePlatformAdmin();
    const body = await requestJson<{ organizationId?: string | null }>(request);
    const organizationId = body.organizationId ? String(body.organizationId) : null;
    if (organizationId) {
      const sql = getDb();
      const [organization] = await sql`SELECT id FROM organizations WHERE id = ${organizationId} AND active = TRUE`;
      if (!organization) throw Object.assign(new Error("Choose an active organization portal."), { status: 404 });
    }
    await createSession({ ...actor, organizationId }, organizationId);
    return Response.json({ user: { ...actor, organizationId } });
  } catch (error) {
    return errorResponse(error);
  }
}
