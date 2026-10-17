import { afterEach, describe, expect, it, vi } from "vitest";
import { isValidPeruvianRuc, lookupRuc, mapApisNetPeRuc, RucLookupError } from "@/modules/catalogs/application/ruc-lookup";
import { configuredSunatApiTokens, randomizedSunatApiTokens } from "@/modules/catalogs/application/sunat-token-pool";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("consulta de RUC", () => {
  it("valida el dígito verificador peruano", () => {
    expect(isValidPeruvianRuc("20131312955")).toBe(true);
    expect(isValidPeruvianRuc("20601030013")).toBe(true);
    expect(isValidPeruvianRuc("20131312954")).toBe(false);
    expect(isValidPeruvianRuc("123")).toBe(false);
  });

  it("normaliza la respuesta de APIS.NET.PE", () => {
    const result = mapApisNetPeRuc({
      razonSocial: "REXTIE S.A.C.", numeroDocumento: "20601030013", estado: "ACTIVO", condicion: "HABIDO",
      direccion: "AV. JOSE GALVEZ 566", ubigeo: "150131", departamento: "LIMA", provincia: "LIMA", distrito: "SAN ISIDRO",
    }, "2026-10-16T12:00:00.000Z");
    expect(result).toEqual({
      ruc: "20601030013", name: "REXTIE S.A.C.", status: "ACTIVO", condition: "HABIDO",
      fiscalAddress: "AV. JOSE GALVEZ 566", ubigeo: "150131", department: "LIMA", province: "LIMA", district: "SAN ISIDRO",
      source: "APIS.NET.PE", consultedAt: "2026-10-16T12:00:00.000Z",
    });
  });

  it("rechaza respuestas incompletas del proveedor", () => {
    expect(() => mapApisNetPeRuc({ numeroDocumento: "20131312955" })).toThrow(RucLookupError);
  });

  it("usa las dos claves nuevas y omite duplicados", () => {
    expect(configuredSunatApiTokens({ SUNAT_RUC_API_TOKEN_1: "key-a", SUNAT_RUC_API_TOKEN_2: "key-b", SUNAT_RUC_API_TOKEN: "legacy" })).toEqual(["key-a", "key-b"]);
    expect(configuredSunatApiTokens({ SUNAT_RUC_API_TOKEN_1: "key-a", SUNAT_RUC_API_TOKEN_2: "key-a" })).toEqual(["key-a"]);
  });

  it("elige aleatoriamente la primera clave sin perder la alternativa", () => {
    expect(randomizedSunatApiTokens(["key-a", "key-b"], () => 0)).toEqual(["key-a", "key-b"]);
    expect(randomizedSunatApiTokens(["key-a", "key-b"], () => 0.99)).toEqual(["key-b", "key-a"]);
  });

  it("mantiene compatibilidad con la variable anterior", () => {
    expect(configuredSunatApiTokens({ SUNAT_RUC_API_TOKEN: "legacy" })).toEqual(["legacy"]);
  });

  it("prueba la segunda clave cuando la primera está limitada", async () => {
    vi.stubEnv("SUNAT_RUC_API_URL", "https://api.example.test/ruc");
    vi.stubEnv("SUNAT_RUC_API_TOKEN_1", "key-a");
    vi.stubEnv("SUNAT_RUC_API_TOKEN_2", "key-b");
    vi.spyOn(Math, "random").mockReturnValue(0);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ numeroDocumento: "20131312955", razonSocial: "SUNAT" }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(lookupRuc("20131312955")).resolves.toMatchObject({ ruc: "20131312955", name: "SUNAT" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([, init]) => (init?.headers as Record<string, string>).Authorization)).toEqual(["Bearer key-a", "Bearer key-b"]);
  });
});
