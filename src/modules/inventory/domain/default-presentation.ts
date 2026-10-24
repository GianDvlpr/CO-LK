import Decimal from "decimal.js";

export type DefaultPresentationValues = {
  defaultPresentationType: string | null;
  defaultPresentationContent: string | null;
};

function hasValue(value: unknown) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

export function normalizeDefaultPresentation(type: unknown, content: Decimal.Value | null | undefined): DefaultPresentationValues {
  const normalizedType = typeof type === "string" ? type.trim().toUpperCase() : "";
  const hasType = Boolean(normalizedType);
  const hasContent = hasValue(content);
  if (!hasType && !hasContent) return { defaultPresentationType: null, defaultPresentationContent: null };
  if (!hasType || !hasContent) throw new Error("La presentación y su contenido deben informarse juntos.");
  if (normalizedType.length > 50) throw new Error("El tipo de presentación no puede superar 50 caracteres.");
  const normalizedContent = new Decimal(content!);
  if (!normalizedContent.isFinite() || normalizedContent.lte(0)) throw new Error("El contenido por presentación debe ser mayor que cero.");
  return { defaultPresentationType: normalizedType, defaultPresentationContent: normalizedContent.toDecimalPlaces(6).toString() };
}

const presentationPlurals: Record<string, string> = {
  BOLSA: "bolsas",
  SACO: "sacos",
  BOTELLA: "botellas",
  CILINDRO: "cilindros",
  TAMBOR: "tambores",
  BIDON: "bidones",
  "BIDÓN": "bidones",
  CAJA: "cajas",
  PAQUETE: "paquetes",
};

const masculinePresentations = new Set(["SACO", "CILINDRO", "TAMBOR", "BIDON", "BIDÓN", "PAQUETE"]);

function formatDecimal(value: Decimal) {
  return value.toDecimalPlaces(6).toFixed().replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

export function presentationBreakdown(stock: Decimal.Value, type?: string | null, content?: Decimal.Value | null, unit = "") {
  if (!type || !hasValue(content)) return null;
  try {
    const quantity = new Decimal(stock);
    const perPackage = new Decimal(content!);
    if (!quantity.isFinite() || quantity.isNegative() || !perPackage.isFinite() || perPackage.lte(0)) return null;
    const packages = quantity.div(perPackage).floor();
    const remainder = quantity.mod(perPackage);
    const singular = type.trim().toLocaleLowerCase("es-PE");
    const plural = presentationPlurals[type.trim().toUpperCase()] ?? `${singular}s`;
    const packageLabel = packages.eq(1) ? singular : plural;
    const masculine = masculinePresentations.has(type.trim().toUpperCase());
    const completeLabel = masculine ? "completos" : "completas";
    const remainderLabel = remainder.gt(0) ? ` + ${formatDecimal(remainder)} ${unit} remanentes` : "";
    return `${formatDecimal(packages)} ${packageLabel} ${completeLabel}${remainderLabel}`;
  } catch {
    return null;
  }
}
