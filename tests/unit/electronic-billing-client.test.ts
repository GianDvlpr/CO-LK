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

  it("sincroniza las series activas usando las credenciales del servidor", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      estado: "exito",
      mensaje: "OK",
      datos: [{ id: 4, tipo: "Factura", tipo_documento: "01", serie: "F004", correlativo: 8, siguiente_numero: "F004-9", sucursal: null, activo: true }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const client = new ElectronicBillingClient(config, fetcher as typeof fetch, async () => undefined);

    const result = await client.getSeries();

    expect(result[0]?.siguiente_numero).toBe("F004-9");
    expect(fetcher.mock.calls[0]?.[0]).toBe("http://127.0.0.1:8000/api/v1/series");
  });

  it("reenvía un documento por la acción indicada", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      estado: "exito", mensaje: "Enviado", datos: { id: 10, sunat_status: "enviado" },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const client = new ElectronicBillingClient(config, fetcher as typeof fetch, async () => undefined);

    await client.resendDocument("facturas", "10", "reenviar", "retry-10-2");

    expect(fetcher.mock.calls[0]?.[0]).toBe("http://127.0.0.1:8000/api/v1/facturas/10/reenviar");
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
  });

  it("normaliza la respuesta no envuelta de pagos de facturas", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      datos: [{ id: 7, metodo: "transferencia", monto: 120 }], estado_pago: "parcial", monto_pagado: 120, total_documento: 300,
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const client = new ElectronicBillingClient(config, fetcher as typeof fetch, async () => undefined);

    const result = await client.getPayments("facturas", "22");

    expect(result.pagos).toEqual([{ id: 7, metodo: "transferencia", monto: 120 }]);
    expect(result.estado_pago).toBe("parcial");
  });

  it("consulta sucursales sin exponer las credenciales en la URL", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ estado: "exito", mensaje: "OK", datos: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    const client = new ElectronicBillingClient(config, fetcher as typeof fetch, async () => undefined);

    await client.getBranches();

    expect(fetcher.mock.calls[0]?.[0]).toBe("http://127.0.0.1:8000/api/v1/sucursales");
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({ "X-Api-Key": "key-test", "X-Api-Secret": "secret-test" });
  });
});
