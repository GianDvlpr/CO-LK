import Decimal from "decimal.js";

const BLANK_VALUES = new Set(["", "-", "—", "–", "N/A", "NA", "N.A."]);

export function isBlankNumericCell(value: string | null | undefined): boolean {
  return BLANK_VALUES.has((value ?? "").trim().toUpperCase());
}

export function isNumericCell(value: string | null | undefined): boolean {
  if (isBlankNumericCell(value)) return true;
  try {
    return new Decimal((value ?? "").trim()).isFinite();
  } catch {
    return false;
  }
}
