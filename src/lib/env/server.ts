import { z } from "zod";

const optionalSecret = z.preprocess(
  (value) => typeof value === "string" && !value.trim() ? undefined : value,
  z.string().min(1).optional(),
);
const optionalText = z.preprocess(
  (value) => typeof value === "string" && !value.trim() ? undefined : value,
  z.string().trim().min(1).optional(),
);

export const serverEnvSchema = z.object({
  DATABASE_URL: optionalSecret,
  DATABASE_URL_UNPOOLED: optionalSecret,
  SESSION_SECRET: z.string().min(32).optional(),
  SESSION_COOKIE_NAME: z.string().min(1).default("lk_innovacion_session"),
  CLOUDINARY_CLOUD_NAME: optionalSecret,
  CLOUDINARY_API_KEY: optionalSecret,
  CLOUDINARY_API_SECRET: optionalSecret,
  PUSHER_APP_ID: optionalSecret,
  PUSHER_KEY: optionalSecret,
  PUSHER_SECRET: optionalSecret,
  PUSHER_CLUSTER: optionalSecret,
  SUNAT_RUC_API_URL: z.string().url().default("https://api.apis.net.pe/v2/sunat/ruc"),
  SUNAT_DNI_API_URL: z.string().url().default("https://api.decolecta.com/v1/reniec/dni"),
  SUNAT_RUC_API_TOKEN_1: optionalSecret,
  SUNAT_RUC_API_TOKEN_2: optionalSecret,
  SUNAT_RUC_API_TOKEN: optionalSecret,
  SUNAT_BILLING_API_BASE_URL: z.string().url().default("http://127.0.0.1:8000/api/v1"),
  SUNAT_BILLING_API_KEY: optionalSecret,
  SUNAT_BILLING_API_SECRET: optionalSecret,
  SUNAT_BILLING_COMPANY_RUC: z.string().regex(/^\d{11}$/).optional(),
  SUNAT_BILLING_INVOICE_SERIES: z.string().trim().regex(/^F[A-Z0-9]{3}$/).default("F004"),
  SUNAT_BILLING_RECEIPT_SERIES: optionalText,
  SUNAT_BILLING_CREDIT_NOTE_SERIES: optionalText,
  SUNAT_BILLING_DEBIT_NOTE_SERIES: optionalText,
  SUNAT_BILLING_SENDER_GUIDE_SERIES: optionalText,
  SUNAT_BILLING_CARRIER_GUIDE_SERIES: optionalText,
  SUNAT_BILLING_RETENTION_SERIES: optionalText,
  SUNAT_BILLING_PERCEPTION_SERIES: optionalText,
  SUNAT_BILLING_PURCHASE_SETTLEMENT_SERIES: optionalText,
  SUNAT_BILLING_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(120_000).default(45_000),
  WORKER_SECRET: optionalSecret,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function readServerEnv(): ServerEnv {
  return serverEnvSchema.parse(process.env);
}

export function getEnvironmentReadiness() {
  const env = readServerEnv();
  const groups = {
    database: Boolean(env.DATABASE_URL && env.DATABASE_URL_UNPOOLED),
    session: Boolean(env.SESSION_SECRET),
    cloudinary: Boolean(
      env.CLOUDINARY_CLOUD_NAME &&
        env.CLOUDINARY_API_KEY &&
        env.CLOUDINARY_API_SECRET,
    ),
    pusher: Boolean(
      env.PUSHER_APP_ID &&
        env.PUSHER_KEY &&
        env.PUSHER_SECRET &&
        env.PUSHER_CLUSTER,
    ),
    electronicBilling: Boolean(
      env.SUNAT_BILLING_API_KEY &&
        env.SUNAT_BILLING_API_SECRET &&
        env.SUNAT_BILLING_COMPANY_RUC,
    ),
  };

  return {
    ready: groups.database && groups.session && groups.cloudinary && groups.pusher,
    groups,
  };
}
