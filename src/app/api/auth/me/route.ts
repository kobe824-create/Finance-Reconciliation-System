import { currentUser } from "@/lib/session";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const user = await currentUser();
  if (!user?.platformAdmin) return Response.json({ user, organizations: [] });
  const sql = getDb();
  const rows = await sql`SELECT id::text, slug, name, legal_name, tagline, address_line1, address_line2,
      city, province, postal_code, country, logo_content IS NOT NULL AS has_logo, active
    FROM organizations WHERE active = TRUE ORDER BY name`;
  const organizations = rows.map((row) => ({
    id: String(row.id), slug: String(row.slug), name: String(row.name),
    legalName: row.legal_name ? String(row.legal_name) : undefined,
    tagline: row.tagline ? String(row.tagline) : undefined,
    addressLine1: row.address_line1 ? String(row.address_line1) : undefined,
    addressLine2: row.address_line2 ? String(row.address_line2) : undefined,
    city: row.city ? String(row.city) : undefined,
    province: row.province ? String(row.province) : undefined,
    postalCode: row.postal_code ? String(row.postal_code) : undefined,
    country: row.country ? String(row.country) : undefined,
    logoUrl: row.has_logo ? `/api/organizations/${String(row.id)}/logo` : undefined,
    active: Boolean(row.active),
  }));
  return Response.json({ user, organizations });
}
