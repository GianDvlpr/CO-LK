import { prisma } from "@/lib/database/prisma";

const SUNAT_URL = "https://www.sunat.gob.pe/a/txt/tipoCambio.txt";
const BCRP_BASE = "https://estadisticas.bcrp.gob.pe/estadisticas/series/api";
const BCRP_BUY_SERIES = "PD04637PD";
const BCRP_SELL_SERIES = "PD04638PD";
const DAY_MS = 86_400_000;
const months: Record<string, number> = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, set: 8, sep: 8, oct: 9, nov: 10, dic: 11 };

export class ExchangeRateError extends Error {
  constructor(message: string, public readonly status = 502) { super(message); this.name = "ExchangeRateError"; }
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10_000);
  try { const response = await fetch(url, { signal: controller.signal, cache: "no-store" }); if (!response.ok) throw new Error(`HTTP ${response.status}`); return response; }
  finally { clearTimeout(timer); }
}

async function fetchBcrpPayload(url: string) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const raw = await (await fetchWithTimeout(url)).text();
      const htmlStart = raw.indexOf("<");
      const jsonText = raw.slice(0, htmlStart >= 0 ? htmlStart : raw.length).trim();
      if (!jsonText) throw new Error("BCRP devolvió una respuesta vacía");
      const payload = JSON.parse(jsonText) as { periods?: { name: string; values: string[] }[] };
      if (!Array.isArray(payload.periods)) throw new Error("BCRP devolvió un formato inesperado");
      return payload;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw new ExchangeRateError(
    `BCRP no respondió correctamente después de 3 intentos. Intenta nuevamente en unos minutos.${lastError instanceof Error ? ` (${lastError.message})` : ""}`,
  );
}

function utcDay(value = new Date()) { return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())); }
function key(value: Date) { return value.toISOString().slice(0, 10); }
function rounded(value: number) { return Math.round(value * 1_000_000) / 1_000_000; }

async function sunatToday() {
  const text = (await (await fetchWithTimeout(SUNAT_URL)).text()).trim();
  const [dateText, buyText, sellText] = text.split("|");
  const [day, month, year] = dateText.split("/").map(Number); const buy = Number(buyText); const sell = Number(sellText);
  if (!day || !month || !year || !Number.isFinite(sell) || sell <= 0) throw new Error("SUNAT devolvió datos inválidos");
  return { date: new Date(Date.UTC(year, month - 1, day)), buy: Number.isFinite(buy) && buy > 0 ? buy : null, sell };
}

function parseBcrpDate(name: string) {
  const match = /^(\d{1,2})\.([A-Za-zÁÉÍÓÚáéíóú]{3})\.(\d{2,4})$/.exec(name.trim());
  if (!match) return null;
  let year = Number(match[3]); if (year < 100) year += 2000;
  const month = months[match[2].toLowerCase()]; const day = Number(match[1]);
  return month === undefined || !day ? null : new Date(Date.UTC(year, month, day));
}

async function bcrpSeries(series: string, from: Date, to: Date) {
  const result: { date: Date; rate: number }[] = [];
  for (let cursor = new Date(from); cursor <= to;) {
    const end = new Date(Math.min(cursor.getTime() + 60 * DAY_MS, to.getTime()));
    const payload = await fetchBcrpPayload(`${BCRP_BASE}/${series}/json/${key(cursor)}/${key(end)}`);
    for (const period of payload.periods ?? []) { const date = parseBcrpDate(period.name); const rate = Number(period.values?.[0]); if (date && Number.isFinite(rate) && rate > 0) result.push({ date, rate }); }
    cursor = new Date(end.getTime() + DAY_MS);
  }
  return result;
}

async function usdCurrency(companyId: string) {
  const currency = await prisma.currency.findUnique({ where: { companyId_code: { companyId, code: "USD" } } });
  if (!currency) throw new ExchangeRateError("No existe la moneda USD en los catálogos.", 422);
  return currency;
}

async function saveRate(currencyId: string, date: Date, sell: number, buy: number | null, source: string) {
  return prisma.exchangeRate.upsert({ where: { currencyId_rateDate: { currencyId, rateDate: utcDay(date) } }, update: { rate: rounded(sell).toString(), buyRate: buy ? rounded(buy).toString() : null, source }, create: { currencyId, rateDate: utcDay(date), rate: rounded(sell).toString(), buyRate: buy ? rounded(buy).toString() : null, source } });
}

export async function syncTodayRate(companyId: string, userId: string) {
  const currency = await usdCurrency(companyId);
  let source = "SUNAT"; let market: { date: Date; buy: number | null; sell: number } | null = null;
  try { market = await sunatToday(); } catch { /* BCRP is the controlled fallback. */ }
  if (!market) {
    source = "BCRP"; const today = utcDay(); const sellRows = await bcrpSeries(BCRP_SELL_SERIES, new Date(today.getTime() - 10 * DAY_MS), today); const last = sellRows.at(-1);
    if (!last) throw new ExchangeRateError("No se pudo obtener el tipo de cambio desde SUNAT ni BCRP.");
    market = { date: last.date, buy: null, sell: last.rate };
  }
  const saved = await saveRate(currency.id, market.date, market.sell, market.buy, source);
  await prisma.auditLog.create({ data: { companyId, userId, entity: "ExchangeRate", entityId: saved.id, action: "SYNC", afterData: { source, date: key(saved.rateDate), buyRate: saved.buyRate?.toString() ?? null, sellRate: saved.rate.toString() } } });
  return saved;
}

export async function syncRateHistory(companyId: string, userId: string, days = 90) {
  const currency = await usdCurrency(companyId); const to = utcDay(); const from = new Date(to.getTime() - days * DAY_MS);
  const [sellRows, buyRows] = await Promise.all([bcrpSeries(BCRP_SELL_SERIES, from, to), bcrpSeries(BCRP_BUY_SERIES, from, to).catch(() => [])]);
  const buys = new Map(buyRows.map((row) => [key(row.date), row.rate])); let imported = 0;
  for (const row of sellRows) { await saveRate(currency.id, row.date, row.rate, buys.get(key(row.date)) ?? null, "BCRP"); imported += 1; }
  await prisma.auditLog.create({ data: { companyId, userId, entity: "ExchangeRate", entityId: currency.id, action: "SYNC_HISTORY", afterData: { days, imported } } });
  return { days, imported };
}

export async function getExchangeRateOverview(companyId: string, days = 30) {
  const currency = await usdCurrency(companyId); const from = new Date(utcDay().getTime() - days * DAY_MS);
  const records = await prisma.exchangeRate.findMany({ where: { currencyId: currency.id, rateDate: { gte: from } }, orderBy: { rateDate: "asc" } });
  const rows = records.map((record, index) => ({ id: record.id, date: key(record.rateDate), buyRate: record.buyRate === null ? null : Number(record.buyRate), sellRate: Number(record.rate), source: record.source, variation: index ? rounded(Number(record.rate) - Number(records[index - 1].rate)) : null })).reverse();
  const values = records.map((record) => Number(record.rate));
  return { current: rows[0] ?? null, rows, stats: { min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null, average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null } };
}
