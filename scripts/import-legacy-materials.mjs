import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no está configurada.");

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }) });
const username = (process.env.MATERIAL_IMPORT_USERNAME ?? "gmedina").trim().toLowerCase();

const materials = [
  { legacyCode: "01", name: "PVC", abbreviation: "PVC" },
  { legacyCode: "02", name: "PVC Expanso", abbreviation: "EXP" },
  { legacyCode: "03", name: "Termoplástico", abbreviation: "TR" },
  { legacyCode: "04", name: "Caucho", abbreviation: "RB" },
  { legacyCode: "05", name: "Poliuretano", abbreviation: "PU" },
  { legacyCode: "06", name: "Colada TR", abbreviation: null },
  { legacyCode: "07", name: "Colada EXP", abbreviation: null },
  { legacyCode: "08", name: "Colada RB", abbreviation: null },
  { legacyCode: "09", name: "Molido EXP", abbreviation: null },
  { legacyCode: "10", name: "Molido TR", abbreviation: null },
  { legacyCode: "11", name: "Aluminio", abbreviation: "AL" },
  { legacyCode: "12", name: "Caucho Gel", abbreviation: "CG" },
  { legacyCode: "13", name: "EVA", abbreviation: "EVA" },
];

async function nextRawMaterialCode(tx, companyId) {
  const lockKey = `${companyId}:INVENTORY_RAW:0`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
  for (;;) {
    const counter = await tx.correlativeCounter.upsert({
      where: { companyId_scope_year: { companyId, scope: "INVENTORY_RAW", year: 0 } },
      update: { value: { increment: 1 } },
      create: { companyId, scope: "INVENTORY_RAW", year: 0, value: 1 },
      select: { value: true },
    });
    const code = `MP-${String(counter.value).padStart(6, "0")}`;
    if (!await tx.inventoryItem.findUnique({ where: { companyId_code: { companyId, code } }, select: { id: true } })) return code;
  }
}

async function main() {
  const user = await prisma.user.findUnique({ where: { username }, select: { id: true, companyId: true } });
  if (!user) throw new Error(`No existe el usuario objetivo ${username}.`);
  const unit = await prisma.unitOfMeasure.findFirst({ where: { companyId: user.companyId, code: { equals: "KG", mode: "insensitive" } } });
  if (!unit) throw new Error("La empresa no tiene registrada la unidad KG.");

  let created = 0;
  let updated = 0;
  for (const material of materials) {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.inventoryItem.findFirst({
        where: {
          companyId: user.companyId,
          type: "RAW_MATERIAL",
          OR: [{ legacyCode: material.legacyCode }, { name: { equals: material.name, mode: "insensitive" } }],
        },
      });
      if (existing) {
        await tx.inventoryItem.update({ where: { id: existing.id }, data: { legacyCode: material.legacyCode, abbreviation: material.abbreviation, active: true } });
        await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, entity: "InventoryItem", entityId: existing.id, action: "MIGRATE_LEGACY_IDENTIFIERS", afterData: material } });
        updated += 1;
        return;
      }
      const code = await nextRawMaterialCode(tx, user.companyId);
      const item = await tx.inventoryItem.create({ data: { companyId: user.companyId, code, legacyCode: material.legacyCode, abbreviation: material.abbreviation, name: material.name, type: "RAW_MATERIAL", unitId: unit.id, minimumStock: 0, lotTrackingMode: "NONE", active: true } });
      await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, entity: "InventoryItem", entityId: item.id, action: "MIGRATE_LEGACY_ITEM", afterData: { ...material, code, unit: "KG", stock: 0 } } });
      created += 1;
    });
  }
  console.log(`Migración de materias primas completada para ${username}: ${created} creadas y ${updated} actualizadas.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
