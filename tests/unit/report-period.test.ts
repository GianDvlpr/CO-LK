import { describe, expect, it } from "vitest";
import { parseReportPeriod, reportDateFilter } from "@/modules/imports/application/report-period";

describe("report period", () => {
  it("convierte el fin del rango en un límite exclusivo del día siguiente", () => {
    const period = parseReportPeriod(new URLSearchParams("from=2026-10-01&to=2026-10-31"));
    expect(period?.from.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(reportDateFilter(period)?.lt.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("rechaza rangos incompletos o invertidos", () => {
    expect(() => parseReportPeriod(new URLSearchParams("from=2026-10-01"))).toThrow("fecha inicial y la fecha final");
    expect(() => parseReportPeriod(new URLSearchParams("from=2026-10-31&to=2026-10-01"))).toThrow("posterior");
  });
});
