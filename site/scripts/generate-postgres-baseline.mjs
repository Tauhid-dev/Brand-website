import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const snapshot = JSON.parse(await readFile(resolve(root, "drizzle/meta/0014_snapshot.json"), "utf8"));
const tables = Object.values(snapshot.tables);

const ordered = [];
const remaining = new Map(tables.map((table) => [table.name, table]));
while (remaining.size) {
  const ready = [...remaining.values()].filter((table) =>
    Object.values(table.foreignKeys).every((key) => key.tableTo === table.name || !remaining.has(key.tableTo))
  );
  if (!ready.length) throw new Error(`PostgreSQL table dependency cycle: ${[...remaining.keys()].join(", ")}`);
  for (const table of ready.sort((a, b) => a.name.localeCompare(b.name))) {
    ordered.push(table);
    remaining.delete(table.name);
  }
}

const statements = [
  "-- Generated from drizzle/meta/0014_snapshot.json by scripts/generate-postgres-baseline.mjs.",
  "-- D1 keeps its forward-only lineage in drizzle/. PostgreSQL owns this independent baseline.",
  "",
];

for (const table of ordered) {
  const definitions = [];
  for (const column of Object.values(table.columns)) {
    const parts = [quote(column.name), column.type === "integer" ? "bigint" : "text"];
    if (column.primaryKey) parts.push("primary key");
    if (column.notNull) parts.push("not null");
    if (column.default !== undefined) parts.push("default", postgresDefault(column.default));
    definitions.push(`  ${parts.join(" ")}`);
  }
  for (const primaryKey of Object.values(table.compositePrimaryKeys)) {
    definitions.push(`  constraint ${quote(primaryKey.name)} primary key (${primaryKey.columns.map(quote).join(", ")})`);
  }
  for (const foreignKey of Object.values(table.foreignKeys)) {
    definitions.push(`  constraint ${quote(foreignKey.name)} foreign key (${foreignKey.columnsFrom.map(quote).join(", ")}) references ${quote(foreignKey.tableTo)} (${foreignKey.columnsTo.map(quote).join(", ")}) on update ${foreignKey.onUpdate} on delete ${foreignKey.onDelete}`);
  }
  for (const check of Object.values(table.checkConstraints)) {
    definitions.push(`  constraint ${quote(check.name)} check (${postgresExpression(check.value, table.name)})`);
  }
  statements.push(`create table ${quote(table.name)} (\n${definitions.join(",\n")}\n);`, "");
}

for (const table of ordered) {
  for (const index of Object.values(table.indexes)) {
    const unique = index.isUnique ? "unique " : "";
    const where = index.where ? ` where ${postgresExpression(index.where, table.name)}` : "";
    statements.push(`create ${unique}index ${quote(index.name)} on ${quote(table.name)} (${index.columns.map(quote).join(", ")})${where};`);
  }
}

statements.push("", await seedSql(), "", await readFile(resolve(root, "postgres/invariants.sql"), "utf8"));
await writeFile(resolve(root, "postgres/migrations/0000_phase_18_baseline.sql"), `${statements.join("\n").trim()}\n`);

function quote(value) { return `"${value.replaceAll('"', '""')}"`; }
function postgresDefault(value) {
  if (value === true) return "1";
  if (value === false) return "0";
  return String(value);
}
function postgresExpression(value, tableName) {
  return value.replaceAll(`"${tableName}".`, "").replaceAll("`", '"');
}
async function seedSql() {
  const selected = [];
  for (const migration of ["0004_bored_red_ghost.sql", "0009_numerous_meltdown.sql"]) {
    const source = await readFile(resolve(root, "drizzle", migration), "utf8");
    for (const statement of source.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (/^INSERT INTO `(roles|permissions|role_permissions|notification_templates)`/.test(trimmed)) {
        selected.push(trimmed.replaceAll("`", '"').replace(/;+\s*$/, ""));
      }
    }
  }
  return `-- System vocabulary and notification templates copied from the D1 lineage.\n${selected.map((value) => `${value};`).join("\n")}`;
}
