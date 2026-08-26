import type { Pool, PoolClient, QueryResult } from "pg";

type PgExecutor = Pool | PoolClient;

let poolPromise: Promise<Pool> | undefined;

export async function createPostgresD1Binding(databaseUrl: string): Promise<D1Database> {
  poolPromise ??= openPool(databaseUrl);
  return new PostgresD1Database(await poolPromise) as unknown as D1Database;
}

export async function closePostgresPoolForTests() {
  if (!poolPromise) return;
  const pool = await poolPromise;
  poolPromise = undefined;
  await pool.end();
}

async function openPool(databaseUrl: string): Promise<Pool> {
  // Keep the TCP driver out of the Cloudflare worker bundle. The import is
  // reached only after DATABASE_RUNTIME explicitly selects PostgreSQL.
  const moduleName = "pg";
  const pg = await import(/* @vite-ignore */ moduleName) as typeof import("pg");
  pg.types.setTypeParser(20, Number);
  return new pg.Pool({
    connectionString: databaseUrl,
    max: positiveInteger(process.env.DATABASE_POOL_SIZE, 10, 1, 50),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    allowExitOnIdle: false,
  });
}

class PostgresD1Database {
  constructor(private readonly pool: Pool) {}

  prepare(query: string) { return new PostgresD1PreparedStatement(this.pool, query); }

  async batch(statements: PostgresD1PreparedStatement[]) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const results = [];
      for (const statement of statements) results.push(await statement.execute(client));
      await client.query("commit");
      return results;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async exec(query: string) {
    const startedAt = performance.now();
    const result = await this.pool.query(query);
    return { count: result.rowCount ?? 0, duration: performance.now() - startedAt };
  }

  async dump(): Promise<ArrayBuffer> {
    throw new Error("D1 binary dump is unavailable for the PostgreSQL runtime. Use pg_dump.");
  }
}

class PostgresD1PreparedStatement {
  constructor(
    private readonly executor: PgExecutor,
    private readonly sqliteSql: string,
    private readonly parameters: unknown[] = [],
  ) {}

  bind(...values: unknown[]) {
    return new PostgresD1PreparedStatement(this.executor, this.sqliteSql, values);
  }

  async first(column?: string) {
    const result = await this.query(this.executor);
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    if (column === undefined) return row;
    if (!(column in row)) throw new Error(`Column ${column} is not present in the PostgreSQL result.`);
    return row[column];
  }

  async run() { return this.execute(this.executor); }

  async all() { return this.execute(this.executor); }

  async raw() {
    const result = await this.query(this.executor, true);
    return result.rows as unknown[][];
  }

  async execute(executor: PgExecutor) {
    const startedAt = performance.now();
    const result = await this.query(executor);
    const duration = performance.now() - startedAt;
    return {
      success: true,
      results: result.rows as Record<string, unknown>[],
      meta: {
        changed_db: (result.rowCount ?? 0) > 0,
        changes: result.rowCount ?? 0,
        duration,
        last_row_id: 0,
        rows_read: result.rows.length,
        rows_written: result.command === "SELECT" ? 0 : result.rowCount ?? 0,
        size_after: 0,
      },
    };
  }

  private query(executor: PgExecutor, rowModeArray = false): Promise<QueryResult> {
    const text = postgresPlaceholders(this.sqliteSql);
    if (rowModeArray) return executor.query({ text, values: this.parameters, rowMode: "array" }) as unknown as Promise<QueryResult>;
    return executor.query({ text, values: this.parameters });
  }
}

export function postgresPlaceholders(sql: string): string {
  let output = "";
  let parameter = 0;
  let quote: "'" | '"' | "`" | null = null;
  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    if (quote) {
      output += quote === "`" ? (character === "`" ? '"' : character) : character;
      if (character === quote) {
        if (sql[index + 1] === quote) output += sql[++index];
        else quote = null;
      }
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      output += character === "`" ? '"' : character;
    } else if (character === "?") {
      output += `$${++parameter}`;
    } else {
      output += character;
    }
  }
  return output;
}

function positiveInteger(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) return fallback;
  return parsed;
}
