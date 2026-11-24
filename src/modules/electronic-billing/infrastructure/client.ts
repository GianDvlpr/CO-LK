import {
  ElectronicBillingError,
  billingHttpError,
} from "@/modules/electronic-billing/application/errors";
import type {
  BillingApiFailure,
  BillingApiSuccess,
  BillingPdfFormat,
  BinaryDocument,
  CreditOrDebitNotePayload,
  FiscalReportName,
  InvoicePayload,
  OfficialCpeResult,
  RemoteDocument,
  RemoteBranch,
  RemotePaymentSummary,
  RemoteSeries,
  SunatServiceMonitor,
} from "@/modules/electronic-billing/domain/types";
import type { ElectronicBillingConfig } from "@/modules/electronic-billing/infrastructure/config";

type FetchImplementation = typeof fetch;
type SleepImplementation = (milliseconds: number) => Promise<void>;

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  idempotencyKey?: string;
  retries?: number;
};

const defaultSleep: SleepImplementation = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(attempt: number, retryAfter: string | null) {
  const seconds = retryAfter ? Number(retryAfter) : Number.NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, 60_000);
  const base = Math.min(750 * 2 ** attempt, 15_000);
  return base + Math.floor(Math.random() * Math.max(100, Math.floor(base * 0.25)));
}

async function parseFailure(response: Response): Promise<BillingApiFailure | undefined> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) return undefined;
  const value = await response.json().catch(() => undefined);
  if (!value || typeof value !== "object") return undefined;
  return value as BillingApiFailure;
}

export class ElectronicBillingClient {
  constructor(
    private readonly config: ElectronicBillingConfig,
    private readonly fetcher: FetchImplementation = fetch,
    private readonly sleep: SleepImplementation = defaultSleep,
  ) {}

  private headers(idempotencyKey?: string, json = true) {
    return {
      Accept: "application/json",
      ...(json ? { "Content-Type": "application/json" } : {}),
      "X-Api-Key": this.config.apiKey,
      "X-Api-Secret": this.config.apiSecret,
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    };
  }

  private async execute(path: string, options: RequestOptions = {}) {
    const method = options.method ?? "GET";
    const retries = options.retries ?? 3;
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
      try {
        const response = await this.fetcher(`${this.config.baseUrl}/${path.replace(/^\/+/, "")}`, {
          method,
          headers: this.headers(options.idempotencyKey, options.body !== undefined),
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: controller.signal,
          cache: "no-store",
        });
        if (response.ok) return response;

        const body = await parseFailure(response);
        const retryable = response.status === 429 || response.status >= 500;
        const error = billingHttpError(response.status, body, retryable);
        if (!retryable || attempt === retries) throw error;
        await this.sleep(retryDelay(attempt, response.headers.get("retry-after")));
      } catch (error) {
        lastError = error;
        if (error instanceof ElectronicBillingError && !error.retryable) throw error;
        if (attempt === retries) {
          if (error instanceof ElectronicBillingError) throw error;
          throw new ElectronicBillingError(
            "BILLING_NETWORK_ERROR",
            error instanceof Error && error.name === "AbortError"
              ? "La API de facturación no respondió dentro del tiempo permitido."
              : "No se pudo conectar con la API de facturación.",
            502,
            true,
          );
        }
        await this.sleep(retryDelay(attempt, null));
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const response = await this.execute(path, options);
    const envelope = await response.json() as BillingApiSuccess<T> | BillingApiFailure;
    if (envelope.estado !== "exito") {
      throw billingHttpError(response.status, envelope);
    }
    return envelope.datos;
  }

  async requestRawJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const response = await this.execute(path, options);
    return response.json() as Promise<T>;
  }

