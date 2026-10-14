import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no está configurada.");

const sql = neon(process.env.DATABASE_URL);
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
  const statements = migration.split(/;\s*(?:\r?\n|$)/).map((statement) => statement.trim()).filter(Boolean);
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
