import Decimal from "decimal.js";
import type { InvoicePayload } from "@/modules/electronic-billing/domain/types";
import { BillingValidationError } from "@/modules/electronic-billing/application/errors";

type SaleForBilling = {
  documentType: "INVOICE" | "RECEIPT" | "SALE_NOTE" | "OTHER";
  issueDate: Date;
  dueDate: Date | null;
  exchangeRate: { toString(): string };
  discountRate: { toString(): string };
  taxRate: { toString(): string };
  paymentMethod: string;
  notes: string | null;
  customer: {
    name: string;
    taxId: string | null;
    documentType: string;
    fiscalAddress: string | null;
  };
  currency: { code: string };
  lines: Array<{
    quantity: { toString(): string };
    unitPrice: { toString(): string };
    productVariant: {
      sku: string;
      product: { name: string };
      size: { name: string };
      color: { name: string };
      secondaryColor: { name: string } | null;
    };
  }>;
};

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function documentCode(type: string, taxId: string | null) {
  if (!taxId) return "0" as const;
  if (type === "RUC") return "6" as const;
  if (type === "DNI") return "1" as const;
  if (taxId.length === 11) return "6" as const;
  if (taxId.length === 8) return "1" as const;
  return "0" as const;
}

export function mapSaleToBillingPayload(sale: SaleForBilling, series: string): InvoicePayload {
  const taxId = sale.customer.taxId?.trim() || null;
  if (sale.documentType === "INVOICE" && (!taxId || taxId.length !== 11)) {
    throw new BillingValidationError("Una factura requiere que el cliente tenga un RUC válido de 11 dígitos.");
  }
  if (sale.documentType !== "INVOICE" && sale.documentType !== "RECEIPT") {
    throw new BillingValidationError("Solo las facturas y boletas se emiten desde una venta.");
  }

  const taxRate = new Decimal(sale.taxRate.toString());
  const taxFactor = new Decimal(1).add(taxRate.div(100));
  const netBeforeDiscount = sale.lines.reduce(
    (sum, line) => sum.add(new Decimal(line.quantity.toString()).mul(line.unitPrice.toString())),
    new Decimal(0),
  );
  const discountRate = new Decimal(sale.discountRate.toString());
  const discountAmount = netBeforeDiscount.mul(discountRate).div(100).toDecimalPlaces(2);
  const total = netBeforeDiscount.sub(discountAmount).mul(taxFactor).toDecimalPlaces(2);
  const credit = sale.paymentMethod === "CREDIT" || Boolean(sale.dueDate);

  const payload: InvoicePayload = {
    serie: series,
    fecha_emision: dateOnly(sale.issueDate),
    ...(sale.dueDate ? { fecha_vencimiento: dateOnly(sale.dueDate) } : {}),
    tipo_operacion: "0101",
    tipo_moneda: sale.currency.code,
    forma_pago: credit ? "Credito" : "Contado",
    cliente: {
      tipo_doc: documentCode(sale.customer.documentType, taxId),
      num_doc: taxId ?? "-",
      razon_social: sale.customer.name,
      ...(sale.customer.fiscalAddress ? { direccion: sale.customer.fiscalAddress } : {}),
    },
    items: sale.lines.map((line) => {
      const variant = line.productVariant;
      const color = [variant.color.name, variant.secondaryColor?.name].filter(Boolean).join(" / ");
      return {
        codigo: variant.sku,
        descripcion: `${variant.product.name} - Talla ${variant.size.name} - ${color}`,
        unidad: "NIU",
        cantidad: new Decimal(line.quantity.toString()).toNumber(),
        precio_unitario: new Decimal(line.unitPrice.toString()).mul(taxFactor).toDecimalPlaces(10).toNumber(),
        tip_afe_igv: "10",
      };
    }),
    ...(sale.notes ? { observacion: sale.notes } : {}),
    enviar_automatico: true,
  };

  if (discountAmount.greaterThan(0)) {
    payload.descuentos_globales = [{ cod_tipo: "02", monto: discountAmount.toNumber() }];
  }
  if (credit) {
    if (!sale.dueDate) throw new BillingValidationError("Una venta al crédito requiere fecha de vencimiento.");
    payload.cuotas = [{ monto: total.toNumber(), fecha_pago: dateOnly(sale.dueDate) }];
  }
  return payload;
}
