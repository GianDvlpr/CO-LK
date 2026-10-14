import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";

const schema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("SIZE"), code: z.string().trim().min(1).max(30), name: z.string().trim().min(1).max(80), sortOrder: z.number().int().default(0) }),
  z.object({ type: z.literal("COLOR"), code: z.string().trim().min(1).max(30), name: z.string().trim().min(1).max(80), hex: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/).optional() }),
]);

export async function GET() {
  try {
    const user = await requirePermission("products.read");
    const [sizes, colors, units] = await prisma.$transaction([
      prisma.size.findMany({ where: { companyId: user.companyId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      prisma.color.findMany({ where: { companyId: user.companyId }, orderBy: { name: "asc" } }),
      prisma.unitOfMeasure.findMany({ where: { companyId: user.companyId }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true, symbol: true } }),
    ]);
    return apiSuccess({ sizes, colors, units });
  } catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); throw error; }
}

export async function POST(request: Request) {
  try { requireSameOrigin(request); } catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); throw error; }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "La talla o color contiene datos inválidos.", 400);
  try {
    const user = await requirePermission("products.create");
    const result = parsed.data.type === "SIZE"
      ? await prisma.size.create({ data: { companyId: user.companyId, code: parsed.data.code, name: parsed.data.name, sortOrder: parsed.data.sortOrder } })
      : await prisma.color.create({ data: { companyId: user.companyId, code: parsed.data.code, name: parsed.data.name, hex: parsed.data.hex } });
    return apiSuccess(result, 201);
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError("PRODUCT_OPTION_DUPLICATE", "Ya existe una talla o color con ese código.", 409);
    throw error;
  }
}
