import { randomUUID } from "node:crypto";
import { auditStatement, errorResponse, requestJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { organizationSlug, profileText, validateLogo, type LogoInput } from "@/lib/organization-profile";
import { requirePlatformAdmin } from "@/lib/session";

export const runtime = "nodejs";

type OrganizationBody = LogoInput & {
  slug?: string;
  name?: string;
  legalName?: string;
  tagline?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  country?: string;
};

export async function POST(request: Request) {
  try {
    const actor = await requirePlatformAdmin();
    const body = await requestJson<OrganizationBody>(request);
    const name = profileText(body.name, 120);
    const slug = organizationSlug(String(body.slug || body.name || ""));
    if (!name || slug.length < 2 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw Object.assign(new Error("Enter an organization name and a portal name with at least two letters or numbers."), { status: 400 });
    }
    const logo = validateLogo(body);
    const id = randomUUID();
    const sql = getDb();
    const [duplicate] = await sql`SELECT id FROM organizations WHERE slug = ${slug}`;
    if (duplicate) throw Object.assign(new Error("That portal name is already in use."), { status: 409 });
    const values = {
      legalName: profileText(body.legalName, 160), tagline: profileText(body.tagline, 180),
      addressLine1: profileText(body.addressLine1, 180), addressLine2: profileText(body.addressLine2, 180),
      city: profileText(body.city, 100), province: profileText(body.province, 100),
      postalCode: profileText(body.postalCode, 40), country: profileText(body.country, 100),
    };
    await sql.transaction([
      sql`INSERT INTO organizations (id, slug, name, legal_name, tagline, address_line1, address_line2, city, province, postal_code, country, logo_file_name, logo_content_type, logo_content)
        VALUES (${id}, ${slug}, ${name}, ${values.legalName}, ${values.tagline}, ${values.addressLine1}, ${values.addressLine2}, ${values.city}, ${values.province}, ${values.postalCode}, ${values.country},
          ${logo?.fileName ?? null}, ${logo?.contentType ?? null}, ${logo ? sql`decode(${logo.base64}, 'base64')` : null})`,
      auditStatement(sql, actor.id, "Created organization portal", "organization", id, { slug, name }, id),
    ]);
    return Response.json({ organization: { id, slug, name, ...values, logoUrl: logo ? `/api/organizations/${id}/logo` : undefined, active: true } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
