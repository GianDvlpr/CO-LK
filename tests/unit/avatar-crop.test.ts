import { describe, expect, it } from "vitest";
import { clampCropOffset, coverScale, sourceCropRect } from "@/modules/users/domain/avatar-crop";

describe("recorte de foto de perfil", () => {
  it("cubre el cuadrado con una imagen horizontal", () => {
    expect(coverScale({ width: 1200, height: 800 }, 320)).toBe(0.4);
    expect(sourceCropRect({ width: 1200, height: 800 }, 320, 1, { x: 0, y: 0 })).toEqual({ x: 200, y: 0, width: 800, height: 800 });
  });

  it("limita el movimiento para que el cuadrado nunca quede vacío", () => {
    expect(clampCropOffset({ x: 999, y: -999 }, { width: 1200, height: 800 }, 320, 1)).toEqual({ x: 80, y: 0 });
  });

  it("aplica zoom alrededor del centro", () => {
    expect(sourceCropRect({ width: 1000, height: 1000 }, 300, 2, { x: 0, y: 0 })).toEqual({ x: 250, y: 250, width: 500, height: 500 });
  });
});
