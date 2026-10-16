import { describe, expect, it } from "vitest";
import { describeUserAgent, getEffectiveSessionEnd, getEffectiveSessionReason } from "@/modules/auth/application/session-monitoring";
import { getRequestIp, getRequestUserAgent } from "@/modules/auth/application/request-metadata";

describe("monitoreo de sesiones", () => {
  const now = new Date("2026-10-16T15:00:00.000Z");

  it("mantiene activa una sesión vigente que no fue cerrada", () => {
    const session = { endedAt: null, endReason: null, expiresAt: new Date("2026-10-16T18:00:00.000Z") };
    expect(getEffectiveSessionEnd(session, now)).toBeNull();
    expect(getEffectiveSessionReason(session, now)).toBeNull();
  });

  it("considera cerrada en su vencimiento una sesión expirada", () => {
    const expiresAt = new Date("2026-10-16T14:00:00.000Z");
    const session = { endedAt: null, endReason: null, expiresAt };
    expect(getEffectiveSessionEnd(session, now)).toEqual(expiresAt);
    expect(getEffectiveSessionReason(session, now)).toBe("EXPIRED");
  });

  it("respeta el cierre remoto registrado", () => {
    const endedAt = new Date("2026-10-16T13:30:00.000Z");
    const session = { endedAt, endReason: "REVOKED" as const, expiresAt: new Date("2026-10-17T00:00:00.000Z") };
    expect(getEffectiveSessionEnd(session, now)).toEqual(endedAt);
    expect(getEffectiveSessionReason(session, now)).toBe("REVOKED");
  });

  it("resume navegador y sistema sin exponer toda la cadena técnica", () => {
    expect(describeUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36")).toBe("Chrome · Windows");
    expect(describeUserAgent(null)).toBe("No disponible");
  });

  it("extrae la primera IP del proxy y el agente de usuario", () => {
    const request = new Request("https://lk.example/login", { headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.2", "user-agent": "Browser Test" } });
    expect(getRequestIp(request)).toBe("203.0.113.5");
    expect(getRequestUserAgent(request)).toBe("Browser Test");
  });
});
