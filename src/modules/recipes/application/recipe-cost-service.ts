import Decimal from "decimal.js";
import type { Prisma, PrismaClient } from "@prisma/client";
import { BASE_COST_CURRENCY, calculateRecipeCost, resolveItemUnitCost } from "@/modules/recipes/domain/recipe-cost";

type Database = PrismaClient | Prisma.TransactionClient;
export type RecipeCostItem = { id: string; referenceNetPrice: { toString(): string } | null; currency: { code: string } | null };

export async function latestCostRates(database: Database, companyId: string, currencyCodes: string[]) {
  const rates = new Map<string, Decimal>();
  for (const code of currencyCodes) {
    if (code === BASE_COST_CURRENCY) continue;
    const rate = await database.exchangeRate.findFirst({ where: { currency: { companyId, code } }, orderBy: { rateDate: "desc" }, select: { rate: true } });
    if (rate) rates.set(code, new Decimal(rate.rate.toString()));
  }
  return rates;
}

export async function resolveRecipeVersionCost(database: Database, companyId: string, items: RecipeCostItem[], ingredients: { itemId: string; quantity: Decimal.Value }[]) {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const priced = ingredients.map((ingredient) => {
    const item = itemById.get(ingredient.itemId);
    return { quantity: ingredient.quantity, unitCost: resolveItemUnitCost({ referenceNetPrice: item?.referenceNetPrice ? item.referenceNetPrice.toString() : null }), currencyCode: item?.currency?.code ?? BASE_COST_CURRENCY };
  });
  const currencyCodes = [...new Set(priced.filter((entry) => new Decimal(entry.unitCost).greaterThan(0)).map((entry) => entry.currencyCode))];
  const rates = currencyCodes.length > 1 ? await latestCostRates(database, companyId, currencyCodes) : new Map<string, Decimal>();
  return calculateRecipeCost(priced, rates);
}