  async download(path: string): Promise<BinaryDocument> {
    const response = await this.execute(path, { retries: 3 });
    const disposition = response.headers.get("content-disposition") ?? "";
    const fileName = disposition.match(/filename="?([^";]+)"?/i)?.[1];
    return {
      bytes: await response.arrayBuffer(),
      contentType: response.headers.get("content-type") ?? "application/octet-stream",
      fileName,
    };
  }

  createInvoice(payload: InvoicePayload, idempotencyKey: string) {
    return this.request<RemoteDocument>("facturas", { method: "POST", body: payload, idempotencyKey });
  }

  createInvoicesBulk(payloads: InvoicePayload[], idempotencyKey: string) {
    return this.request<{
      resumen: { total_enviadas: number; creadas: number; errores: number };
      facturas: Array<RemoteDocument & { indice: number }>;
      errores: Array<{ indice: number; mensaje: string }>;
    }>("facturas/masivo", { method: "POST", body: { facturas: payloads }, idempotencyKey });
  }

  createReceipt(payload: InvoicePayload, idempotencyKey: string) {
    return this.request<RemoteDocument>("boletas", { method: "POST", body: payload, idempotencyKey });
  }

  createCreditNote(payload: CreditOrDebitNotePayload, idempotencyKey: string) {
    return this.request<RemoteDocument>("notas-credito", { method: "POST", body: payload, idempotencyKey });
  }

  createDebitNote(payload: CreditOrDebitNotePayload, idempotencyKey: string) {
    return this.request<RemoteDocument>("notas-debito", { method: "POST", body: payload, idempotencyKey });
  }

  createSenderGuide(payload: Record<string, unknown>, idempotencyKey: string) {
    return this.request<RemoteDocument>("guias-remision", { method: "POST", body: payload, idempotencyKey });
  }

  createCarrierGuide(payload: Record<string, unknown>, idempotencyKey: string) {
    return this.request<RemoteDocument>("guias-remision-transportista", { method: "POST", body: payload, idempotencyKey });
  }

  createRetention(payload: Record<string, unknown>, idempotencyKey: string) {
    return this.request<RemoteDocument>("retenciones", { method: "POST", body: payload, idempotencyKey });
  }

  createPerception(payload: Record<string, unknown>, idempotencyKey: string) {
    return this.request<RemoteDocument>("percepciones", { method: "POST", body: payload, idempotencyKey });
  }

  createPurchaseSettlement(payload: Record<string, unknown>, idempotencyKey: string) {
    return this.request<RemoteDocument>("liquidaciones-compra", { method: "POST", body: payload, idempotencyKey });
  }

  createDailySummary(payload: Record<string, unknown>, idempotencyKey: string) {
    return this.request<RemoteDocument>("resumenes", { method: "POST", body: payload, idempotencyKey });
  }

  createVoidedDocument(payload: Record<string, unknown>, idempotencyKey: string) {
    return this.request<RemoteDocument>("anulaciones", { method: "POST", body: payload, idempotencyKey });
  }

  createReversion(payload: Record<string, unknown>, idempotencyKey: string) {
    return this.request<RemoteDocument>("reversiones", { method: "POST", body: payload, idempotencyKey });
  }

  getSeries() {
    return this.request<RemoteSeries[]>("series");
  }

  getAllSeries() {
    return this.request<RemoteSeries[]>("series?include_inactive=1");
  }

  getBranches() {
    return this.request<RemoteBranch[]>("sucursales");
  }

  createSeries(payload: Record<string, unknown>) {
    return this.request<{ creadas: RemoteSeries[]; errores?: string[] }>("series", { method: "POST", body: payload });
  }

  updateSeries(id: number, payload: Record<string, unknown>) {
    return this.request<RemoteSeries>(`series/${id}`, { method: "PUT", body: payload });
  }

  disableSeries(id: number) {
    return this.request<null>(`series/${id}`, { method: "DELETE" });
  }

  createBranch(payload: Record<string, unknown>) {
    return this.request<RemoteBranch>("sucursales", { method: "POST", body: payload });
  }

  updateBranch(id: number, payload: Record<string, unknown>) {
    return this.request<RemoteBranch>(`sucursales/${id}`, { method: "PUT", body: payload });
  }

  deleteBranch(id: number) {
    return this.request<null>(`sucursales/${id}`, { method: "DELETE" });
  }

  async getPayments(resource: string, remoteId: string): Promise<RemotePaymentSummary> {
    const path = `${resource}/${encodeURIComponent(remoteId)}/pagos`;
    if (resource === "liquidaciones-compra") return this.request<RemotePaymentSummary>(path);
    const result = await this.requestRawJson<RemotePaymentSummary & { datos?: RemotePaymentSummary["pagos"] }>(path);
    return { ...result, pagos: result.pagos ?? result.datos ?? [] };
  }

  async addPayment(resource: string, remoteId: string, payload: Record<string, unknown>): Promise<RemotePaymentSummary> {
    const path = `${resource}/${encodeURIComponent(remoteId)}/pagos`;
    if (resource === "liquidaciones-compra") return this.request<RemotePaymentSummary>(path, { method: "POST", body: payload });
    return this.requestRawJson<RemotePaymentSummary>(path, { method: "POST", body: payload });
  }

  async deletePayment(resource: string, remoteId: string, paymentId: number): Promise<RemotePaymentSummary> {
    const path = `${resource}/${encodeURIComponent(remoteId)}/pagos/${paymentId}`;
    if (resource === "liquidaciones-compra") return this.request<RemotePaymentSummary>(path, { method: "DELETE" });
    await this.requestRawJson<RemotePaymentSummary>(path, { method: "DELETE" });
    return this.getPayments(resource, remoteId);
  }

  lookupDocument(type: "1" | "6", number: string) {
    return this.request<Record<string, unknown>>(`buscar-documento?tipo=${type}&numero=${encodeURIComponent(number)}`);
  }

  consultCpe(input: { rucEmisor: string; tipoDoc: string; serie: string; correlativo: number; fechaEmision: string; monto: number }) {
    const query = new URLSearchParams({
      ruc_emisor: input.rucEmisor,
      tipo_doc: input.tipoDoc,
      serie: input.serie,
      correlativo: String(input.correlativo),
      fecha_emision: input.fechaEmision,
      monto: input.monto.toFixed(2),
    });
    return this.request<OfficialCpeResult>(`consultar-cpe?${query.toString()}`);
  }

  async getSunatMonitor(): Promise<SunatServiceMonitor> {
    const response = await this.requestRawJson<{ estado?: string; sunat?: SunatServiceMonitor }>("sunat/estado");
    if (response.estado !== "exito" || !response.sunat || !["closed", "open", "half_open"].includes(response.sunat.circuit)) {
      throw new ElectronicBillingError("BILLING_INVALID_RESPONSE", "La plataforma no devolvió un estado SUNAT válido.", 502, true);
    }
    return response.sunat;
  }

  resendDocument(resource: string, remoteId: string, action: "enviar" | "reenviar", idempotencyKey: string) {
    return this.request<RemoteDocument>(`${resource}/${encodeURIComponent(remoteId)}/${action}`, {
      method: "POST",
      body: {},
      idempotencyKey,
    });
  }

  getDocumentStatus(resource: string, remoteId: string, statusEndpoint = false) {
    const suffix = statusEndpoint ? "/estado" : "";
    return this.request<RemoteDocument>(`${resource}/${encodeURIComponent(remoteId)}${suffix}`);
  }

  getDocument(resource: string, remoteId: string) {
    return this.getDocumentStatus(resource, remoteId);
  }

  downloadArtifact(resource: string, remoteId: string, artifact: "pdf" | "xml" | "cdr", format?: BillingPdfFormat) {
    const query = artifact === "pdf" && format ? `?format=${encodeURIComponent(format)}` : "";
    return this.download(`${resource}/${encodeURIComponent(remoteId)}/${artifact}${query}`);
  }

  getFiscalReport(report: FiscalReportName, query: string) {
    return this.request<Record<string, unknown>>(`reportes/${report}?${query}`);
  }

  downloadFiscalReport(report: FiscalReportName, query: string) {
    return this.download(`reportes/${report}?${query}`);
  }
}
