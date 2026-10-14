import { describe, expect, it } from "vitest";
import { allModules } from "@/lib/config/modules";

describe("configuración de módulos", () => {
  it("mantiene rutas y claves únicas", () => {
    const keys = allModules.map((module) => module.key);
    const hrefs = allModules.map((module) => module.href);

    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("asigna un permiso y una fase válida a cada módulo", () => {
    for (const appModule of allModules) {
      expect(appModule.permission).toMatch(/^[a-z_]+\.[a-z_]+$/);
      expect(appModule.phase).toBeGreaterThanOrEqual(1);
      expect(appModule.phase).toBeLessThanOrEqual(7);
    }
  });
});
