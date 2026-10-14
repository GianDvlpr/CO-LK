export class InventoryApplicationError extends Error {
  constructor(
    public readonly code: "INVENTORY_INVALID_REFERENCE" | "INVENTORY_INVALID_QUANTITY" | "INVENTORY_INVALID_LOT" | "INVENTORY_OPENING_ALREADY_EXISTS",
    message: string,
  ) {
    super(message);
    this.name = "InventoryApplicationError";
  }
}
