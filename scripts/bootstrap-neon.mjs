import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no está configurada.");

const sql = neon(process.env.DATABASE_URL);
const migrationName = "20261013150000_initial_domain";
const migrationPath = `prisma/migrations/${migrationName}/migration.sql`;
const migration = await readFile(migrationPath, "utf8");
const state = await sql.query(
  "select to_regclass('public.companies')::text as companies, to_regclass('public._prisma_migrations')::text as migrations",
  [],
);

if (state[0]?.companies) {
  if (!state[0]?.migrations) throw new Error("La base tiene tablas pero no historial Prisma; se requiere revisión manual.");
  console.log("La migración inicial ya fue aplicada.");
  process.exit(0);
}

const statements = migration
  .split(/;\s*(?:\r?\n|$)/)
  .map((statement) => statement.trim())
  .filter(Boolean);
const checksum = createHash("sha256").update(migration).digest("hex");
const startedAt = new Date();

await sql.transaction([
  ...statements.map((statement) => sql.query(statement, [])),
  sql.query(`CREATE TABLE "_prisma_migrations" (
    "id" VARCHAR(36) PRIMARY KEY NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "finished_at" TIMESTAMPTZ,
    "migration_name" VARCHAR(255) NOT NULL,
    "logs" TEXT,
    "rolled_back_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0
  )`, []),
  sql.query(
    `INSERT INTO "_prisma_migrations"
      ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count")
     VALUES ($1, $2, now(), $3, $4, 1)`,
    [randomUUID(), checksum, migrationName, startedAt],
  ),
]);

console.log("Migración inicial aplicada en Neon.");
