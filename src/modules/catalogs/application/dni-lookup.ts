import { readServerEnv } from "@/lib/env/server";
import { configuredSunatApiTokens, randomizedSunatApiTokens } from "./sunat-token-pool";

export type DniLookupResult = {
  dni: string;
  name: string;
  firstNames: string | null;
  paternalSurname: string | null;
  maternalSurname: string | null;
  source: "APIS.NET.PE";
  consultedAt: string;
};

export class DniLookupError extends Error {
  constructor(
    public readonly code: "INVALID_DNI" | "DNI_NOT_FOUND" | "DNI_PROVIDER_NOT_CONFIGURED" | "DNI_PROVIDER_UNAVAILABLE",
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "DniLookupError";
  }
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function mapApisNetPeDni(payload: unknown, consultedAt = new Date().toISOString()): DniLookupResult {
  if (!payload || typeof payload !== "object") throw new DniLookupError("DNI_PROVIDER_UNAVAILABLE", "El servicio de consulta DNI devolvió una respuesta inválida.", 502);
  const data = payload as Record<string, unknown>;
  const dni = optionalText(data.document_number) ?? optionalText(data.numeroDocumento) ?? optionalText(data.numero);
  const name = optionalText(data.full_name) ?? optionalText(data.nombre) ?? optionalText(data.nombre_completo);
  if (!dni || !name) throw new DniLookupError("DNI_PROVIDER_UNAVAILABLE", "El servicio de consulta DNI devolvió datos incompletos.", 502);
  return {
    dni,
    name,
    firstNames: optionalText(data.first_name) ?? optionalText(data.nombres),
    paternalSurname: optionalText(data.first_last_name) ?? optionalText(data.apellidoPaterno) ?? optionalText(data.apellido_paterno),
    maternalSurname: optionalText(data.second_last_name) ?? optionalText(data.apellidoMaterno) ?? optionalText(data.apellido_materno),
    source: "APIS.NET.PE",
    consultedAt,
  };
}

export async function lookupDni(dni: string): Promise<DniLookupResult> {
  const normalized = dni.trim();
  if (!/^\d{8}$/.test(normalized)) throw new DniLookupError("INVALID_DNI", "Ingresa un DNI peruano válido de 8 dígitos.", 400);

  const env = readServerEnv();
  const tokens = randomizedSunatApiTokens(configuredSunatApiTokens(env));
  if (!tokens.length) {
    throw new DniLookupError(
      "DNI_PROVIDER_NOT_CONFIGURED",
      "La consulta DNI todavía no está configurada. Agrega las claves de consulta en el servidor.",
      503,
    );
  }

  const url = new URL(env.SUNAT_DNI_API_URL);
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
          Referer: "https://apis.net.pe/api-consulta-dni",
          "User-Agent": "LK-INNOVACION/1.0",
        },
        signal: controller.signal,
        cache: "no-store",
      });
      if (response.status === 404) throw new DniLookupError("DNI_NOT_FOUND", "El DNI no existe en las fuentes consultadas.", 404);
      if (response.status === 400 || response.status === 422) throw new DniLookupError("INVALID_DNI", "El proveedor rechazó el número de DNI.", 400);
      if (response.status === 401 || response.status === 403 || response.status === 429 || response.status >= 500) {
        if (hasFallback) continue;
        throw new DniLookupError("DNI_PROVIDER_UNAVAILABLE", "Las claves de consulta DNI no están disponibles. Intenta nuevamente.", 502);
      }
      if (!response.ok) throw new DniLookupError("DNI_PROVIDER_UNAVAILABLE", "El servicio de consulta DNI no está disponible. Intenta nuevamente.", 502);
      const result = mapApisNetPeDni(await response.json());
      if (result.dni !== normalized) throw new DniLookupError("DNI_PROVIDER_UNAVAILABLE", "El servicio de consulta DNI devolvió una persona distinta a la solicitada.", 502);
      return result;
    } catch (error) {
      if (error instanceof DniLookupError) throw error;
      if (!hasFallback) throw new DniLookupError("DNI_PROVIDER_UNAVAILABLE", "No se pudo conectar con el servicio de consulta DNI. Intenta nuevamente.", 502);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new DniLookupError("DNI_PROVIDER_UNAVAILABLE", "No se pudo consultar el DNI con las claves configuradas.", 502);
}
