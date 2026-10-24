import { describe, expect, it } from "vitest";
import { normalizeDefaultPresentation, presentationBreakdown } from "@/modules/inventory/domain/default-presentation";

describe("presentación predeterminada de almacén", () => {
  it("normaliza una presentación completa", () => {
    expect(normalizeDefaultPresentation(" bolsa ", "50")).toEqual({ defaultPresentationType: "BOLSA", defaultPresentationContent: "50" });
  });

  it("permite omitir ambos campos y rechaza datos incompletos", () => {
    expect(normalizeDefaultPresentation("", null)).toEqual({ defaultPresentationType: null, defaultPresentationContent: null });
    expect(() => normalizeDefaultPresentation("BOLSA", null)).toThrow("deben informarse juntos");
    expect(() => normalizeDefaultPresentation("", 50)).toThrow("deben informarse juntos");
    expect(() => normalizeDefaultPresentation("BOLSA", 0)).toThrow("mayor que cero");
  });

  it("calcula envases completos y remanente sin alterar el stock", () => {
    expect(presentationBreakdown(170, "BOLSA", 50, "KG")).toBe("3 bolsas completas + 20 KG remanentes");
    expect(presentationBreakdown(100, "SACO", 50, "KG")).toBe("2 sacos completos");
  });
});
