import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { allModules } from "@/lib/config/modules";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { getRequestIp, getRequestUserAgent } from "@/modules/auth/application/request-metadata";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { requireUser } from "@/modules/auth/application/session-service";

const schema = z.object({ path: z.string().trim().startsWith("/dashboard").max(200) });

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("VALIDATION_ERROR", "La ruta del módulo no es válida.", 400);
    const appModule = allModules.filter((item) => parsed.data.path === item.href || parsed.data.path.startsWith(`${item.href}/`)).sort((a, b) => b.href.length - a.href.length)[0];
    if (!appModule || !user.permissions.includes(appModule.permission)) return apiError("FORBIDDEN", "No tienes acceso a este módulo.", 403);

    const recent = await prisma.auditLog.findFirst({
      where: { companyId: user.companyId, userId: user.id, module: appModule.key, entity: "Module", action: "ACCESS", createdAt: { gte: new Date(Date.now() - 60_000) } },
      select: { id: true },
    });
    if (recent) return apiSuccess({ recorded: false });

    await prisma.auditLog.create({ data: {
      companyId: user.companyId,
      userId: user.id,
      module: appModule.key,
      entity: "Module",
      entityId: appModule.key,
      action: "ACCESS",
      ipAddress: getRequestIp(request),
      userAgent: getRequestUserAgent(request),
      requestPath: parsed.data.path,
      afterData: { label: appModule.label },
    } });
    return apiSuccess({ recorded: true }, 201);
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
