import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildPickPackPdf, type PickPackDocumentData } from "@/modules/pick-pack/application/pick-pack-pdf";

function makeLine(index: number): PickPackDocumentData["lines"][number] {
  return {
    id: `line-${index}`,
    warehouseLocation: `A-${index + 1}`,
    lotCode: `LOTE-${index + 1}`,
    requestedQuantity: "10",
    pickedQuantity: "8",
    packedQuantity: "6",
    incidentType: null,
    incidentReason: null,
    notes: null,
    salesOrderLine: { productVariant: { sku: `I0034-NEG-${40 + index}`, product: { name: "Suela Urbana" }, size: { name: String(40 + index) }, color: { name: "Negro" } } },
  };
}

const record: PickPackDocumentData = {
  number: "PP-2026-000001",
  status: "PACKING",
  priority: "URGENT",
  carrier: "Transportes Lima",
  shippingDocument: "GUIA-001",
  notes: "Cuidar esquinas.",
  createdAt: new Date("2026-10-20T12:00:00Z"),
  warehouse: { code: "PRINCIPAL", name: "Almacén principal" },
  salesOrder: { number: "PED-2026-000001", requestedAt: new Date("2026-10-18T12:00:00Z"), promisedAt: new Date("2026-10-22T12:00:00Z"), customer: { name: "Cliente Demo" } },
  lines: Array.from({ length: 10 }, (_, index) => makeLine(index)),
  packages: [{ id: "package-1", packageNumber: 1, packageType: "Caja", weight: "1.5", length: "40", width: "30", height: "20", notes: null }],
};

describe("Pick & Pack A5", () => {
  it("genera un PDF A5 apaisado con páginas de continuación", async () => {
    const pdf = await buildPickPackPdf(record);
    expect(new TextDecoder().decode(pdf.slice(0, 4))).toBe("%PDF");
    const document = await PDFDocument.load(pdf);
    expect(document.getPageCount()).toBeGreaterThan(1);
    const { width, height } = document.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(420);
  });

  it("genera una sola página cuando hay pocas líneas", async () => {
    const pdf = await buildPickPackPdf({ ...record, lines: [makeLine(0)] });
    const document = await PDFDocument.load(pdf);
    expect(document.getPageCount()).toBe(1);
  });
});
