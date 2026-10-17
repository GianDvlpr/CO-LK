import { readServerEnv } from "@/lib/env/server";
import { configuredSunatApiTokens, randomizedSunatApiTokens } from "./sunat-token-pool";

export type RucLookupResult = {
  ruc: string;
  name: string;
  status: string | null;
  condition: string | null;
  fiscalAddress: string | null;
  ubigeo: string | null;
  department: string | null;
  province: string | null;
  district: string | null;
  source: "APIS.NET.PE";
  consultedAt: string;
};

export class RucLookupError extends Error {
  constructor(
    public readonly code: "INVALID_RUC" | "RUC_NOT_FOUND" | "RUC_PROVIDER_NOT_CONFIGURED" | "RUC_PROVIDER_UNAVAILABLE",
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "RucLookupError";
  }
}

export function isValidPeruvianRuc(value: string) {
  if (!/^\d{11}$/.test(value)) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((total, weight, index) => total + Number(value[index]) * weight, 0);
  const checkDigit = (11 - (sum % 11)) % 10;
  return checkDigit === Number(value[10]);
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function mapApisNetPeRuc(payload: unknown, consultedAt = new Date().toISOString()): RucLookupResult {
  if (!payload || typeof payload !== "object") throw new RucLookupError("RUC_PROVIDER_UNAVAILABLE", "El servicio de consulta RUC devolvió una respuesta inválida.", 502);
  const data = payload as Record<string, unknown>;
  const ruc = optionalText(data.numeroDocumento);
  const name = optionalText(data.razonSocial) ?? optionalText(data.nombre);
  if (!ruc || !name) throw new RucLookupError("RUC_PROVIDER_UNAVAILABLE", "El servicio de consulta RUC devolvió datos incompletos.", 502);
  return {
    ruc,
    name,
    status: optionalText(data.estado),
    condition: optionalText(data.condicion),
    fiscalAddress: optionalText(data.direccion),
    ubigeo: optionalText(data.ubigeo),
    department: optionalText(data.departamento),
    province: optionalText(data.provincia),
    district: optionalText(data.distrito),
    source: "APIS.NET.PE",
    consultedAt,
  };
}

export async function lookupRuc(ruc: string): Promise<RucLookupResult> {
  const normalized = ruc.trim();
  if (!isValidPeruvianRuc(normalized)) throw new RucLookupError("INVALID_RUC", "Ingresa un RUC peruano válido de 11 dígitos.", 400);

  const env = readServerEnv();
  const tokens = randomizedSunatApiTokens(configuredSunatApiTokens(env));
  if (!tokens.length) {
    throw new RucLookupError(
      "RUC_PROVIDER_NOT_CONFIGURED",
      "La consulta RUC todavía no está configurada. Agrega SUNAT_RUC_API_TOKEN_1 y SUNAT_RUC_API_TOKEN_2 en el servidor.",
      503,
    );
  }

  const url = new URL(env.SUNAT_RUC_API_URL);
  url.searchParams.set("numero", normalized);
  for (const [index, token] of tokens.entries()) {
    const hasFallback = index < tokens.length - 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          Referer: "https://apis.net.pe/api-consulta-ruc",
          "User-Agent": "LK-INNOVACION/1.0",
        },
        signal: controller.signal,
        cache: "no-store",
      });
      if (response.status === 404) throw new RucLookupError("RUC_NOT_FOUND", "El RUC no existe en el padrón consultado.", 404);
      if (response.status === 422) throw new RucLookupError("INVALID_RUC", "El proveedor rechazó el número de RUC.", 400);
      if (response.status === 401 || response.status === 403) {
        if (hasFallback) continue;
        throw new RucLookupError("RUC_PROVIDER_NOT_CONFIGURED", "Las claves del servicio de consulta RUC no son válidas o no tienen acceso.", 503);
      }
      if (response.status === 429 || response.status >= 500) {
        if (hasFallback) continue;
        throw new RucLookupError("RUC_PROVIDER_UNAVAILABLE", "El servicio de consulta RUC no está disponible. Intenta nuevamente.", 502);
      }
      if (!response.ok) throw new RucLookupError("RUC_PROVIDER_UNAVAILABLE", "El servicio de consulta RUC no está disponible. Intenta nuevamente.", 502);
      const result = mapApisNetPeRuc(await response.json());
      if (result.ruc !== normalized) throw new RucLookupError("RUC_PROVIDER_UNAVAILABLE", "El servicio de consulta RUC devolvió un contribuyente distinto al solicitado.", 502);
      return result;
    } catch (error) {
      if (error instanceof RucLookupError) throw error;
      if (!hasFallback) throw new RucLookupError("RUC_PROVIDER_UNAVAILABLE", "No se pudo conectar con el servicio de consulta RUC. Intenta nuevamente.", 502);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new RucLookupError("RUC_PROVIDER_UNAVAILABLE", "No se pudo consultar el RUC con las claves configuradas.", 502);
}
