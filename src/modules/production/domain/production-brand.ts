export type CustomerBrandIssue = { code: string; message: string } | null;

export function validateCustomerBrand(
  brand: { customerId: string } | null | undefined,
  salesOrderCustomerIds: string[],
): CustomerBrandIssue {
  if (!brand) return null;
  const customers = [...new Set(salesOrderCustomerIds)];
  if (customers.length === 0) return { code: "PRODUCTION_BRAND_WITHOUT_ORDER", message: "Selecciona un pedido del cliente para usar un logo/marca registrado." };
  if (customers.length > 1) return { code: "PRODUCTION_BRAND_MULTIPLE_CUSTOMERS", message: "Los pedidos seleccionados deben ser del mismo cliente para usar un logo/marca registrado." };
  if (customers[0] !== brand.customerId) return { code: "PRODUCTION_BRAND_CUSTOMER_MISMATCH", message: "El logo/marca no pertenece al cliente de los pedidos seleccionados." };
  return null;
}

export function customerBrandName(brand: { name: string } | null | undefined) {
  return brand?.name ?? null;
}
