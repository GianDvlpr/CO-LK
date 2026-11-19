import type { ElectronicDocumentStatus, RemoteDocument } from "@/modules/electronic-billing/domain/types";

export function normalizeRemoteStatus(value: unknown): ElectronicDocumentStatus {
  const status = String(value ?? "").trim().toLowerCase();
  if (["aceptado", "terminado", "ok"].includes(status)) return "ACCEPTED";
  if (["aceptado_con_observacion", "aceptado con observacion", "aceptado con observación"].includes(status)) {
    return "ACCEPTED_WITH_OBSERVATION";
  }
  if (["rechazado", "terminado_errores", "error_sunat"].includes(status)) return "REJECTED";
  if (["anulado", "baja_aceptada"].includes(status)) return "VOIDED";
  if (["enviado", "encolado"].includes(status)) return "SENT";
  if (["procesando", "en_proceso", "en proceso", "98"].includes(status)) return "PROCESSING";
  if (["error", "fallido"].includes(status)) return "ERROR";
  return "PENDING";
}

export function remoteStatusValue(remote: RemoteDocument) {
  const sunat = remote.sunat;
  if (sunat && typeof sunat === "object" && "estado" in sunat) {
    return String((sunat as { estado?: unknown }).estado ?? "");
  }
  return String(remote.sunat_status ?? remote.estado_sunat ?? remote.estado ?? remote.status ?? "pendiente");
}

export function isFinalElectronicStatus(status: ElectronicDocumentStatus) {
  return ["ACCEPTED", "ACCEPTED_WITH_OBSERVATION", "REJECTED", "VOIDED"].includes(status);
}

export function nextPollingDate(attempts: number, now = new Date()) {
  const delays = [2, 5, 10, 30, 60, 120, 300, 600];
  const seconds = delays[Math.min(Math.max(attempts, 0), delays.length - 1)];
  return new Date(now.getTime() + seconds * 1_000);
}
