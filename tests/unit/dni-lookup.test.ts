import { describe, expect, it } from "vitest";
import { DniLookupError, mapApisNetPeDni } from "@/modules/catalogs/application/dni-lookup";

describe("consulta de DNI", () => {
  it("normaliza la respuesta de APIS.NET.PE", () => {
    const result = mapApisNetPeDni({
      numeroDocumento: "46027897",
      nombre: "HUAMANI MENDOZA ERACLEO JUAN",
      nombres: "ERACLEO JUAN",
      apellidoPaterno: "HUAMANI",
      apellidoMaterno: "MENDOZA",
    }, "2026-10-16T12:00:00.000Z");
    expect(result).toEqual({
      dni: "46027897",
      name: "HUAMANI MENDOZA ERACLEO JUAN",
      firstNames: "ERACLEO JUAN",
      paternalSurname: "HUAMANI",
      maternalSurname: "MENDOZA",
      source: "APIS.NET.PE",
      consultedAt: "2026-10-16T12:00:00.000Z",
    });
  });

  it("acepta la estructura alternativa del proveedor", () => {
    const result = mapApisNetPeDni({ numero: "44556677", nombre_completo: "PEREZ GARCIA JUAN CARLOS" });
    expect(result.dni).toBe("44556677");
    expect(result.name).toBe("PEREZ GARCIA JUAN CARLOS");
  });

  it("acepta la respuesta vigente de Decolecta", () => {
    const result = mapApisNetPeDni({
      document_number: "46027897",
      full_name: "HUAMANI MENDOZA ERACLEO JUAN",
      first_name: "ERACLEO JUAN",
      first_last_name: "HUAMANI",
      second_last_name: "MENDOZA",
    });
    expect(result).toMatchObject({
      dni: "46027897",
      name: "HUAMANI MENDOZA ERACLEO JUAN",
      firstNames: "ERACLEO JUAN",
      paternalSurname: "HUAMANI",
      maternalSurname: "MENDOZA",
    });
  });

  it("rechaza respuestas incompletas", () => {
    expect(() => mapApisNetPeDni({ numeroDocumento: "46027897" })).toThrow(DniLookupError);
  });
});
