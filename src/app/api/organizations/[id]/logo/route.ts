import { currentUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await currentUser();
    if (!actor) throw Object.assign(new Error("Sign in to continue."), { status: 401 });
    const { id } = await context.params;
    if (!actor.platformAdmin && actor.organizationId !== id) throw Object.assign(new Error("Organization logo not found."), { status: 404 });
    const sql = getDb();
    const [organization] = await sql`SELECT logo_content, logo_content_type FROM organizations WHERE id = ${id} AND active = TRUE`;
    if (!organization?.logo_content) throw Object.assign(new Error("Organization logo not found."), { status: 404 });
    return new Response(Buffer.from(organization.logo_content as Uint8Array), { headers: {
      "Content-Type": String(organization.logo_content_type || "application/octet-stream"),
      "Content-Length": String((organization.logo_content as Uint8Array).byteLength),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    return errorResponse(error);
  }
}
