import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";

const schema = z.object({ username: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/), name: z.string().trim().min(1).max(150), roleIds: z.array(z.uuid()).min(1) });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const actor = await requirePermission("users.update");
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("VALIDATION_ERROR", "El usuario contiene datos inválidos.", 400);
    const { id } = await context.params;
    const target = await prisma.user.findFirst({ where: { id, companyId: actor.companyId }, include: { userRoles: true } });
    if (!target) return apiError("USER_NOT_FOUND", "El usuario no existe.", 404);
    const roles = await prisma.role.findMany({ where: { companyId: actor.companyId, id: { in: parsed.data.roleIds } } });
    if (roles.length !== new Set(parsed.data.roleIds).size) return apiError("USER_INVALID_ROLES", "Uno o más roles no son válidos.", 422);
    const username = parsed.data.username.toLowerCase();
    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({ where: { id }, data: { username, email: `${username}@internal.lkinnovacion`, name: parsed.data.name } });
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({ data: roles.map((role) => ({ userId: id, roleId: role.id })) });
      await tx.auditLog.create({ data: { companyId: actor.companyId, userId: actor.id, entity: "User", entityId: id, action: "UPDATE", afterData: { username, name: parsed.data.name, roles: roles.map((role) => role.code) } } });
      return user;
    });
    return apiSuccess(updated);
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError("USER_DUPLICATE", "El nombre de usuario ya está registrado.", 409);
    throw error;
  }
}
