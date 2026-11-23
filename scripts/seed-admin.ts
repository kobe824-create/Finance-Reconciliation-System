import { loadEnvFile } from "node:process";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { neon } from "@neondatabase/serverless";

try { loadEnvFile(".env.local"); } catch { /* Environment can also be provided by the shell or deployment. */ }

const { DATABASE_URL, BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_PASSWORD } = process.env;
if (!DATABASE_URL || !BOOTSTRAP_ADMIN_EMAIL || !BOOTSTRAP_ADMIN_NAME || !BOOTSTRAP_ADMIN_PASSWORD) {
  throw new Error("Set DATABASE_URL, BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME, and BOOTSTRAP_ADMIN_PASSWORD before running this one-time setup.");
}
if (BOOTSTRAP_ADMIN_PASSWORD.length < 12) throw new Error("The first admin password must be at least 12 characters.");

const sql = neon(DATABASE_URL);
const [count] = await sql`SELECT count(*)::int AS users FROM app_users`;
if (Number(count.users) > 0) throw new Error("An app user already exists. The first-admin setup can only run once.");

const email = BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase();
const name = BOOTSTRAP_ADMIN_NAME.trim();
const passwordHash = await hash(BOOTSTRAP_ADMIN_PASSWORD, 12);
const adminId = randomUUID();
await sql.transaction([
  sql`INSERT INTO app_users (id, name, email, password_hash, role) VALUES (${adminId}, ${name}, ${email}, ${passwordHash}, 'admin')`,
  sql`INSERT INTO accounts (name, institution, currency, account_number_masked) VALUES
    ('Operating account', 'Bank of Kigali', 'RWF', '•••• 0041'),
    ('Project account', 'I&M Bank Rwanda', 'RWF', '•••• 1826'),
    ('USD holding account', 'Bank of Kigali', 'USD', '•••• 9035')`,
  sql`INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details) VALUES (${adminId}, 'Created first administrator', 'user', ${adminId}, ${JSON.stringify({ email, role: "admin" })}::jsonb)`,
]);
console.log(`First admin created: ${email}. Remove BOOTSTRAP_ADMIN_PASSWORD from your environment now.`);
