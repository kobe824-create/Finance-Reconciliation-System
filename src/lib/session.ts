import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import type { UserRole } from "@/lib/types";

export const SESSION_COOKIE = "ddin_finance_session";
const SESSION_SECONDS = 60 * 60 * 8;

export type SessionUser = { id: string; name: string; email: string; role: UserRole; platformAdmin: boolean; organizationId: string | null };

function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32 || secret.toLowerCase().includes("replace")) {
    throw new Error("Set AUTH_SECRET to a random value with at least 32 characters.");
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(user: SessionUser, organizationId: string | null = user.organizationId) {
  const token = await new SignJWT({ ...user, organizationId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_SECONDS}s`)
    .sign(key());
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
}

export async function currentUser(): Promise<SessionUser | null> {
  try {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, key());
    if (typeof payload.sub !== "string") return null;
    const sql = getDb();
    const [user] = await sql`SELECT id::text, email, username, name, role::text, active, platform_admin, organization_id::text
      FROM app_users WHERE id = ${payload.sub}`;
    if (!user || !user.active) return null;
    if (!["admin", "preparer", "reviewer", "auditor"].includes(String(user.role))) return null;
    const platformAdmin = Boolean(user.platform_admin);
    const organizationId = platformAdmin
      ? typeof payload.organizationId === "string" ? payload.organizationId : null
      : user.organization_id ? String(user.organization_id) : null;
    if (!platformAdmin && !organizationId) return null;
    if (organizationId) {
      const [organization] = await sql`SELECT id FROM organizations WHERE id = ${organizationId} AND active = TRUE`;
      if (!organization) return null;
    }
    return { id: String(user.id), email: String(user.email), name: String(user.name), role: platformAdmin ? "admin" : user.role as UserRole, platformAdmin, organizationId };
  } catch {
    return null;
  }
}

export async function requireUser(roles?: UserRole[]) {
  const user = await currentUser();
  if (!user) throw Object.assign(new Error("Sign in to continue."), { status: 401 });
  if (!user.organizationId) throw Object.assign(new Error("Choose an organization portal first."), { status: 409 });
  if (roles?.length && !roles.includes(user.role)) throw Object.assign(new Error("Your role cannot perform this action."), { status: 403 });
  return user;
}

export async function requirePlatformAdmin() {
  const user = await currentUser();
  if (!user) throw Object.assign(new Error("Sign in to continue."), { status: 401 });
  if (!user.platformAdmin) throw Object.assign(new Error("Platform administrator access is required."), { status: 403 });
  return user;
}
