import { readServerEnv } from "@/lib/env/server";
import { BillingConfigurationError } from "@/modules/electronic-billing/application/errors";

export type ElectronicBillingConfig = {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
  companyRuc: string;
  timeoutMs: number;
  series: {
    invoice: string;
    receipt?: string;
    creditNote?: string;
    debitNote?: string;
    senderGuide?: string;
    carrierGuide?: string;
    retention?: string;
    perception?: string;
    purchaseSettlement?: string;
  };
};

function assertTransportSecurity(rawUrl: string) {
  const url = new URL(rawUrl);
  const local = ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !local) {
    throw new BillingConfigurationError("La API de facturación debe usar HTTPS fuera de localhost.");
  }
}

export function readElectronicBillingConfig(companyTaxId?: string | null): ElectronicBillingConfig {
  const env = readServerEnv();
  if (!env.SUNAT_BILLING_API_KEY || !env.SUNAT_BILLING_API_SECRET || !env.SUNAT_BILLING_COMPANY_RUC) {
    throw new BillingConfigurationError("Faltan la API key, el API secret o el RUC autorizado para facturación.");
  }
  if (!companyTaxId || companyTaxId !== env.SUNAT_BILLING_COMPANY_RUC) {
    throw new BillingConfigurationError("La facturación electrónica no está habilitada para esta empresa.");
  }
  assertTransportSecurity(env.SUNAT_BILLING_API_BASE_URL);

  return {
    baseUrl: env.SUNAT_BILLING_API_BASE_URL.replace(/\/+$/, ""),
    apiKey: env.SUNAT_BILLING_API_KEY,
    apiSecret: env.SUNAT_BILLING_API_SECRET,
    companyRuc: env.SUNAT_BILLING_COMPANY_RUC,
    timeoutMs: env.SUNAT_BILLING_TIMEOUT_MS,
    series: {
      invoice: env.SUNAT_BILLING_INVOICE_SERIES,
      receipt: env.SUNAT_BILLING_RECEIPT_SERIES,
      creditNote: env.SUNAT_BILLING_CREDIT_NOTE_SERIES,
      debitNote: env.SUNAT_BILLING_DEBIT_NOTE_SERIES,
      senderGuide: env.SUNAT_BILLING_SENDER_GUIDE_SERIES,
      carrierGuide: env.SUNAT_BILLING_CARRIER_GUIDE_SERIES,
      retention: env.SUNAT_BILLING_RETENTION_SERIES,
      perception: env.SUNAT_BILLING_PERCEPTION_SERIES,
      purchaseSettlement: env.SUNAT_BILLING_PURCHASE_SETTLEMENT_SERIES,
    },
  };
}

export function requireBillingSeries(series: string | undefined, label: string) {
  if (!series) {
    throw new BillingConfigurationError(`Configura la serie de ${label} antes de emitir.`);
  }
  return series.toUpperCase();
}
