import { createHash } from "node:crypto";
import { compare } from "bcryptjs";
import { getDb } from "@/lib/db";
import { errorResponse, requestJson } from "@/lib/api";
import { createSession, type SessionUser } from "@/lib/session";

export const runtime = "nodejs";

type LoginBody = { email?: string; password?: string };
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export async function POST(request: Request) {
  try {
    const { email, password } = await requestJson<LoginBody>(request);
    const normalizedEmail = String(email ?? "").trim().toLowerCase().slice(0, 254);
    const secret = process.env.AUTH_SECRET;
    if (!secret || secret.length < 32) throw Object.assign(new Error("Authentication is not configured."), { status: 503 });
    if (!normalizedEmail || !password || password.length > 256) throw Object.assign(new Error("Enter your email and password."), { status: 400 });

    const sql = getDb();
    await sql`DELETE FROM auth_attempts WHERE created_at < now() - interval '30 days'`;
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const emailKey = digest(`${secret}:${normalizedEmail}`);
    const ipKey = digest(`${secret}:${forwarded}`);
    const [limits] = await sql`SELECT count(*)::int AS attempts FROM auth_attempts WHERE email_key = ${emailKey} AND ip_key = ${ipKey} AND succeeded = FALSE AND created_at > now() - interval '15 minutes'`;
    if (Number(limits?.attempts ?? 0) >= 8) throw Object.assign(new Error("Too many sign-in attempts. Wait 15 minutes and try again."), { status: 429 });

    const [row] = await sql`SELECT id::text, name, email, role::text, password_hash, active FROM app_users WHERE email = ${normalizedEmail} LIMIT 1`;
    const passwordOk = await compare(password, row ? String(row.password_hash) : "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy").catch(() => false);
    const succeeded = Boolean(row && passwordOk && row.active);
    await sql`INSERT INTO auth_attempts (email_key, ip_key, succeeded) VALUES (${emailKey}, ${ipKey}, ${succeeded})`;
    if (!succeeded) throw Object.assign(new Error("Email or password is incorrect."), { status: 401 });

    const user: SessionUser = { id: String(row.id), name: String(row.name), email: String(row.email), role: row.role as SessionUser["role"] };
    await createSession(user);
    return Response.json({ user });
  } catch (error) {
    return errorResponse(error);
  }
}
