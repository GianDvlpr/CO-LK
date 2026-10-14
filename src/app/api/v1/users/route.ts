import { hash } from "@node-rs/argon2";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";

const schema = z.object({
  username: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/),
  name: z.string().trim().min(1).max(150),
  password: z.string().min(6),
  roleIds: z.array(z.uuid()).min(1),
});

function known(error: unknown) {
  if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError("USER_DUPLICATE", "El nombre de usuario ya está registrado.", 409);
  return null;
}

export async function GET() {
  try {
    const actor = await requirePermission("users.read");
    const [items, roles] = await Promise.all([
      prisma.user.findMany({ where: { companyId: actor.companyId }, orderBy: { name: "asc" }, select: { id: true, username: true, name: true, status: true, mustChangePassword: true, createdAt: true, userRoles: { select: { role: { select: { id: true, code: true, name: true } } } } } }),
      prisma.role.findMany({ where: { companyId: actor.companyId }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true } }),
    ]);
    return apiSuccess({ items, roles });
  } catch (error) {
    const response = known(error); if (response) return response; throw error;
  }
}

export async function POST(request: Request) {
  try { requireSameOrigin(request); } catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); throw error; }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Los datos no son válidos; el usuario requiere 3 caracteres y la contraseña al menos 6.", 400);
  try {
    const actor = await requirePermission("users.create");
    const user = await prisma.$transaction(async (tx) => {
      const roles = await tx.role.findMany({ where: { companyId: actor.companyId, id: { in: parsed.data.roleIds } } });
      if (roles.length !== new Set(parsed.data.roleIds).size) throw new Error("USER_INVALID_ROLES");
      const username = parsed.data.username.toLowerCase();
      if (await tx.user.findFirst({ where: { username }, select: { id: true } })) throw new Error("USER_DUPLICATE_USERNAME");
      const created = await tx.user.create({ data: { companyId: actor.companyId, username, email: `${username}@internal.lkinnovacion`, name: parsed.data.name, passwordHash: await hash(parsed.data.password), mustChangePassword: true, userRoles: { create: roles.map((role) => ({ roleId: role.id })) } } });
      await tx.auditLog.create({ data: { companyId: actor.companyId, userId: actor.id, entity: "User", entityId: created.id, action: "CREATE", afterData: { username: created.username, roles: roles.map((role) => role.code) } } });
      await tx.outboxEvent.create({ data: { companyId: actor.companyId, topic: `private-company-${actor.companyId}`, eventName: "user.created.v1", aggregateId: created.id, payload: { userId: created.id, username: created.username } } });
      return created;
    });
    return apiSuccess(user, 201);
  } catch (error) {
    if (error instanceof Error && error.message === "USER_INVALID_ROLES") return apiError("USER_INVALID_ROLES", "Uno o más roles no son válidos.", 422);
    if (error instanceof Error && error.message === "USER_DUPLICATE_USERNAME") return apiError("USER_DUPLICATE", "El nombre de usuario ya está registrado.", 409);
    const response = known(error); if (response) return response; throw error;
  }
}
