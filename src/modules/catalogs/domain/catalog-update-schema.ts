import { z } from "zod";

const optionalContactText = (maxLength: number) => z.string().trim().max(maxLength).nullish().transform((value) => value ?? undefined);
const optionalCheckedAt = z.string().datetime().nullish().transform((value) => value ? new Date(value) : undefined);

export const catalogUpdateSchema = z.object({
  name: z.string().trim().min(1).max(150),
  documentType: z.enum(["DNI", "RUC"]).optional(),
  taxId: optionalContactText(30),
  email: optionalContactText(150),
  phone: optionalContactText(30),
  fiscalAddress: optionalContactText(300),
  ubigeo: optionalContactText(6),
  department: optionalContactText(100),
  province: optionalContactText(100),
  district: optionalContactText(100),
  rucStatus: optionalContactText(50),
  rucCondition: optionalContactText(50),
  sunatSource: z.literal("APIS.NET.PE").nullish().transform((value) => value ?? undefined),
  sunatCheckedAt: optionalCheckedAt,
  symbol: z.string().trim().max(20).optional(),
  decimalPlaces: z.number().int().min(0).max(6).optional(),
  isBase: z.boolean().optional(),
}).superRefine((data, context) => {
  if (!data.taxId) return;
  const documentType = data.documentType ?? (/^\d{8}$/.test(data.taxId) ? "DNI" : "RUC");
  const pattern = documentType === "DNI" ? /^\d{8}$/ : /^\d{11}$/;
  if (!pattern.test(data.taxId)) context.addIssue({ code: "custom", path: ["taxId"], message: `El ${documentType} no tiene la cantidad de dígitos correcta.` });
});
