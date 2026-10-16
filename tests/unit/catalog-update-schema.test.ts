import { describe, expect, it } from "vitest";
import { catalogUpdateSchema } from "@/modules/catalogs/domain/catalog-update-schema";

describe("validación de edición de catálogos", () => {
  it("acepta los contactos opcionales vacíos que PostgreSQL devuelve como null", () => {
    const parsed = catalogUpdateSchema.safeParse({
      name: "Proveedor sin datos de contacto",
      documentType: "RUC",
      taxId: null,
      email: null,
      phone: null,
      fiscalAddress: null,
      sunatCheckedAt: null,
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toMatchObject({ name: "Proveedor sin datos de contacto", taxId: undefined, email: undefined, phone: undefined, fiscalAddress: undefined, sunatCheckedAt: undefined });
  });

  it("mantiene válidos los datos de contacto informados", () => {
    const parsed = catalogUpdateSchema.safeParse({
      name: "Polímeros del Sur",
      documentType: "RUC",
      taxId: "20123456789",
      email: "ventas@polimeros.test",
      phone: "999 111 222",
      fiscalAddress: "AV. INDUSTRIAL 123",
      ubigeo: "150101",
      department: "LIMA",
      province: "LIMA",
      district: "LIMA",
      rucStatus: "ACTIVO",
      rucCondition: "HABIDO",
      sunatSource: "APIS.NET.PE",
      sunatCheckedAt: "2026-10-16T12:00:00.000Z",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.sunatCheckedAt).toEqual(new Date("2026-10-16T12:00:00.000Z"));
  });

  it("valida la longitud según el tipo de documento", () => {
    expect(catalogUpdateSchema.safeParse({ name: "Cliente DNI", documentType: "DNI", taxId: "44556677" }).success).toBe(true);
    expect(catalogUpdateSchema.safeParse({ name: "Cliente DNI inválido", documentType: "DNI", taxId: "20131312955" }).success).toBe(false);
    expect(catalogUpdateSchema.safeParse({ name: "Cliente RUC inválido", documentType: "RUC", taxId: "44556677" }).success).toBe(false);
  });
});
