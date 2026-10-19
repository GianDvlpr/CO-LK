import { describe, expect, it } from "vitest";
import { isBlankNumericCell, isNumericCell } from "@/modules/imports/domain/numeric-cell";

describe("celdas numéricas de importación", () => {
  it("trata los marcadores de vacío como celdas sin valor", () => {
    for (const value of ["", " ", "-", "—", "–", "N/A", "n.a."]) expect(isBlankNumericCell(value)).toBe(true);
  });

  it("acepta números enteros y decimales", () => {
    expect(isNumericCell("18")).toBe(true);
    expect(isNumericCell("2.45")).toBe(true);
    expect(isNumericCell("-3")).toBe(true);
    expect(isNumericCell("1e3")).toBe(true);
  });

  it("rechaza texto no numérico", () => {
    expect(isNumericCell("abc")).toBe(false);
    expect(isNumericCell("10 kg")).toBe(false);
    expect(isNumericCell("1,5")).toBe(false);
  });
});
