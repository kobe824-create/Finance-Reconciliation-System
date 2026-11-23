import { loadEnvFile } from "node:process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { lookup } from "node:dns/promises";
import { hash } from "bcryptjs";
import { Client } from "pg";

try {
  loadEnvFile(".env.local");
} catch {
  // Environment variables may also be supplied by the deployment.
}

async function seedAdmin() {
  const {
    DATABASE_URL,
    BOOTSTRAP_ADMIN_EMAIL,
    BOOTSTRAP_ADMIN_NAME,
    BOOTSTRAP_ADMIN_PASSWORD,
  } = process.env;

  const username = (
    process.env.BOOTSTRAP_SUPERADMIN_USERNAME ||
    BOOTSTRAP_ADMIN_EMAIL ||
    ""
  ).trim().toLowerCase();

  if (
    !DATABASE_URL ||
    !BOOTSTRAP_ADMIN_EMAIL ||
    !BOOTSTRAP_ADMIN_NAME ||
    !BOOTSTRAP_ADMIN_PASSWORD ||
    !username
  ) {
    throw new Error("Required administrator environment variables are missing.");
  }

  if (BOOTSTRAP_ADMIN_PASSWORD.length < 12) {
    throw new Error("The first admin password must be at least 12 characters.");
  }

  if (!/^[a-z0-9._@+-]{3,100}$/.test(username)) {
    throw new Error("Invalid administrator username.");
  }

  const databaseUrl = new URL(DATABASE_URL);
  const { address } = await lookup(databaseUrl.hostname, { family: 4 });

  const client = new Client({
    host: address,
    port: Number(databaseUrl.port || 5432),
    user: decodeURIComponent(databaseUrl.username),
    password: decodeURIComponent(databaseUrl.password),
    database: decodeURIComponent(databaseUrl.pathname.slice(1)),
    ssl: {
      rejectUnauthorized: true,
      servername: databaseUrl.hostname,
    },
    connectionTimeoutMillis: 15000,
  });

  const email = BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase();
  const name = BOOTSTRAP_ADMIN_NAME.trim();
  const passwordHash = await hash(BOOTSTRAP_ADMIN_PASSWORD, 12);

  const logoBase64 = (
    await readFile(new URL("../public/ddin-logo.png", import.meta.url))
  ).toString("base64");

  try {
    await client.connect();
    await client.query("BEGIN");

    const organization = await client.query(
      "SELECT id::text FROM organizations WHERE slug = $1 AND active = TRUE",
      ["ddin"]
    );

    if (!organization.rows[0]) {
      throw new Error("Run npm run db:migrate before bootstrapping the administrator.");
    }

    const existing = await client.query(
      `SELECT id::text, platform_admin
       FROM app_users
       WHERE lower(email) = $1 OR lower(username) = $2
       LIMIT 1`,
      [email, username]
    );

    const adminId = existing.rows[0]
      ? String(existing.rows[0].id)
      : randomUUID();

    if (existing.rows[0]) {
      await client.query(
        `UPDATE app_users
         SET name = $1,
             username = $2,
             password_hash = $3,
             organization_id = NULL,
             platform_admin = TRUE,
             role = 'admin',
             active = TRUE
         WHERE id = $4`,
        [name, username, passwordHash, adminId]
      );
    } else {
      await client.query(
        `INSERT INTO app_users
         (id, organization_id, username, platform_admin, name, email,
          password_hash, role, active)
         VALUES ($1, NULL, $2, TRUE, $3, $4, $5, 'admin', TRUE)`,
        [adminId, username, name, email, passwordHash]
      );
    }

    await client.query(
      `UPDATE organizations
       SET logo_file_name = 'ddin-logo.png',
           logo_content_type = 'image/png',
           logo_content = decode($1, 'base64'),
           updated_at = now()
       WHERE slug = 'ddin' AND logo_content IS NULL`,
      [logoBase64]
    );

    await client.query(
      `INSERT INTO audit_log
       (organization_id, actor_id, action, entity_type, entity_id, details)
       VALUES (NULL, $1, $2, 'user', $3, $4::jsonb)`,
      [
        adminId,
        existing.rows[0]
          ? "Enabled platform administrator access"
          : "Created platform administrator",
        adminId,
        JSON.stringify({ username }),
      ]
    );

    await client.query("COMMIT");

    console.log(
      "Platform administrator ready. The DDIN portal profile and logo are initialized; add DDIN bank accounts from Team & settings."
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

void seedAdmin().catch((error) => {
  console.error(
    "Platform administrator setup failed:",
    error instanceof Error ? error.message : "Unknown setup error."
  );
  process.exitCode = 1;
});
