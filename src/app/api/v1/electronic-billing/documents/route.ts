import { prisma } from "@/lib/database/prisma";
import { readServerEnv } from "@/lib/env/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { knownElectronicBillingError } from "@/modules/electronic-billing/application/electronic-billing-http";
import { createStandaloneElectronicDocument } from "@/modules/electronic-billing/application/electronic-document-service";
import { createElectronicDocumentSchema } from "@/modules/electronic-billing/application/schemas";

export async function GET(request: Request) {
  try {
    const user = await requirePermission("sales.read");
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind");
    const status = url.searchParams.get("status");
    const items = await prisma.electronicDocument.findMany({
      where: {
        companyId: user.companyId,
        ...(kind ? { kind: kind as never } : {}),
        ...(status ? { status: status as never } : {}),
      },
      include: {
        sale: { select: { id: true, number: true, customer: { select: { name: true } } } },
        createdBy: { select: { name: true, username: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 250,
    });
    const env = readServerEnv();
    const company = await prisma.company.findUnique({ where: { id: user.companyId }, select: { taxId: true } });
    return apiSuccess({
      items,
      configuration: {
        enabled: Boolean(env.SUNAT_BILLING_API_KEY && env.SUNAT_BILLING_API_SECRET && company?.taxId === env.SUNAT_BILLING_COMPANY_RUC),
        companyRuc: env.SUNAT_BILLING_COMPANY_RUC ?? null,
        series: {
          invoice: env.SUNAT_BILLING_INVOICE_SERIES,
          receipt: env.SUNAT_BILLING_RECEIPT_SERIES ?? null,
          creditNote: env.SUNAT_BILLING_CREDIT_NOTE_SERIES ?? null,
          debitNote: env.SUNAT_BILLING_DEBIT_NOTE_SERIES ?? null,
          senderGuide: env.SUNAT_BILLING_SENDER_GUIDE_SERIES ?? null,
          carrierGuide: env.SUNAT_BILLING_CARRIER_GUIDE_SERIES ?? null,
          retention: env.SUNAT_BILLING_RETENTION_SERIES ?? null,
          perception: env.SUNAT_BILLING_PERCEPTION_SERIES ?? null,
          purchaseSettlement: env.SUNAT_BILLING_PURCHASE_SETTLEMENT_SERIES ?? null,
        },
      },
    });
  } catch (error) {
    const response = knownElectronicBillingError(error);
    if (response) return response;
    throw error;
  }
}

export async function POST(request: Request) {
  try { requireSameOrigin(request); } catch (error) { const response = knownElectronicBillingError(error); if (response) return response; throw error; }
  const parsed = createElectronicDocumentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const fields = Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join("."), issue.message]));
    return apiError("VALIDATION_ERROR", "El documento contiene datos inválidos.", 400, fields);
  }
  try {
    const user = await requirePermission("sales.issue");
    return apiSuccess(await createStandaloneElectronicDocument(prisma, { companyId: user.companyId, userId: user.id, input: parsed.data }), 201);
  } catch (error) {
    const response = knownElectronicBillingError(error);
    if (response) return response;
    throw error;
  }
}
