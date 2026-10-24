import { describe, expect, it } from "vitest";
import { sanitizeWinAnsi } from "@/lib/pdf/winansi";

describe("sanitizeWinAnsi", () => {
  it("conserva texto español y signos compatibles con CP1252", () => {
    expect(sanitizeWinAnsi("Suela negra · 100 % — Ñandú")).toBe("Suela negra · 100 % — Ñandú");
  });

  it("reemplaza símbolos comunes por equivalentes ASCII", () => {
    expect(sanitizeWinAnsi("≥ 45 ✓")).toBe(">= 45 OK");
    expect(sanitizeWinAnsi("a → b")).toBe("a -> b");
  });

  it("reemplaza caracteres fuera de WinAnsi para no romper pdf-lib", () => {
    expect(sanitizeWinAnsi("中文 emoji 😀")).toBe("?? emoji ?");
  });

  it("convierte saltos de línea en espacios", () => {
    expect(sanitizeWinAnsi("linea1\nlinea2")).toBe("linea1 linea2");
  });
});
