import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildMachineParameterSheetPdf, type MachineParameterSheetDocumentData } from "@/modules/machinery/application/machine-parameter-sheet-pdf";

const sheet: MachineParameterSheetDocumentData = {
  revision: 3,
  name: "PVC negro · molde I0034",
  configurationType: "STATIC_INJECTOR",
  application: "I0034",
  material: "PVC",
  notes: "Revisar presión antes de iniciar.",
  createdAt: new Date("2026-10-20T12:00:00Z"),
  machine: { code: "MAQ-01", name: "Inyectora 1", company: { name: "LK INNOVACION" } },
  createdBy: { name: "Ana", username: "ana" },
  parameters: Array.from({ length: 60 }, (_, index) => ({
    scope: "STATION",
    station: "ST.1",
    channel: index % 2 === 0 ? "1C" : "2C",
    groupName: `Grupo ${Math.floor(index / 10) + 1}`,
    parameter: `Parámetro ${index + 1}`,
    value: String(index + 1),
    unit: "%",
    notes: null,
  })),
};

describe("ficha de parámetros A4", () => {
  it("genera un PDF A4 vertical con varias páginas cuando hay muchos parámetros", async () => {
    const pdf = await buildMachineParameterSheetPdf(sheet);
    expect(new TextDecoder().decode(pdf.slice(0, 4))).toBe("%PDF");
    const document = await PDFDocument.load(pdf);
    expect(document.getPageCount()).toBeGreaterThan(1);
    const { width, height } = document.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
  });

  it("genera una sola página para una ficha breve", async () => {
    const pdf = await buildMachineParameterSheetPdf({ ...sheet, parameters: sheet.parameters.slice(0, 4) });
    const document = await PDFDocument.load(pdf);
    expect(document.getPageCount()).toBe(1);
  });
});
