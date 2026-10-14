export type ReportPeriod = {
  from: Date;
  toExclusive: Date;
  fromText: string;
  toText: string;
};

export class ReportPeriodError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportPeriodError";
  }
}

function parseDate(value: string, field: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ReportPeriodError(`${field} debe usar el formato AAAA-MM-DD.`);
  const result = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(result.getTime()) || result.toISOString().slice(0, 10) !== value) throw new ReportPeriodError(`${field} no contiene una fecha válida.`);
  return result;
}

export function parseReportPeriod(searchParams: URLSearchParams): ReportPeriod | null {
  const fromText = searchParams.get("from")?.trim() ?? "";
  const toText = searchParams.get("to")?.trim() ?? "";
  if (!fromText && !toText) return null;
  if (!fromText || !toText) throw new ReportPeriodError("Debes indicar la fecha inicial y la fecha final.");
  const from = parseDate(fromText, "from");
  const to = parseDate(toText, "to");
  if (from > to) throw new ReportPeriodError("La fecha inicial no puede ser posterior a la fecha final.");
  const toExclusive = new Date(to);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  return { from, toExclusive, fromText, toText };
}

export function reportDateFilter(period: ReportPeriod | null) {
  return period ? { gte: period.from, lt: period.toExclusive } : undefined;
}
