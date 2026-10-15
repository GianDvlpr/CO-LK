import { describe, expect, it } from "vitest";
import { productionBoardColumnStatus, productionBoardTransition } from "@/modules/production/domain/production-board";

describe("transiciones del tablero de producción", () => {
  it("mapea cada movimiento al caso de uso y permiso correctos", () => {
    expect(productionBoardTransition("DRAFT", "RELEASED")).toEqual({ target: "RELEASED", action: "release", permission: "production.release" });
    expect(productionBoardTransition("RELEASED", "IN_PROGRESS")?.action).toBe("start");
    expect(productionBoardTransition("IN_PROGRESS", "COMPLETED")?.permission).toBe("production.complete");
  });

  it("impide saltos, retrocesos y reapertura de órdenes cerradas", () => {
    expect(productionBoardTransition("DRAFT", "IN_PROGRESS")).toBeNull();
    expect(productionBoardTransition("IN_PROGRESS", "RELEASED")).toBeNull();
    expect(productionBoardTransition("COMPLETED", "IN_PROGRESS")).toBeNull();
    expect(productionBoardTransition("CANCELLED", "DRAFT")).toBeNull();
  });

  it("simplifica los estados técnicos en las tres columnas visibles", () => {
    expect(productionBoardColumnStatus("DRAFT")).toBe("DRAFT");
    expect(productionBoardColumnStatus("RELEASED")).toBe("DRAFT");
    expect(productionBoardColumnStatus("IN_PROGRESS")).toBe("IN_PROGRESS");
    expect(productionBoardColumnStatus("COMPLETED")).toBe("COMPLETED");
    expect(productionBoardColumnStatus("CANCELLED")).toBeNull();
  });
});
