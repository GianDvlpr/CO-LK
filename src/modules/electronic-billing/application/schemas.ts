import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use el formato AAAA-MM-DD.");
const code = z.string().trim().min(1).max(30);
const text = z.string().trim().min(1).max(500);
const money = z.coerce.number().nonnegative().finite();
const positive = z.coerce.number().positive().finite();
const party = z.object({
  tipo_doc: z.enum(["0", "1", "4", "6", "7"]),
  num_doc: z.string().trim().min(1).max(20),
  razon_social: z.string().trim().min(1).max(250),
  direccion: z.string().trim().max(500).optional(),
});
const series = z.string().trim().min(4).max(20).optional();
const send = z.boolean().optional();
const guideItem = z.object({ codigo: code.optional(), descripcion: text, cantidad: positive, unidad: code });
const billingItem = guideItem.extend({
  precio_unitario: positive,
  tip_afe_igv: code,
  cod_producto_sunat: code.optional(),
});

const notePayload = z.object({
  serie: series,
  fecha_emision: date,
  doc_afectado_tipo: z.enum(["01", "03"]),
  doc_afectado_serie: code,
  doc_afectado_correlativo: code,
  cod_motivo: code,
  des_motivo: text,
  cliente: party,
  items: z.array(billingItem).min(1).max(500),
  tipo_moneda: code.optional(),
  enviar_automatico: send,
});

const vehicle = z.object({
  placa: code,
  nro_circulacion: code.optional(),
  secundarios: z.array(z.object({ placa: code, nro_circulacion: code.optional() })).max(20).optional(),
});
const driver = z.object({
  tipo: z.enum(["Principal", "Secundario"]).optional(),
  tipo_doc: z.enum(["1", "4", "6", "7"]),
  num_doc: code,
  nombres: text,
  apellidos: text,
  licencia: code,
});
const guideBase = z.object({
  serie: series,
  fecha_emision: date,
  destinatario: party,
  cod_traslado: code,
  mod_traslado: z.enum(["01", "02"]),
  fecha_traslado: date,
  peso_total: positive,
  und_peso_total: code,
  num_bultos: z.coerce.number().int().positive().optional(),
  partida_ubigeo: z.string().regex(/^\d{6}$/),
  partida_direccion: text,
  partida_ruc: z.string().regex(/^\d{11}$/).optional(),
  partida_cod_local: code.optional(),
  llegada_ubigeo: z.string().regex(/^\d{6}$/),
  llegada_direccion: text,
  llegada_ruc: z.string().regex(/^\d{11}$/).optional(),
  llegada_cod_local: code.optional(),
  items: z.array(guideItem).min(1).max(500),
  enviar_automatico: send,
});
const senderGuidePayload = guideBase.extend({
  fecha_de_entrega_al_transportista: date.optional(),
  transportista: party.extend({ nro_mtc: code.optional() }).optional(),
  vehiculo: vehicle.optional(),
  conductor: driver.optional(),
  conductores: z.array(driver).max(20).optional(),
  indicadores: z.array(code).max(20).optional(),
}).superRefine((value, context) => {
  if (value.mod_traslado === "01" && !value.transportista) context.addIssue({ code: "custom", path: ["transportista"], message: "El transporte público requiere transportista." });
  if (value.mod_traslado === "02" && !value.vehiculo && !value.indicadores?.length) context.addIssue({ code: "custom", path: ["vehiculo"], message: "El transporte privado requiere vehículo o indicador M1/L." });
});
const carrierGuidePayload = guideBase.extend({
  remitente: party,
  doc_relacionado: z.object({ tipo_codigo: code, numero: code, ruc_emisor: z.string().regex(/^\d{11}$/).optional() }),
  vehiculo: vehicle,
  conductor: z.array(driver).min(1).max(20),
  datos_subcontratador: party.optional(),
  datos_pagador_flete: z.object({ tipo: z.enum(["remitente", "destinatario", "subcontratador", "tercero"]), tipo_doc: code.optional(), num_doc: code.optional(), razon_social: text.optional() }).optional(),
});

