import { describe, expect, it } from "vitest";
import { hasValidImageSignature, isAllowedProductImageMimeType, PRODUCT_IMAGE_MAX_BYTES } from "@/lib/cloudinary/image-validation";

describe("validación de imágenes de producto", () => {
  it("acepta únicamente los MIME aprobados", () => {
    expect(isAllowedProductImageMimeType("image/jpeg")).toBe(true);
    expect(isAllowedProductImageMimeType("image/png")).toBe(true);
    expect(isAllowedProductImageMimeType("image/webp")).toBe(true);
    expect(isAllowedProductImageMimeType("image/svg+xml")).toBe(false);
  });

  it("comprueba la firma real y no solo el MIME declarado", () => {
    expect(hasValidImageSignature(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]), "image/jpeg")).toBe(true);
    expect(hasValidImageSignature(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png")).toBe(true);
    expect(hasValidImageSignature(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]), "image/webp")).toBe(true);
    expect(hasValidImageSignature(Uint8Array.from([0x3c, 0x73, 0x76, 0x67]), "image/png")).toBe(false);
  });

  it("mantiene el límite contractual de cinco megabytes", () => {
    expect(PRODUCT_IMAGE_MAX_BYTES).toBe(5_242_880);
  });
});
