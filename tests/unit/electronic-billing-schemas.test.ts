import { describe, expect, it } from "vitest";
import { createElectronicDocumentSchema } from "@/modules/electronic-billing/application/schemas";

describe("createElectronicDocumentSchema", () => {
  it("acepta una retención válida sin serie porque el servidor la inyecta", () => {
    const result = createElectronicDocumentSchema.safeParse({
      kind: "RETENTION",
      operationKey: "retention:test:001",
      payload: {
        fecha_emision: "2026-11-18",
        regimen: "01",
        tasa: 3,
        proveedor: { tipo_doc: "6", num_doc: "20000000002", razon_social: "PROVEEDOR SAC" },
        documentos: [{
          tipo_doc: "01", num_doc: "F001-100", fecha_emision: "2026-11-17", moneda: "PEN",
          imp_total: 1180, fecha_retencion: "2026-11-18", pagos: [{ importe: 1180, fecha: "2026-11-18" }],
        }],
      },
    });
    expect(result.success).toBe(true);
  });

  it("rechaza una guía privada sin vehículo ni indicador M1/L", () => {
    const result = createElectronicDocumentSchema.safeParse({
      kind: "SENDER_GUIDE",
      operationKey: "guide:test:001",
      payload: {
        fecha_emision: "2026-11-18",
        destinatario: { tipo_doc: "6", num_doc: "20000000002", razon_social: "DESTINO SAC" },
        cod_traslado: "01", mod_traslado: "02", fecha_traslado: "2026-11-18", peso_total: 1,
        und_peso_total: "KGM", partida_ubigeo: "150101", partida_direccion: "Origen",
        llegada_ubigeo: "150203", llegada_direccion: "Destino",
        items: [{ descripcion: "Mercadería", cantidad: 1, unidad: "NIU" }],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rechaza detalles de baja con tipos de documento no permitidos", () => {
    const result = createElectronicDocumentSchema.safeParse({
      kind: "VOIDED_DOCUMENT",
      operationKey: "void:test:001",
      payload: { fecha_generacion: "2026-11-18", detalles: [{ tipo_documento: "03", serie: "B001", correlativo: "1", motivo: "Error" }] },
    });
    expect(result.success).toBe(false);
  });
});
