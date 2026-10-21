import { notFound } from "next/navigation";
import { MachineParameterPrintButton } from "@/components/machinery/machine-parameter-print-button";
import { prisma } from "@/lib/database/prisma";
import { requirePagePermission } from "@/modules/auth/application/page-authorization";

const date = new Intl.DateTimeFormat("es-PE", { dateStyle: "short", timeStyle: "short" });
const configurationLabels: Record<string, string> = {
  STATIC_INJECTOR: "Inyectora estática",
  ROTARY_INJECTOR: "Inyectora rotativa",
  CUSTOM: "Configuración personalizada",
};
const scopeLabels: Record<string, string> = { GENERAL: "General", STATION: "Estación", INJECTOR: "Inyector / canal", TEMPERATURE: "Temperatura" };

export default async function MachineParameterPrintPage({ params }: { params: Promise<{ sheetId: string }> }) {
  const user = await requirePagePermission("machinery.read");
  const { sheetId } = await params;
  const sheet = await prisma.machineParameterSheet.findFirst({
    where: { id: sheetId, machine: { companyId: user.companyId } },
    include: { machine: { include: { company: true } }, createdBy: { select: { name: true, username: true } }, parameters: { orderBy: { sortOrder: "asc" } } },
  });
  if (!sheet) notFound();

  const groups = new Map<string, typeof sheet.parameters>();
  for (const parameter of sheet.parameters) {
    const key = [parameter.scope, parameter.station ?? "", parameter.channel ?? "", parameter.groupName].join("|");
    groups.set(key, [...(groups.get(key) ?? []), parameter]);
  }

  return <main className="machine-parameter-print-page">
    <div className="print-controls"><MachineParameterPrintButton /></div>
    <header className="machine-parameter-print-header">
      <div><span>{sheet.machine.company.name}</span><h1>FICHA DE CONFIGURACIÓN DE MÁQUINA</h1></div>
      <strong>REV. {String(sheet.revision).padStart(2, "0")}</strong>
    </header>
    <section className="machine-parameter-print-info">
      <div><span>Máquina</span><strong>{sheet.machine.code} · {sheet.machine.name}</strong></div>
      <div><span>Tipo de configuración</span><strong>{configurationLabels[sheet.configurationType] ?? sheet.configurationType}</strong></div>
      <div><span>Ficha</span><strong>{sheet.name}</strong></div>
      <div><span>Aplicación / producto</span><strong>{sheet.application ?? "—"}</strong></div>
      <div><span>Material</span><strong>{sheet.material ?? "—"}</strong></div>
      <div><span>Fecha y responsable</span><strong>{date.format(sheet.createdAt)} · {sheet.createdBy.name || sheet.createdBy.username}</strong></div>
    </section>
    {Array.from(groups.entries()).map(([key, parameters]) => {
      const first = parameters[0];
      const context = [scopeLabels[first.scope] ?? first.scope, first.station, first.channel, first.groupName].filter(Boolean).join(" · ");
      return <section className="machine-parameter-print-section" key={key}>
        <h2>{context}</h2>
        <table className="machine-parameter-print-table">
          <thead><tr><th>Parámetro</th><th>Valor</th><th>Unidad</th><th>Observación</th><th>Verificado</th></tr></thead>
          <tbody>{parameters.map((parameter) => <tr key={parameter.id}><td>{parameter.parameter}</td><td className="machine-parameter-value">{parameter.value}</td><td>{parameter.unit ?? "—"}</td><td>{parameter.notes ?? ""}</td><td>□</td></tr>)}</tbody>
        </table>
      </section>;
    })}
    <section className="machine-parameter-print-notes"><span>Observaciones generales</span><p>{sheet.notes || "Sin observaciones."}</p></section>
    <footer className="machine-parameter-print-warning">Verificar la identificación de la máquina, estación, material, molde y condiciones de seguridad antes de aplicar estos valores. Esta ficha reproduce parámetros registrados por la empresa; no reemplaza el manual del fabricante ni la capacitación autorizada.</footer>
  </main>;
}
