export class PurchaseApplicationError extends Error {
  constructor(
    public readonly code:
      | "PURCHASE_NOT_FOUND"
      | "PURCHASE_INVALID_STATE"
      | "PURCHASE_INVALID_LOTS"
      | "PURCHASE_DUPLICATE_DOCUMENT"
      | "PURCHASE_INVALID_REFERENCE"
      | "PURCHASE_INVALID_LINES",
    message: string,
  ) {
    super(message);
    this.name = "PurchaseApplicationError";
  }
}
