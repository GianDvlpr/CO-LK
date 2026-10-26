import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { ensureDailyExchangeRateForCompany, limaDayWindow } from "@/modules/exchange-rates/application/exchange-rate-service";

vi.mock("@/lib/database/prisma", () => ({ prisma: {} }));

describe("daily exchange-rate synchronization after login", () => {
  it("calcula el día operativo con la zona horaria de Lima", () => {
    const window = limaDayWindow(new Date("2026-10-27T03:30:00.000Z"));
    expect(window.key).toBe("2026-10-26");
    expect(window.start.toISOString()).toBe("2026-10-26T05:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-10-27T05:00:00.000Z");
  });

  it("sincroniza cuando todavía no existe una ejecución exitosa del día", async () => {
    const transaction = {
      $executeRaw: vi.fn(async () => 1),
      auditLog: { findFirst: vi.fn(async () => null) },
    };
    const database = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)),
    } as unknown as PrismaClient;
    const synchronize = vi.fn(async () => ({ rateDate: new Date("2026-10-26T00:00:00.000Z") }));

    const result = await ensureDailyExchangeRateForCompany(database, {
      companyId: "company-1", userId: "user-1", now: new Date("2026-10-26T20:00:00.000Z"),
    }, synchronize);

    expect(result).toEqual({ status: "SYNCED", day: "2026-10-26", rateDate: "2026-10-26" });
    expect(transaction.$executeRaw).toHaveBeenCalledOnce();
    expect(synchronize).toHaveBeenCalledOnce();
  });

  it("omite la consulta cuando cualquier sincronización del día ya terminó", async () => {
    const transaction = {
      $executeRaw: vi.fn(async () => 1),
      auditLog: { findFirst: vi.fn(async () => ({ id: "audit-1" })) },
    };
    const database = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)),
    } as unknown as PrismaClient;
    const synchronize = vi.fn();

    const result = await ensureDailyExchangeRateForCompany(database, {
      companyId: "company-1", userId: "user-1", now: new Date("2026-10-26T21:00:00.000Z"),
    }, synchronize);

    expect(result).toEqual({ status: "ALREADY_SYNCED", day: "2026-10-26" });
    expect(synchronize).not.toHaveBeenCalled();
  });
});
