import { describe, expect, it } from "vitest";
import { validateCustomerBrand } from "@/modules/production/domain/production-brand";

describe("logo/marca del cliente en la orden de producción", () => {
  const brand = { customerId: "customer-a" };

  it("acepta una marca del cliente de los pedidos", () => {
    expect(validateCustomerBrand(brand, ["customer-a", "customer-a"])).toBeNull();
  });

  it("rechaza una marca de otro cliente", () => {
    expect(validateCustomerBrand(brand, ["customer-b"])?.code).toBe("PRODUCTION_BRAND_CUSTOMER_MISMATCH");
  });

  it("rechaza pedidos de clientes distintos", () => {
    expect(validateCustomerBrand(brand, ["customer-a", "customer-b"])?.code).toBe("PRODUCTION_BRAND_MULTIPLE_CUSTOMERS");
  });

  it("rechaza una marca sin pedidos seleccionados", () => {
    expect(validateCustomerBrand(brand, [])?.code).toBe("PRODUCTION_BRAND_WITHOUT_ORDER");
  });

  it("no valida nada cuando no se selecciona marca", () => {
    expect(validateCustomerBrand(null, [])).toBeNull();
  });
});
