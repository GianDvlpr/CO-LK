import { describe, expect, it } from "vitest";
import { canPrepareSalesOrder } from "@/modules/pick-pack/domain/pick-pack-creation";

describe("estados de pedido preparables en Pick & Pack", () => {
  it("acepta pedidos confirmados, en producción o listos", () => {
    expect(canPrepareSalesOrder("CONFIRMED")).toBe(true);
    expect(canPrepareSalesOrder("IN_PRODUCTION")).toBe(true);
    expect(canPrepareSalesOrder("READY")).toBe(true);
  });

  it("rechaza borradores, despachados y cancelados", () => {
    expect(canPrepareSalesOrder("DRAFT")).toBe(false);
    expect(canPrepareSalesOrder("DISPATCHED")).toBe(false);
    expect(canPrepareSalesOrder("CANCELLED")).toBe(false);
  });
});
