import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no está configurada.");

const sql = neon(process.env.DATABASE_URL);

function splitSqlStatements(source) {
  const statements = [];
  let current = "";
  let quote = null;
  let dollarTag = null;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    current += char;

    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") { current += next; index += 1; blockComment = false; }
      continue;
    }
    if (dollarTag) {
      if (source.startsWith(dollarTag, index)) {
        current += dollarTag.slice(1);
        index += dollarTag.length - 1;
        dollarTag = null;
      }
      continue;
    }
    if (quote) {
      if (char === quote && next === quote) { current += next; index += 1; continue; }
      if (char === quote) quote = null;
      continue;
    }
    if (char === "-" && next === "-") { current += next; index += 1; lineComment = true; continue; }
    if (char === "/" && next === "*") { current += next; index += 1; blockComment = true; continue; }
    if (char === "'" || char === '"') { quote = char; continue; }
    if (char === "$") {
      const match = source.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) { dollarTag = match[0]; current += dollarTag.slice(1); index += dollarTag.length - 1; continue; }
    }
    if (char === ";") {
      const statement = current.slice(0, -1).trim();
      if (statement) statements.push(statement);
      current = "";
    }
  }
  const trailing = current.trim();
  if (trailing) statements.push(trailing);
  return statements;
}

const table = await sql.query("select to_regclass('public._prisma_migrations')::text as migrations", []);
if (!table[0]?.migrations) throw new Error("No existe el historial Prisma; ejecuta primero el bootstrap inicial.");

const appliedRows = await sql.query(
  'select "migration_name" from "_prisma_migrations" where "finished_at" is not null and "rolled_back_at" is null',
  [],
);
const applied = new Set(appliedRows.map((row) => row.migration_name));
const entries = await readdir("prisma/migrations", { withFileTypes: true });
const pending = entries.filter((entry) => entry.isDirectory() && !applied.has(entry.name)).map((entry) => entry.name).sort();

for (const migrationName of pending) {
  const migration = await readFile(`prisma/migrations/${migrationName}/migration.sql`, "utf8");
  const statements = splitSqlStatements(migration);
  const checksum = createHash("sha256").update(migration).digest("hex");
  const startedAt = new Date();
  await sql.transaction([
    ...statements.map((statement) => sql.query(statement, [])),
    sql.query(
      `INSERT INTO "_prisma_migrations"
        ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count")
       VALUES ($1, $2, now(), $3, $4, 1)`,
      [randomUUID(), checksum, migrationName, startedAt],
    ),
  ]);
  console.log(`Migración aplicada: ${migrationName}`);
}

if (!pending.length) console.log("Neon no tiene migraciones pendientes.");
