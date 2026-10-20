import Decimal from "decimal.js";

export type PurchaseRequestLine = {
  itemName: string;
  supplierProductCode?: string | null;
  presentationType: string;
  presentationQuantity: Decimal.Value;
  contentPerUnit: Decimal.Value;
  receivedQuantity: Decimal.Value;
  unitSymbol: string;
  imageUrl?: string | null;
};

export type PurchaseRequestInput = {
  supplierName: string;
  lines: PurchaseRequestLine[];
};

function formatQuantity(value: Decimal.Value) {
  try {
    return new Decimal(value).toDecimalPlaces(3).toString();
  } catch {
    return String(value);
  }
}

export function normalizeWhatsAppPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 9 && digits.startsWith("9")) return `51${digits}`;
  if (digits.length === 11 && digits.startsWith("51")) return digits;
  return digits.length >= 8 ? digits : null;
}

export function buildPurchaseRequestMessage(input: PurchaseRequestInput): string {
  const lines = input.lines.map((line) => {
    const presentation = formatQuantity(line.presentationQuantity);
    const content = formatQuantity(line.contentPerUnit);
    const quantity = formatQuantity(line.receivedQuantity);
    const code = line.supplierProductCode?.trim() ? ` (${line.supplierProductCode.trim()})` : "";
    const image = line.imageUrl ? `\n  Imagen: ${line.imageUrl}` : "";
    return `• ${presentation} ${line.presentationType.trim()} de ${content} ${line.unitSymbol} — ${line.itemName}${code}: ${quantity} ${line.unitSymbol}${image}`;
  });
  return [
    `Hola ${input.supplierName.trim()}:`,
    "Somos LK INNOVACIÓN y queremos solicitarte la siguiente compra:",
    ...lines,
    "Quedamos atentos a tu confirmación.",
  ].join("\n");
}
