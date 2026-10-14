import { describe, expect, it } from "vitest";
import { notificationContent, notificationTypesForPermissions, retryDelayMilliseconds } from "@/modules/notifications/domain/notification-content";
import { authorizedRealtimeChannels, channelForEvent } from "@/lib/pusher/channels";

describe("contenido y reintentos de notificaciones", () => {
  it("genera avisos para eventos operativos", () => {
    expect(notificationContent("purchase.approved.v1")?.title).toBe("Compra aprobada");
    expect(notificationContent("production.complete.v1")?.type).toBe("PRODUCTION_COMPLETED");
    expect(notificationContent("product.image-added.v1")).toBeNull();
  });

  it("aplica backoff exponencial con tope de un minuto", () => {
    expect(retryDelayMilliseconds(1)).toBe(1_000);
    expect(retryDelayMilliseconds(4)).toBe(8_000);
    expect(retryDelayMilliseconds(20)).toBe(60_000);
  });

  it("aísla canales y avisos según permisos", () => {
    expect(channelForEvent("company-1", "purchase.approved.v1")).toBe("private-company-company-1-purchases");
    expect(authorizedRealtimeChannels("company-1", ["inventory.read", "orders.read"])).toEqual([
      "private-company-company-1-inventory",
      "private-company-company-1-orders",
    ]);
    expect(notificationTypesForPermissions(["orders.read"])).toEqual(["ORDER_CONFIRMED", "ORDER_DISPATCHED"]);
  });
});
