import { describe, expect, it } from "vitest";
import { auditActionLabel, auditModuleLabel, redactAuditData } from "@/modules/audit/domain/audit-catalog";

describe("catálogo de auditoría", () => {
  it("traduce módulos y acciones para la interfaz", () => {
    expect(auditModuleLabel("pick-pack")).toBe("Pick & Pack");
    expect(auditActionLabel("ACCESS")).toBe("Ingresó al módulo");
    expect(auditActionLabel("STATUS_IN_PROGRESS")).toBe("Cambió estado a in progress");
  });

  it("oculta secretos incluso dentro de estructuras anidadas", () => {
    expect(redactAuditData({ username: "operador", password: "123456", nested: { accessToken: "abc", value: 3 } })).toEqual({ username: "operador", password: "[OCULTO]", nested: { accessToken: "[OCULTO]", value: 3 } });
  });
});
