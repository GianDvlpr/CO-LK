import { describe, expect, it } from "vitest";
import { buildPurchaseRequestMessage, normalizeWhatsAppPhone } from "@/modules/purchases/domain/whatsapp-request";

describe("normalización de teléfono para WhatsApp", () => {
  it("conserva números que ya incluyen el código de Perú", () => {
    expect(normalizeWhatsAppPhone("+51 988 200 101")).toBe("51988200101");
    expect(normalizeWhatsAppPhone("51988200101")).toBe("51988200101");
    expect(normalizeWhatsAppPhone("0051 988 200 101")).toBe("51988200101");
  });

  it("agrega el código 51 a los móviles peruanos de 9 dígitos", () => {
    expect(normalizeWhatsAppPhone("988 200 101")).toBe("51988200101");
    expect(normalizeWhatsAppPhone("(988) 200-101")).toBe("51988200101");
  });

  it("rechaza teléfonos ausentes o demasiado cortos", () => {
    expect(normalizeWhatsAppPhone(null)).toBeNull();
    expect(normalizeWhatsAppPhone("")).toBeNull();
    expect(normalizeWhatsAppPhone("sin teléfono")).toBeNull();
    expect(normalizeWhatsAppPhone("12345")).toBeNull();
  });
});

describe("mensaje de solicitud de compra", () => {
  it("incluye material, código del proveedor, presentación, cantidad e imagen", () => {
    const message = buildPurchaseRequestMessage({
      supplierName: "ANDINA PLAST S R L",
      lines: [{
        itemName: "EXPANSO NEGRO VAI",
        supplierProductCode: "AND-1136-NEG/VAI",
        presentationType: "SACO",
        presentationQuantity: "25.000000",
        contentPerUnit: "20.000000",
        receivedQuantity: "500.000000",
        unitSymbol: "KG",
        imageUrl: "https://res.cloudinary.com/demo/image/upload/pvc.jpg",
      }],
    });

    expect(message).toContain("Hola ANDINA PLAST S R L:");
    expect(message).toContain("• 25 SACO de 20 KG — EXPANSO NEGRO VAI (AND-1136-NEG/VAI): 500 KG");
    expect(message).toContain("Imagen: https://res.cloudinary.com/demo/image/upload/pvc.jpg");
    expect(message).not.toContain("S/");
  });

  it("omite el código y la imagen cuando no existen", () => {
    const message = buildPurchaseRequestMessage({
      supplierName: "Proveedor",
      lines: [{
        itemName: "PVC",
        supplierProductCode: null,
        presentationType: "SACO",
        presentationQuantity: 2,
        contentPerUnit: 10,
        receivedQuantity: 20,
        unitSymbol: "KG",
        imageUrl: null,
      }],
    });

    expect(message).toContain("• 2 SACO de 10 KG — PVC: 20 KG");
    expect(message).not.toContain("Imagen:");
  });
});
