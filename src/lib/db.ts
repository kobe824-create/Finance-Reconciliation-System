import { lookup } from "node:dns/promises";
import { Pool } from "pg";

const globalForDb = globalThis as typeof globalThis & {
  __ddinPoolPromise?: Promise<Pool>;
};

type QuerySpec = {
  __sqlFragment: true;
  text: string;
  values: unknown[];
  then: (
    resolve?: (value: unknown[]) => unknown,
    reject?: (reason: unknown) => unknown
  ) => Promise<unknown>;
};

function isQuerySpec(value: unknown): value is QuerySpec {
  return (
    typeof value === "object" &&
    value !== null &&
    "__sqlFragment" in value &&
    (value as QuerySpec).__sqlFragment === true
  );
}

async function getPool(): Promise<Pool> {
  if (!globalForDb.__ddinPoolPromise) {
    const pending = (async () => {
      const connectionString = process.env.DATABASE_URL?.trim();

      if (!connectionString) {
        throw new Error("DATABASE_URL is not configured.");
      }

      const databaseUrl = new URL(connectionString);
      const { address } = await lookup(databaseUrl.hostname, {
        family: 4,
      });

      return new Pool({
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
        idleTimeoutMillis: 30000,
        max: 10,
      });
    })();

    globalForDb.__ddinPoolPromise = pending;

    pending.catch(() => {
      if (globalForDb.__ddinPoolPromise === pending) {
        delete globalForDb.__ddinPoolPromise;
      }
    });
  }

  return globalForDb.__ddinPoolPromise;
}

function buildQuery(
  strings: TemplateStringsArray,
  values: unknown[]
): { text: string; values: unknown[] } {
  let text = strings[0];
  const parameters: unknown[] = [];

  for (let i = 0; i < values.length; i++) {
    const value = values[i];

    if (isQuerySpec(value)) {
      const offset = parameters.length;

      const nestedText = value.text.replace(
        /\$(\d+)/g,
        (_, number: string) => `$${Number(number) + offset}`
      );

      text += nestedText;
      parameters.push(...value.values);
    } else {
      parameters.push(value);
      text += `$${parameters.length}`;
    }

    text += strings[i + 1];
  }

  return { text, values: parameters };
}

function createQuery(spec: {
  text: string;
  values: unknown[];
}): QuerySpec {
  const query = {
    __sqlFragment: true as const,
    text: spec.text,
    values: spec.values,

    then(resolve?: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) {
      return getPool()
        .then((pool) => pool.query(spec.text, spec.values))
        .then((result) => result.rows)
        .then(resolve, reject);
    },
  };

  return query;
}

function createSqlTag() {
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    return createQuery(buildQuery(strings, values));
  }) as ((strings: TemplateStringsArray, ...values: unknown[]) => QuerySpec) & {
    transaction: (queries: QuerySpec[]) => Promise<unknown[][]>;
  };

  sql.transaction = async (queries: QuerySpec[]) => {
    const pool = await getPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const results: unknown[][] = [];

      for (const query of queries) {
        if (!isQuerySpec(query)) {
          throw new Error("Invalid query supplied to transaction.");
        }

        const result = await client.query(query.text, query.values);
        results.push(result.rows);
      }

      await client.query("COMMIT");
      return results;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };

  return sql;
}

const sql = createSqlTag();

export function databaseConfigured() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getDb() {
  if (!databaseConfigured()) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return sql;
}
