import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { requirePermission, requireUser } from "@/modules/auth/application/session-service";
import { ExchangeRateError, getExchangeRateOverview, syncRateHistory, syncTodayRate } from "@/modules/exchange-rates/application/exchange-rate-service";

const syncSchema = z.object({ action: z.enum(["TODAY", "HISTORY"]), days: z.number().int().min(7).max(365).optional() });
function known(error: unknown) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); if (error instanceof ExchangeRateError) return apiError("EXCHANGE_RATE_ERROR", error.message, error.status); return null; }
function unexpected(error: unknown) { console.error("Exchange rate API error", error); return apiError("EXCHANGE_RATE_ERROR", "No se pudo completar la consulta del tipo de cambio. Intenta nuevamente.", 502); }

export async function GET(request: Request) {
  try { const user = await requireUser(); const days = Math.min(365, Math.max(7, Number(new URL(request.url).searchParams.get("days") ?? 30) || 30)); return apiSuccess(await getExchangeRateOverview(user.companyId, days)); }
  catch (error) { return known(error) ?? unexpected(error); }
}

export async function POST(request: Request) {
  try { requireSameOrigin(request); } catch (error) { return known(error) ?? unexpected(error); }
  const parsed = syncSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return apiError("VALIDATION_ERROR", "La sincronización solicitada no es válida.", 400);
  try { const user = await requirePermission("catalogs.manage"); const result = parsed.data.action === "TODAY" ? await syncTodayRate(user.companyId, user.id) : await syncRateHistory(user.companyId, user.id, parsed.data.days ?? 90); return apiSuccess(result); }
  catch (error) { return known(error) ?? unexpected(error); }
}
