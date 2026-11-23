import { auditStatement, errorResponse, requestJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { profileText, validateLogo, type LogoInput } from "@/lib/organization-profile";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";

type OrganizationBody = LogoInput & {
  name?: string;
  legalName?: string;
  tagline?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  country?: string;
  removeLogo?: boolean;
};

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser(["admin"]);
    const { id } = await context.params;
    if (id !== actor.organizationId) throw Object.assign(new Error("You can only edit the selected organization profile."), { status: 403 });
    const body = await requestJson<OrganizationBody>(request);
    const name = profileText(body.name, 120);
    if (!name) throw Object.assign(new Error("Organization name is required."), { status: 400 });
    if (body.removeLogo !== undefined && typeof body.removeLogo !== "boolean") throw Object.assign(new Error("Choose a valid logo action."), { status: 400 });
    const logo = validateLogo(body);
    const sql = getDb();
    const values = {
      legalName: profileText(body.legalName, 160), tagline: profileText(body.tagline, 180),
      addressLine1: profileText(body.addressLine1, 180), addressLine2: profileText(body.addressLine2, 180),
      city: profileText(body.city, 100), province: profileText(body.province, 100),
      postalCode: profileText(body.postalCode, 40), country: profileText(body.country, 100),
    };
    const [updatedRows] = await sql.transaction([
      sql`UPDATE organizations SET name = ${name}, legal_name = ${values.legalName}, tagline = ${values.tagline},
          address_line1 = ${values.addressLine1}, address_line2 = ${values.addressLine2}, city = ${values.city},
          province = ${values.province}, postal_code = ${values.postalCode}, country = ${values.country},
          logo_file_name = CASE WHEN ${Boolean(logo)} THEN ${logo?.fileName ?? null} WHEN ${Boolean(body.removeLogo)} THEN NULL ELSE logo_file_name END,
          logo_content_type = CASE WHEN ${Boolean(logo)} THEN ${logo?.contentType ?? null} WHEN ${Boolean(body.removeLogo)} THEN NULL ELSE logo_content_type END,
          logo_content = CASE WHEN ${Boolean(logo)} THEN decode(${logo?.base64 ?? ""}, 'base64') WHEN ${Boolean(body.removeLogo)} THEN NULL ELSE logo_content END,
          updated_at = now()
        WHERE id = ${id} AND active = TRUE
        RETURNING id::text, slug, name, legal_name, tagline, address_line1, address_line2, city, province, postal_code, country, logo_content IS NOT NULL AS has_logo`,
      auditStatement(sql, actor.id, "Updated organization profile", "organization", id, { name }, actor.organizationId),
    ]);
    const row = updatedRows[0];
    if (!row) throw Object.assign(new Error("Organization portal not found."), { status: 404 });
    return Response.json({ organization: {
      id: String(row.id), slug: String(row.slug), name: String(row.name),
      legalName: row.legal_name ? String(row.legal_name) : undefined, tagline: row.tagline ? String(row.tagline) : undefined,
      addressLine1: row.address_line1 ? String(row.address_line1) : undefined, addressLine2: row.address_line2 ? String(row.address_line2) : undefined,
      city: row.city ? String(row.city) : undefined, province: row.province ? String(row.province) : undefined,
      postalCode: row.postal_code ? String(row.postal_code) : undefined, country: row.country ? String(row.country) : undefined,
      logoUrl: row.has_logo ? `/api/organizations/${id}/logo` : undefined,
    } });
  } catch (error) {
    return errorResponse(error);
  }
}
