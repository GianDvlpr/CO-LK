import { apiSuccess } from "@/lib/http/api-response";
import { getEnvironmentReadiness } from "@/lib/env/server";

export const dynamic = "force-dynamic";

export function GET() {
  const readiness = getEnvironmentReadiness();

  return apiSuccess({
    service: "lk-innovacion",
    status: "ok",
    configuration: readiness.ready ? "ready" : "pending",
    timestamp: new Date().toISOString(),
  });
}
