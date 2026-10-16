import { hash } from "@node-rs/argon2";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no está configurada.");
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }) });
const permissionCodes = [
  "dashboard.read", "catalogs.read", "catalogs.manage", "users.read", "users.create", "users.update", "users.deactivate", "roles.read", "roles.manage", "sessions.read", "sessions.revoke",
  "purchases.read", "purchases.create", "purchases.update", "purchases.submit", "purchases.approve", "purchases.reject", "purchases.reverse", "purchases.export",
  "inventory.read", "inventory.create_item", "inventory.adjust_request", "inventory.adjust_approve", "inventory.adjust_value_request", "inventory.adjust_value_approve", "inventory.opening_import", "inventory.export",
  "recipes.read", "recipes.create", "recipes.update", "recipes.activate", "recipes.archive", "recipes.export",
  "production.read", "production.create", "production.release", "production.start", "production.complete", "production.cancel", "production.scrap",
  "products.read", "products.create", "products.update", "products.image_manage", "products.export",
  "orders.read", "orders.create", "orders.update", "orders.confirm", "orders.link_production", "orders.dispatch", "orders.deliver", "orders.cancel", "orders.export",
  "imports.read", "imports.preview", "imports.confirm",
];

try {
  const company = (await prisma.company.findFirst({ where: { name: "LK INNOVACION" } })) ?? await prisma.company.create({ data: { name: "LK INNOVACION" } });
  await Promise.all([
    prisma.unitOfMeasure.upsert({ where: { companyId_code: { companyId: company.id, code: "KG" } }, update: {}, create: { companyId: company.id, code: "KG", name: "Kilogramo", symbol: "kg", decimalPlaces: 3 } }),
    prisma.unitOfMeasure.upsert({ where: { companyId_code: { companyId: company.id, code: "UND" } }, update: {}, create: { companyId: company.id, code: "UND", name: "Unidad", symbol: "und", decimalPlaces: 0 } }),
    prisma.unitOfMeasure.upsert({ where: { companyId_code: { companyId: company.id, code: "L" } }, update: {}, create: { companyId: company.id, code: "L", name: "Litro", symbol: "L", decimalPlaces: 3 } }),
    prisma.currency.upsert({ where: { companyId_code: { companyId: company.id, code: "PEN" } }, update: { isBase: true }, create: { companyId: company.id, code: "PEN", name: "Sol peruano", symbol: "S/", isBase: true } }),
    prisma.currency.upsert({ where: { companyId_code: { companyId: company.id, code: "USD" } }, update: {}, create: { companyId: company.id, code: "USD", name: "Dólar estadounidense", symbol: "$" } }),
    prisma.warehouse.upsert({ where: { companyId_code: { companyId: company.id, code: "PRINCIPAL" } }, update: {}, create: { companyId: company.id, code: "PRINCIPAL", name: "Almacén principal" } }),
  ]);
  const permissions = await Promise.all(permissionCodes.map((code) => {
    const [module, action] = code.split(".");
    return prisma.permission.upsert({ where: { companyId_code: { companyId: company.id, code } }, update: { module, action }, create: { companyId: company.id, code, module, action } });
  }));
  const superadmin = await prisma.role.upsert({ where: { companyId_code: { companyId: company.id, code: "SUPERADMIN" } }, update: { name: "Superadministrador", isSystem: true }, create: { companyId: company.id, code: "SUPERADMIN", name: "Superadministrador", description: "Acceso total a la plataforma", isSystem: true } });
  const admin = await prisma.role.upsert({ where: { companyId_code: { companyId: company.id, code: "ADMIN" } }, update: { name: "Administrador", isSystem: true }, create: { companyId: company.id, code: "ADMIN", name: "Administrador", description: "Administración operativa sin gestión de accesos", isSystem: true } });
  await prisma.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: superadmin.id, permissionId: permission.id })), skipDuplicates: true });
  await prisma.rolePermission.createMany({ data: permissions.filter((permission) => !permission.code.startsWith("users.") && !permission.code.startsWith("roles.") && !permission.code.startsWith("sessions.")).map((permission) => ({ roleId: admin.id, permissionId: permission.id })), skipDuplicates: true });

  async function seedUser(prefix, role, name) {
    const username = process.env[`SEED_${prefix}_USERNAME`]?.trim().toLowerCase();
    const email = process.env[`SEED_${prefix}_EMAIL`]?.trim().toLowerCase();
    const password = process.env[`SEED_${prefix}_PASSWORD`];
    if (!username || !email || !password) return;
    const user = await prisma.user.upsert({ where: { companyId_email: { companyId: company.id, email } }, update: { username, name, status: "ACTIVE", passwordHash: await hash(password), mustChangePassword: true }, create: { companyId: company.id, username, email, name, passwordHash: await hash(password), mustChangePassword: true } });
    await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, update: {}, create: { userId: user.id, roleId: role.id } });
  }
  await seedUser("SUPERADMIN", superadmin, "Superadministrador");
  await seedUser("ADMIN", admin, "Administrador");
  console.log("Catálogos base, roles y dos usuarios iniciales preparados.");
} finally {
  await prisma.$disconnect();
}
