import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildRecipePdf, type RecipeDocumentData } from "@/modules/recipes/application/recipe-pdf";

const recipe: RecipeDocumentData = {
  code: "REC-2026-000001",
  name: "Suela urbana negra",
  status: "ACTIVE",
  product: { code: "PROD-2026-000001", name: "Suela Urbana" },
  outputItem: null,
  versions: [{
    version: 2,
    yieldQuantity: "10",
    notes: "Versión de prueba",
    isActive: true,
    createdAt: new Date("2026-10-20T12:00:00Z"),
    ingredients: Array.from({ length: 6 }, (_, index) => ({
      id: `ingredient-${index}`,
      quantity: "0.5",
      item: { code: `MP-00${index}`, name: `Material ${index}`, unit: { symbol: "kg" } },
    })),
  }],
};

describe("receta A5", () => {
  it("genera un PDF A5 apaisado de una página", async () => {
    const pdf = await buildRecipePdf(recipe);
    expect(new TextDecoder().decode(pdf.slice(0, 4))).toBe("%PDF");
    const document = await PDFDocument.load(pdf);
    const { width, height } = document.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(420);
    expect(document.getPageCount()).toBe(1);
  });

  it("agrega páginas de continuación con muchos ingredientes", async () => {
    const many: RecipeDocumentData = {
      ...recipe,
      versions: [{
        ...recipe.versions[0],
        ingredients: Array.from({ length: 40 }, (_, index) => ({
          id: `ingredient-${index}`,
          quantity: "1",
          item: { code: `MP-${index}`, name: `Material ${index}`, unit: { symbol: "kg" } },
        })),
      }],
    };
    const pdf = await buildRecipePdf(many);
    const document = await PDFDocument.load(pdf);
    expect(document.getPageCount()).toBeGreaterThan(1);
  });

  it("genera una receta de almacén sin producto final", async () => {
    const inventoryRecipe: RecipeDocumentData = {
      ...recipe,
      code: "REC-2026-000002",
      name: "Mezcla de color",
      status: "INACTIVE",
      product: null,
      outputItem: { code: "INT-001", name: "Mezcla negra", unit: { symbol: "kg" } },
    };
    const pdf = await buildRecipePdf(inventoryRecipe);
    expect(new TextDecoder().decode(pdf.slice(0, 4))).toBe("%PDF");
    const document = await PDFDocument.load(pdf);
    expect(document.getPageCount()).toBe(1);
  });
});
