import Decimal from "decimal.js";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/database/prisma";
import { requirePermission } from "@/modules/auth/application/session-service";
import { PrintButton } from "@/components/pick-pack/print-button";

const date = new Intl.DateTimeFormat("es-PE", { dateStyle: "short" });

export default async function PickPackPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("pick_pack.print");
  const { id } = await params;
  const record = await prisma.pickPackOrder.findFirst({ where: { id, companyId: user.companyId }, include: { company: true, warehouse: true, picker: true, packer: true, salesOrder: { include: { customer: true } }, lines: { include: { salesOrderLine: { include: { productVariant: { include: { product: true, size: true, color: true, inventoryItem: { include: { unit: true } } } } } } }, orderBy: { salesOrderLine: { productVariant: { sku: "asc" } } } }, packages: { orderBy: { packageNumber: "asc" } } } });
  if (!record) notFound();
  const totalRequested = record.lines.reduce((sum, line) => sum.add(line.requestedQuantity.toString()), new Decimal(0));
  const totalPacked = record.lines.reduce((sum, line) => sum.add(line.packedQuantity.toString()), new Decimal(0));
  return <div className="pick-pack-print-page">
    <div className="print-controls"><PrintButton /></div>
    <header className="pick-pack-print-header"><div><span>LK INNOVACION</span><h1>ORDEN DE PICK &amp; PACK</h1></div><strong>{record.number}</strong></header>
    <section className="pick-pack-print-info">
      <div><span>Pedido</span><strong>{record.salesOrder.number}</strong></div><div><span>Cliente</span><strong>{record.salesOrder.customer.name}</strong></div><div><span>Fecha pedido</span><strong>{date.format(record.salesOrder.requestedAt)}</strong></div><div><span>Fecha prometida</span><strong>{record.salesOrder.promisedAt ? date.format(record.salesOrder.promisedAt) : "—"}</strong></div>
      <div><span>Almacén</span><strong>{record.warehouse.code} · {record.warehouse.name}</strong></div><div><span>Prioridad</span><strong>{record.priority === "URGENT" ? "URGENTE" : "NORMAL"}</strong></div><div><span>Responsable picking</span><strong>{record.picker?.name ?? "Sin asignar"}</strong></div><div><span>Responsable packing</span><strong>{record.packer?.name ?? "Sin asignar"}</strong></div>
      <div><span>Transportista</span><strong>{record.carrier ?? "—"}</strong></div><div><span>Documento / guía</span><strong>{record.shippingDocument ?? "—"}</strong></div><div><span>Estado</span><strong>{record.status}</strong></div><div><span>Fecha emisión</span><strong>{date.format(record.createdAt)}</strong></div>
    </section>
    <h2>Productos</h2>
    <div className="print-table-scroll"><table className="pick-pack-print-table"><thead><tr><th>SKU</th><th>Producto</th><th>Talla</th><th>Color</th><th>Ubicación</th><th>Lote</th><th>Solic.</th><th>Recog.</th><th>Empac.</th><th>Incidencia / observación</th><th>✓</th></tr></thead><tbody>{record.lines.map((line) => <tr key={line.id}><td>{line.salesOrderLine.productVariant.sku}</td><td>{line.salesOrderLine.productVariant.product.name}</td><td>{line.salesOrderLine.productVariant.size.name}</td><td>{line.salesOrderLine.productVariant.color.name}</td><td>{line.warehouseLocation ?? ""}</td><td>{line.lotCode ?? ""}</td><td>{new Decimal(line.requestedQuantity.toString()).toFixed(0)}</td><td>{new Decimal(line.pickedQuantity.toString()).toFixed(0)}</td><td>{new Decimal(line.packedQuantity.toString()).toFixed(0)}</td><td>{[line.incidentType, line.incidentReason, line.notes].filter(Boolean).join(" · ")}</td><td>□</td></tr>)}</tbody><tfoot><tr><td colSpan={6}>Totales</td><td>{totalRequested.toFixed(0)}</td><td></td><td>{totalPacked.toFixed(0)}</td><td colSpan={2}></td></tr></tfoot></table></div>
    <h2>Paquetes</h2>
    {record.packages.length ? <table className="pick-pack-print-table"><thead><tr><th>N.°</th><th>Tipo</th><th>Peso kg</th><th>Dimensiones cm</th><th>Observación</th></tr></thead><tbody>{record.packages.map((item) => <tr key={item.id}><td>{item.packageNumber}</td><td>{item.packageType ?? "—"}</td><td>{item.weight?.toString() ?? "—"}</td><td>{item.length && item.width && item.height ? `${item.length} × ${item.width} × ${item.height}` : "—"}</td><td>{item.notes ?? ""}</td></tr>)}</tbody></table> : <div className="pick-pack-print-empty">Sin paquetes registrados</div>}
    <section className="pick-pack-print-notes"><span>Observaciones generales</span><p>{record.notes || "Sin observaciones."}</p></section>
  </div>;
}
