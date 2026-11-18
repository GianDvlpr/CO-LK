import { describe, expect, it, vi } from "vitest";
import { BillingValidationError } from "@/modules/electronic-billing/application/errors";
import { ElectronicBillingClient } from "@/modules/electronic-billing/infrastructure/client";

const config = {
  baseUrl: "http://127.0.0.1:8000/api/v1",
  apiKey: "key-test",
  apiSecret: "secret-test",
  companyRuc: "20613343769",
  timeoutMs: 5_000,
  series: { invoice: "F004" },
};

const payload = {
  serie: "F004",
  fecha_emision: "2026-11-18",
  tipo_moneda: "PEN",
  forma_pago: "Contado" as const,
  cliente: { tipo_doc: "6" as const, num_doc: "20601234567", razon_social: "CLIENTE SAC" },
  items: [{ descripcion: "SUELA", unidad: "NIU", cantidad: 1, precio_unitario: 118, tip_afe_igv: "10" }],
};

describe("ElectronicBillingClient", () => {
  it("inyecta credenciales e idempotencia sin colocarlas en la URL", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      estado: "exito",
      mensaje: "Creado",
      datos: { id: 10, numero_completo: "F004-1", sunat_status: "enviado" },
    }), { status: 201, headers: { "content-type": "application/json" } }));
    const client = new ElectronicBillingClient(config, fetcher as typeof fetch, async () => undefined);

    const result = await client.createInvoice(payload, "sale-123");

    expect(result.numero_completo).toBe("F004-1");
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:8000/api/v1/facturas");
    expect(url).not.toContain("key-test");
    expect(init?.headers).toMatchObject({
      "X-Api-Key": "key-test",
      "X-Api-Secret": "secret-test",
      "Idempotency-Key": "sale-123",
    });
  });

  it("no reintenta una validación 422", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      estado: "error",
      mensaje: "La serie no existe.",
      errores: { serie: ["Serie inválida"] },
    }), { status: 422, headers: { "content-type": "application/json" } }));
    const client = new ElectronicBillingClient(config, fetcher as typeof fetch, async () => undefined);

    await expect(client.createInvoice(payload, "sale-456")).rejects.toBeInstanceOf(BillingValidationError);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("reintenta 5xx y conserva la misma clave idempotente", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ estado: "error", mensaje: "Temporal" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        estado: "exito",
        mensaje: "Creado",
        datos: { id: 11, numero_completo: "F004-2", sunat_status: "enviado" },
      }), { status: 201, headers: { "content-type": "application/json" } }));
    const client = new ElectronicBillingClient(config, fetcher as typeof fetch, async () => undefined);

    await client.createInvoice(payload, "sale-789");

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({ "Idempotency-Key": "sale-789" });
    expect(fetcher.mock.calls[1][1]?.headers).toMatchObject({ "Idempotency-Key": "sale-789" });
  });
});
