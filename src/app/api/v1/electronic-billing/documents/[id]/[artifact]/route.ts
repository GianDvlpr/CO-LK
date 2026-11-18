import { prisma } from "@/lib/database/prisma";
import { apiError } from "@/lib/http/api-response";
import { requirePermission } from "@/modules/auth/application/session-service";
import { knownElectronicBillingError } from "@/modules/electronic-billing/application/electronic-billing-http";
import { downloadElectronicArtifact } from "@/modules/electronic-billing/application/electronic-document-service";

export async function GET(request: Request, context: { params: Promise<{ id: string; artifact: string }> }) {
  try {
    const user = await requirePermission("sales.read");
    const { id, artifact } = await context.params;
    if (artifact !== "pdf" && artifact !== "xml" && artifact !== "cdr") return apiError("ARTIFACT_NOT_FOUND", "El archivo solicitado no existe.", 404);
    const format = new URL(request.url).searchParams.get("format") ?? undefined;
    const file = await downloadElectronicArtifact(prisma, user.companyId, id, artifact, format);
    return new Response(file.bytes, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${(file.fileName ?? `${artifact}-${id}`).replace(/[^A-Za-z0-9._-]/g, "_")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const response = knownElectronicBillingError(error);
    if (response) return response;
    throw error;
  }
}
