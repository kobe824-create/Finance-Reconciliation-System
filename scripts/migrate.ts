import { readFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { Client } from "@neondatabase/serverless";

try { loadEnvFile(".env.local"); } catch { /* Environment can also be provided by the shell or deployment. */ }

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("Set DATABASE_URL in .env.local before applying migrations.");

const source = await readFile(new URL("../db/migrations/001_initial.sql", import.meta.url), "utf8");
const client = new Client(connectionString);
await client.connect();
try {
  await client.query(source);
  console.log("Database migration 001_initial.sql applied.");
} finally {
  await client.end();
}
