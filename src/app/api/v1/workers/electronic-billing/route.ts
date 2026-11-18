import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { reconcileElectronicDocuments } from "@/modules/electronic-billing/application/electronic-document-service";

function validSecret(request: Request) {
  const expected = process.env.WORKER_SECRET;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !provided) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  if (!process.env.WORKER_SECRET) return apiError("WORKER_NOT_CONFIGURED", "El worker todavía no está configurado.", 503);
  if (!validSecret(request)) return apiError("UNAUTHORIZED", "Credencial de worker inválida.", 401);
  const rawLimit = Number(new URL(request.url).searchParams.get("limit") ?? 25);
  return apiSuccess(await reconcileElectronicDocuments(prisma, Number.isInteger(rawLimit) ? rawLimit : 25));
}