const payment = z.object({ moneda: code.optional(), importe: positive, fecha: date });
const retentionPayload = z.object({
  serie: series,
  fecha_emision: date,
  cod_local: code.optional(),
  regimen: code,
  tasa: positive,
  proveedor: party,
  documentos: z.array(z.object({
    tipo_doc: code, num_doc: code, fecha_emision: date, moneda: code, imp_total: positive,
    fecha_retencion: date, imp_retenido: money.optional(), imp_pagar: money.optional(), pagos: z.array(payment).min(1).max(100),
  })).min(1).max(100),
  enviar_automatico: send,
});
const perceptionPayload = z.object({
  serie: series,
  fecha_emision: date,
  cod_local: code.optional(),
  regimen: code,
  tasa: positive,
  cliente: party,
  observacion: text.optional(),
  documentos: z.array(z.object({
    tipo_doc: code, num_doc: code, fecha_emision: date, moneda: code, imp_total: positive,
    fecha_percepcion: date, cobros: z.array(payment.omit({ moneda: true })).min(1).max(100),
  })).min(1).max(100),
  enviar_automatico: send,
});
const purchaseSettlementPayload = z.object({
  serie: series,
  fecha_emision: date,
  tipo_operacion: code.default("0501"),
  vendedor: z.object({ tipo_doc: code, num_doc: code, nombre: text, direccion: text, ubigeo: z.string().regex(/^\d{6}$/), tipo_domicilio: code }),
  lugar: z.object({ direccion: text, ubigeo: z.string().regex(/^\d{6}$/), tipo: code }),
  items: z.array(z.object({ descripcion: text, cantidad: positive, valor_unitario: positive, unidad: code, cod_producto_sunat: code.optional(), tip_afe_igv: code })).min(1).max(500),
  enviar_automatico: send,
});
const dailySummaryPayload = z.object({ fecha_resumen: date, anular: z.array(z.object({ id: z.coerce.number().int().positive(), motivo: text })).min(1).max(500).optional(), enviar_automatico: send });
const voidedPayload = z.object({ fecha_generacion: date, fecha_comunicacion: date.optional(), detalles: z.array(z.object({ tipo_documento: z.enum(["01", "07", "08"]), serie: code, correlativo: code, motivo: text })).min(1).max(500), enviar_automatico: send });
const reversionPayload = z.object({ fecha_generacion: date, fecha_comunicacion: date.optional(), detalles: z.array(z.object({ tipo_documento: z.enum(["20", "40"]), serie: code, correlativo: code, motivo: text })).min(1).max(500), enviar_automatico: send });

const operationKey = z.string().trim().min(8).max(120).regex(/^[A-Za-z0-9:_-]+$/);
export const createElectronicDocumentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("CREDIT_NOTE"), operationKey, payload: notePayload }),
  z.object({ kind: z.literal("DEBIT_NOTE"), operationKey, payload: notePayload }),
  z.object({ kind: z.literal("SENDER_GUIDE"), operationKey, payload: senderGuidePayload }),
  z.object({ kind: z.literal("CARRIER_GUIDE"), operationKey, payload: carrierGuidePayload }),
  z.object({ kind: z.literal("RETENTION"), operationKey, payload: retentionPayload }),
  z.object({ kind: z.literal("PERCEPTION"), operationKey, payload: perceptionPayload }),
  z.object({ kind: z.literal("PURCHASE_SETTLEMENT"), operationKey, payload: purchaseSettlementPayload }),
  z.object({ kind: z.literal("DAILY_SUMMARY"), operationKey, payload: dailySummaryPayload }),
  z.object({ kind: z.literal("VOIDED_DOCUMENT"), operationKey, payload: voidedPayload }),
  z.object({ kind: z.literal("REVERSION"), operationKey, payload: reversionPayload }),
]);

export type CreateElectronicDocumentInput = z.infer<typeof createElectronicDocumentSchema>;
