const domainPermissions = {
  purchases: "purchases.read",
  inventory: "inventory.read",
  recipes: "recipes.read",
  production: "production.read",
  products: "products.read",
  orders: "orders.read",
  pick_pack: "pick_pack.read",
  calendar: "calendar.read",
  imports: "imports.read",
  catalogs: "catalogs.read",
  users: "users.read",
} as const;

export type RealtimeDomain = keyof typeof domainPermissions;

export function realtimeDomain(eventName: string): RealtimeDomain | null {
  const raw = eventName.split(".")[0];
  const aliases: Record<string, RealtimeDomain> = { purchase: "purchases", order: "orders", import: "imports", recipe: "recipes", product: "products", catalog: "catalogs", user: "users" };
  const domain = aliases[raw] ?? raw;
  return domain in domainPermissions ? domain as RealtimeDomain : null;
}

export function channelForEvent(companyId: string, eventName: string) {
  const domain = realtimeDomain(eventName);
  return domain ? `private-company-${companyId}-${domain}` : null;
}

export function authorizedRealtimeChannels(companyId: string, permissions: string[]) {
  const available = new Set(permissions);
  return Object.entries(domainPermissions)
    .filter(([, permission]) => available.has(permission))
    .map(([domain]) => `private-company-${companyId}-${domain}`);
}
