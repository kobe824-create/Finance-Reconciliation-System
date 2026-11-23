import { readFile, readdir } from "node:fs/promises";
import { lookup } from "node:dns/promises";
import { loadEnvFile } from "node:process";
import { Client } from "pg";

try { loadEnvFile(".env.local"); } catch { /* Environment can also be provided by the shell or deployment. */ }

function safeMessage(error: unknown) {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
  const safe = message.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[connection URL]").slice(0, 300);
  if (safe.trim()) return safe;
  const kind = error && typeof error === "object" && "constructor" in error ? String(error.constructor?.name ?? "database driver") : "database driver";
  return `${kind} reported a connection failure without further detail.`;
}

async function runMigrations() {
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("Set DATABASE_URL in .env.local before applying migrations.");

const migrationDirectory = new URL("../db/migrations/", import.meta.url);
const names = (await readdir(migrationDirectory)).filter((name) => name.endsWith(".sql")).sort();
const databaseUrl = new URL(connectionString);
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

try {
  await client.connect();
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);

  const recorded = new Set((await client.query<{ name: string }>(`SELECT name FROM schema_migrations`)).rows.map((row) => row.name));
  const baseline = await client.query<{ ready: boolean }>(`SELECT
    to_regclass('public.app_users') IS NOT NULL
    AND to_regclass('public.accounts') IS NOT NULL
    AND to_regclass('public.reconciliations') IS NOT NULL
    AND to_regclass('public.source_files') IS NOT NULL
    AND to_regclass('public.audit_log') IS NOT NULL AS ready`);

  // The first release used 001 without a migration ledger. Recognize that schema
  // before running the tenant migration against an existing installation.
  if (baseline.rows[0]?.ready && names.includes("001_initial.sql") && !recorded.has("001_initial.sql")) {
    await client.query(`INSERT INTO schema_migrations (name) VALUES ('001_initial.sql') ON CONFLICT (name) DO NOTHING`);
    recorded.add("001_initial.sql");
  }

  for (const name of names) {
    if (recorded.has(name)) continue;
    const source = await readFile(new URL(name, migrationDirectory), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(source);
      await client.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [name]);
      await client.query("COMMIT");
      console.log(`Applied ${name}.`);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }
} catch (error) {
  console.error(`Migration failed: ${safeMessage(error)}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
}

void runMigrations().catch((error) => {
  console.error(`Migration failed: ${safeMessage(error)}`);
  process.exitCode = 1;
});
