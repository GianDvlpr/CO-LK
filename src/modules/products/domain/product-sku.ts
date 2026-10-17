function segment(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeMatrixCode(value: string) {
  return segment(value);
}

export function buildProductSku(input: { matrixCode: string; primaryColorCode: string; secondaryColorCode?: string | null; sizeCode: string }) {
  return [input.matrixCode, input.primaryColorCode, input.secondaryColorCode, input.sizeCode]
    .filter((value): value is string => Boolean(value))
    .map(segment)
    .join("-");
}

export function productVariantColorLabel(primary: string, secondary?: string | null) {
  return secondary ? `${primary} / ${secondary}` : primary;
}
