export type ElectronicDocumentKind =
  | "INVOICE"
  | "RECEIPT"
  | "CREDIT_NOTE"
  | "DEBIT_NOTE"
  | "SENDER_GUIDE"
  | "CARRIER_GUIDE"
  | "RETENTION"
  | "PERCEPTION"
  | "PURCHASE_SETTLEMENT"
  | "DAILY_SUMMARY"
  | "VOIDED_DOCUMENT"
  | "REVERSION";

export type ElectronicDocumentStatus =
  | "SUBMITTING"
  | "PENDING"
  | "SENT"
  | "PROCESSING"
  | "ACCEPTED"
  | "ACCEPTED_WITH_OBSERVATION"
  | "REJECTED"
  | "ERROR"
  | "VOIDED";

export type BillingApiSuccess<T> = {
  estado: "exito";
  mensaje: string;
  datos: T;
  meta?: Record<string, unknown>;
};

export type BillingApiFailure = {
  estado: "error";
  mensaje: string;
  errores?: Record<string, string[] | string>;
  codigo_error?: string;
  siguiente_accion?: Record<string, unknown>;
};

export type RemoteDocument = {
  id?: string | number;
  id_resumen?: string | number;
  id_anulacion?: string | number;
  voided_id?: string | number;
  identifier?: string;
  serie?: string;
  correlativo?: string | number;
  numero_completo?: string;
  sunat_status?: string;
  sunat_code?: string | null;
  sunat_description?: string | null;
  sunat_notes?: string[] | null;
  estado_sunat?: string;
  codigo_sunat?: string | null;
  descripcion_sunat?: string | null;
  notas_sunat?: string[] | null;
  ticket?: string | null;
  num_ticket?: string | null;
  [key: string]: unknown;
};

export type OfficialCpeResult = {
  encontrado: boolean;
  mensaje?: string;
  estado_cp?: "0" | "1" | "2" | "3" | "4";
  estado_cp_descripcion?: string;
  estado_ruc?: string;
  estado_ruc_descripcion?: string;
  cond_domi_ruc?: string;
  cond_domi_ruc_descripcion?: string;
  observaciones?: string[];
  consultado_por_ruc?: string;
  ruc_emisor: string;
  tipo_doc: string;
  serie: string;
  correlativo: number;
};

export type SunatServiceMonitor = {
  disponible: boolean;
  circuit: "closed" | "open" | "half_open";
  fallas: number;
  entorno: string;
};

export type RemoteSeries = {
  id: number;
  tipo: string;
  tipo_documento: string;
  serie: string;
  correlativo: number;
  siguiente_numero: string;
  sucursal: { id: number; nombre: string; cod_local: string } | null;
  activo: boolean;
};

export type RemoteBranch = {
  id: number;
  nombre: string;
  cod_local: string;
  direccion: string;
  ubigeo: string;
  telefono: string | null;
  email: string | null;
  es_principal: boolean;
  activo: boolean;
  total_series: number;
};

export type RemotePayment = {
  id: number;
  metodo: string;
  monto: number;
  referencia?: string | null;
  monto_recibido?: number | null;
  vuelto?: number | null;
  notas?: string | null;
  creado_en?: string | null;
};

export type RemotePaymentSummary = {
  pagos: RemotePayment[];
  estado_pago: string;
  monto_pagado: number;
  total_documento?: number;
};

export type BillingParty = {
  tipo_doc: "0" | "1" | "4" | "6" | "7";
  num_doc: string;
  razon_social: string;
  direccion?: string;
};

export type BillingItem = {
  codigo?: string;
  cod_producto_sunat?: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precio_unitario: number;
  tip_afe_igv: string;
};

export type InvoicePayload = {
  serie: string;
  fecha_emision: string;
  fecha_vencimiento?: string;
  tipo_operacion?: string;
  tipo_moneda: string;
  forma_pago: "Contado" | "Credito";
  cliente: BillingParty;
  items: BillingItem[];
  observacion?: string;
  enviar_automatico?: boolean;
  descuentos_globales?: Array<{
    cod_tipo: string;
    porcentaje?: number;
    monto?: number;
  }>;
  cuotas?: Array<{
    moneda?: string;
    monto: number;
    fecha_pago: string;
  }>;
};

export type CreditOrDebitNotePayload = {
  serie: string;
  fecha_emision: string;
  doc_afectado_tipo: "01" | "03";
  doc_afectado_serie: string;
  doc_afectado_correlativo: string;
  cod_motivo: string;
  des_motivo: string;
  cliente: BillingParty;
  items: BillingItem[];
  tipo_moneda?: string;
  enviar_automatico?: boolean;
};

export type BinaryDocument = {
  bytes: ArrayBuffer;
  contentType: string;
  fileName?: string;
};

export type BillingList<T> = {
  datos: T[];
  paginacion?: {
    pagina_actual: number;
    ultima_pagina: number;
    por_pagina: number;
    total: number;
  };
};
