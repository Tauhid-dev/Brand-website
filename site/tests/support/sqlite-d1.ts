import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema.ts";

const MIGRATIONS = [
  new URL("../../drizzle/0000_uneven_violations.sql", import.meta.url),
  new URL("../../drizzle/0001_last_rafael_vega.sql", import.meta.url),
  new URL("../../drizzle/0002_windy_sprite.sql", import.meta.url),
  new URL("../../drizzle/0003_strange_absorbing_man.sql", import.meta.url),
];

class SQLiteD1PreparedStatement {
  constructor(
    private readonly database: DatabaseSync,
    private readonly query: string,
    private readonly values: readonly unknown[] = [],
  ) {}

  bind(...values: unknown[]): SQLiteD1PreparedStatement {
    return new SQLiteD1PreparedStatement(this.database, this.query, values);
  }

  async all(): Promise<{ success: true; results: Record<string, unknown>[] }> {
    const results = this.database.prepare(this.query)
      .all(...(this.values as never[])) as Record<string, unknown>[];
    return { success: true, results };
  }

  async raw(): Promise<unknown[][]> {
    const { results } = await this.all();
    return results.map((row) => Object.values(row));
  }

  async run(): Promise<{ success: true; results: never[]; meta: { changes: number } }> {
    const result = this.database.prepare(this.query).run(...(this.values as never[]));
    return { success: true, results: [], meta: { changes: Number(result.changes) } };
  }
}

export class SQLiteD1Database {
  readonly database = new DatabaseSync(":memory:");

  constructor() {
    this.database.exec("PRAGMA foreign_keys = ON");
    for (const migration of MIGRATIONS) {
      for (const statement of readFileSync(migration, "utf8").split("--> statement-breakpoint")) {
        if (statement.trim()) this.database.exec(statement);
      }
    }
  }

  prepare(query: string): SQLiteD1PreparedStatement {
    return new SQLiteD1PreparedStatement(this.database, query);
  }

  async batch(statements: SQLiteD1PreparedStatement[]) {
    this.database.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.database.close();
  }
}

export function repositoryDatabase() {
  const client = new SQLiteD1Database();
  const database = drizzle(client as unknown as D1Database, { schema });
  return { client, database };
}
