import type { Prisma } from "@prisma/client";

export type BusinessCodeKind =
  | "PURCHASE"
  | "INVENTORY_RAW"
  | "INVENTORY_FINISHED"
  | "RECIPE"
  | "PRODUCTION"
  | "MACHINE"
  | "SALES_ORDER"
  | "PICK_PACK"
  | "SUPPLIER"
  | "CUSTOMER"
  | "PRODUCT";

const definitions: Record<BusinessCodeKind, { scope: string; prefix: string; annual: boolean }> = {
  PURCHASE: { scope: "PURCHASE", prefix: "CMP", annual: true },
  INVENTORY_RAW: { scope: "INVENTORY_RAW", prefix: "MP", annual: false },
  INVENTORY_FINISHED: { scope: "INVENTORY_FINISHED", prefix: "PT", annual: false },
  RECIPE: { scope: "RECIPE", prefix: "REC", annual: false },
  PRODUCTION: { scope: "PRODUCTION", prefix: "OP", annual: true },
  MACHINE: { scope: "MACHINE", prefix: "MAQ", annual: false },
  SALES_ORDER: { scope: "SALES_ORDER", prefix: "PED", annual: true },
  PICK_PACK: { scope: "PICK_PACK", prefix: "PP", annual: true },
  SUPPLIER: { scope: "SUPPLIER", prefix: "PROV", annual: false },
  CUSTOMER: { scope: "CUSTOMER", prefix: "CLI", annual: false },
  PRODUCT: { scope: "PRODUCT", prefix: "PROD", annual: true },
};

function codeYear(kind: BusinessCodeKind, date: Date) {
  return definitions[kind].annual ? date.getUTCFullYear() : 0;
}

export function formatBusinessCode(kind: BusinessCodeKind, sequence: number, date = new Date()) {
  const definition = definitions[kind];
  const serial = String(sequence).padStart(6, "0");
  return definition.annual ? `${definition.prefix}-${codeYear(kind, date)}-${serial}` : `${definition.prefix}-${serial}`;
}

async function codeExists(tx: Prisma.TransactionClient, companyId: string, kind: BusinessCodeKind, code: string) {
  if (kind === "PURCHASE") return Boolean(await tx.purchase.findUnique({ where: { companyId_code: { companyId, code } }, select: { id: true } }));
  if (kind === "INVENTORY_RAW" || kind === "INVENTORY_FINISHED") return Boolean(await tx.inventoryItem.findUnique({ where: { companyId_code: { companyId, code } }, select: { id: true } }));
  if (kind === "RECIPE") return Boolean(await tx.recipe.findUnique({ where: { companyId_code: { companyId, code } }, select: { id: true } }));
  if (kind === "PRODUCTION") return Boolean(await tx.productionOrder.findUnique({ where: { companyId_number: { companyId, number: code } }, select: { id: true } }));
  if (kind === "MACHINE") return Boolean(await tx.machine.findUnique({ where: { companyId_code: { companyId, code } }, select: { id: true } }));
  if (kind === "SALES_ORDER") return Boolean(await tx.salesOrder.findUnique({ where: { companyId_number: { companyId, number: code } }, select: { id: true } }));
  if (kind === "PICK_PACK") return Boolean(await tx.pickPackOrder.findUnique({ where: { companyId_number: { companyId, number: code } }, select: { id: true } }));
  if (kind === "SUPPLIER") return Boolean(await tx.supplier.findUnique({ where: { companyId_code: { companyId, code } }, select: { id: true } }));
  if (kind === "CUSTOMER") return Boolean(await tx.customer.findUnique({ where: { companyId_code: { companyId, code } }, select: { id: true } }));
  return Boolean(await tx.product.findUnique({ where: { companyId_code: { companyId, code } }, select: { id: true } }));
}

export async function nextBusinessCode(tx: Prisma.TransactionClient, companyId: string, kind: BusinessCodeKind, date = new Date()) {
  const definition = definitions[kind];
  const year = codeYear(kind, date);
  const lockKey = `${companyId}:${definition.scope}:${year}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

  for (;;) {
    const counter = await tx.correlativeCounter.upsert({
      where: { companyId_scope_year: { companyId, scope: definition.scope, year } },
      update: { value: { increment: 1 } },
      create: { companyId, scope: definition.scope, year, value: 1 },
      select: { value: true },
    });
    const code = formatBusinessCode(kind, counter.value, date);
    if (!(await codeExists(tx, companyId, kind, code))) return code;
  }
}
