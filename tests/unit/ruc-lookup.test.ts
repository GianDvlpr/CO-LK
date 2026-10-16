import { describe, expect, it } from "vitest";
import { isValidPeruvianRuc, mapApisNetPeRuc, RucLookupError } from "@/modules/catalogs/application/ruc-lookup";

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
});
