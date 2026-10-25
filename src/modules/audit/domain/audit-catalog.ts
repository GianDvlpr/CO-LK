export const auditModuleLabels: Record<string, string> = {
  dashboard: "Analítica",
  purchases: "Compras",
  inventory: "Almacén",
  recipes: "Recetas",
  production: "Producción",
  machinery: "Maquinaria",
  products: "Productos",
  orders: "Pedidos",
  "pick-pack": "Pick & Pack",
  calendar: "Calendario",
  whiteboard: "Pizarra",
  catalogs: "Catálogos",
  users: "Usuarios",
  roles: "Roles y permisos",
  sessions: "Sesiones",
  imports: "Importaciones",
  audit: "Auditoría",
  guide: "Guía",
  system: "Sistema",
};

export const auditActionLabels: Record<string, string> = {
  ACCESS: "Ingresó al módulo",
  LOGIN: "Inició sesión",
  LOGOUT: "Cerró sesión",
  CREATE: "Registró datos",
  UPDATE: "Editó datos",
  DELETE: "Eliminó datos",
  ACTIVATE: "Activó registro",
  DEACTIVATE: "Inactivó registro",
  APPROVE: "Aprobó registro",
  REJECT: "Rechazó registro",
  CONFIRM: "Confirmó carga",
  PREVIEW: "Previsualizó carga",
  EXPORT: "Descargó datos",
  PRINT: "Descargó formato",
  RESET_PASSWORD: "Restableció contraseña",
  REVOKE: "Cerró sesión remota",
  OPENING_STOCK: "Registró saldo inicial",
  SYNC: "Sincronizó datos",
  SYNC_HISTORY: "Sincronizó histórico",
  RELEASE: "Liberó orden",
  START: "Inició proceso",
  COMPLETE: "Finalizó proceso",
  DISPATCH: "Despachó pedido",
};

export function auditActionLabel(action: string) {
  if (auditActionLabels[action]) return auditActionLabels[action];
  if (action.startsWith("STATUS_")) return `Cambió estado a ${action.slice(7).replaceAll("_", " ").toLowerCase()}`;
  return action.replaceAll("_", " ").toLowerCase();
}

export function auditModuleLabel(module: string | null | undefined) {
  return auditModuleLabels[module ?? "system"] ?? module ?? "Sistema";
}

const sensitiveKey = /(password|contrase(?:n|ñ)a|secret|token|authorization|cookie|hash|credential)/i;

export function redactAuditData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactAuditData);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, sensitiveKey.test(key) ? "[OCULTO]" : redactAuditData(child)]));
  }
  return value;
}
