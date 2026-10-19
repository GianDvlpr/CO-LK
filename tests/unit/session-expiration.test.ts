import { describe, expect, it } from "vitest";
import { SESSION_DURATION_HOURS, sessionExpiresAt } from "@/modules/auth/domain/session-expiration";

describe("vencimiento de sesión", () => {
  it("vence todas las sesiones exactamente a las ocho horas", () => {
    const start = new Date("2026-10-19T13:00:00.000Z");
    expect(SESSION_DURATION_HOURS).toBe(8);
    expect(sessionExpiresAt(start)).toEqual(new Date("2026-10-19T21:00:00.000Z"));
  });
});
