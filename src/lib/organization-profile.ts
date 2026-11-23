const MAX_LOGO_SIZE = 1_048_576;

export type LogoInput = { logoBase64?: string; logoContentType?: string; logoFileName?: string };
export type ValidatedLogo = { base64: string; contentType: string; fileName: string; byteLength: number };

export function validateLogo(input: LogoInput): ValidatedLogo | undefined {
  if (!input.logoBase64) return undefined;
  const contentType = String(input.logoContentType ?? "").toLowerCase();
  if (!new Set(["image/png", "image/jpeg", "image/webp"]).has(contentType)) {
    throw Object.assign(new Error("Use a PNG, JPEG, or WebP company logo."), { status: 400 });
  }
  const base64 = String(input.logoBase64);
  if (base64.length > Math.ceil(MAX_LOGO_SIZE * 4 / 3) + 8 || !/^[a-z0-9+/]+={0,2}$/i.test(base64)) {
    throw Object.assign(new Error("Company logos are limited to 1 MB."), { status: 413 });
  }
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.length > MAX_LOGO_SIZE) throw Object.assign(new Error("Company logos are limited to 1 MB."), { status: 413 });
  const validSignature = contentType === "image/png"
    ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : contentType === "image/jpeg"
      ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (!validSignature) throw Object.assign(new Error("The logo content does not match its image type."), { status: 400 });
  const fileName = String(input.logoFileName ?? "organization-logo").split(/[\\/]/).pop()!.replace(/[^\p{L}\p{N}._()-]/gu, "_").slice(0, 120);
  return { base64, contentType, fileName, byteLength: bytes.length };
}

export function organizationSlug(value: string) {
  return value.trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export function profileText(value: unknown, maxLength: number) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
  return text || null;
}
