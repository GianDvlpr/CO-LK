import { z } from "zod";

const optionalSecret = z.string().min(1).optional();

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
  SUNAT_RUC_API_TOKEN: optionalSecret,
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
  };

  return {
    ready: Object.values(groups).every(Boolean),
    groups,
  };
}
