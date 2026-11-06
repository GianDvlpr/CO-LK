"use client";

import { ApartmentOutlined, LinkOutlined } from "@ant-design/icons";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Alert, Button, Card, Grid, Space, Tabs, Tag, Typography } from "antd";
import { useMemo, useState } from "react";

type DopSymbol = "operation" | "inspection" | "combined" | "inventory";

type DopStep = {
  id: string;
  title: string;
  module: string;
  detail: string;
  route: string;
  symbol: DopSymbol;
};

type DopNodeData = DopStep;
type DopNode = Node<DopNodeData, "dop">;

const productionSteps: DopStep[] = [
  { id: "catalogs", title: "Configurar catálogos", module: "Catálogos", detail: "Registra unidades, almacenes, monedas, proveedores, clientes, tallas y colores que utilizarán los demás módulos.", route: "/dashboard/catalogs", symbol: "operation" },
  { id: "materials", title: "Registrar materiales", module: "Almacén", detail: "Crea materias primas, insumos elaborados y mermas con su unidad base, proveedor y presentación habitual.", route: "/dashboard/inventory", symbol: "operation" },
  { id: "purchase", title: "Registrar compra", module: "Compras", detail: "Registra proveedor, documento, presentación, cantidad, precio, moneda e IGV de los materiales recibidos.", route: "/dashboard/purchases", symbol: "operation" },
  { id: "approve", title: "Revisar y aprobar", module: "Compras", detail: "Valida la recepción. Solo al aprobar se incrementa el stock y se actualiza el costo promedio del material.", route: "/dashboard/purchases", symbol: "combined" },
  { id: "material-stock", title: "Stock de materiales", module: "Almacén", detail: "Conserva la existencia disponible, reservada y valorizada, junto con todos sus movimientos de Kardex.", route: "/dashboard/inventory", symbol: "inventory" },
  { id: "recipe", title: "Definir receta", module: "Recetas", detail: "Indica ingredientes, cantidades, rendimiento y si el resultado será un producto terminado o un insumo elaborado.", route: "/dashboard/recipes", symbol: "operation" },
  { id: "availability", title: "Validar disponibilidad", module: "Producción", detail: "Comprueba que exista stock suficiente para reservar los ingredientes requeridos por la orden.", route: "/dashboard/production", symbol: "inspection" },
  { id: "execute", title: "Ejecutar producción", module: "Producción", detail: "Al iniciar consume materiales. Durante la ejecución registra máquina, turnos y avance del proceso.", route: "/dashboard/production", symbol: "operation" },
  { id: "close", title: "Controlar y finalizar", module: "Producción", detail: "Registra cantidad buena, merma real y costos productivos antes de cerrar la orden.", route: "/dashboard/production", symbol: "combined" },
  { id: "result-stock", title: "Stock del resultado", module: "Almacén / Productos", detail: "Ingresa el producto terminado o insumo elaborado con su cantidad y costo real de producción.", route: "/dashboard/inventory", symbol: "inventory" },
];

const commercialSteps: DopStep[] = [
  { id: "quotation", title: "Preparar cotización", module: "Cotizaciones", detail: "Define cliente, vigencia, productos, precios, descuentos, IGV y condiciones sin reservar stock.", route: "/dashboard/quotations", symbol: "operation" },
  { id: "quotation-review", title: "Aprobar cotización", module: "Cotizaciones", detail: "Registra la aceptación comercial antes de convertir la propuesta en un pedido operativo.", route: "/dashboard/quotations", symbol: "inspection" },
  { id: "order", title: "Crear pedido", module: "Pedidos", detail: "Genera el pedido con las variantes, cantidades y fechas acordadas con el cliente.", route: "/dashboard/orders", symbol: "operation" },
  { id: "confirm", title: "Confirmar y reservar", module: "Pedidos", detail: "Valida el pedido y reserva las existencias disponibles de producto terminado.", route: "/dashboard/orders", symbol: "combined" },
  { id: "finished-availability", title: "Validar disponibilidad", module: "Pedidos / Almacén", detail: "Determina si el pedido puede prepararse de inmediato o si el faltante debe enviarse a producción.", route: "/dashboard/orders", symbol: "inspection" },
  { id: "produce-shortage", title: "Producir faltantes", module: "Producción", detail: "Crea y ejecuta las órdenes necesarias para completar las variantes pendientes del pedido.", route: "/dashboard/production", symbol: "operation" },
  { id: "pick-pack", title: "Preparar pedido", module: "Pick & Pack", detail: "Registra cantidades recogidas, empacadas, paquetes e incidencias antes de autorizar la salida.", route: "/dashboard/pick-pack", symbol: "operation" },
  { id: "quantity-control", title: "Controlar cantidades", module: "Pick & Pack", detail: "Compara lo solicitado, recogido y empacado. Toda diferencia debe quedar explicada como incidencia.", route: "/dashboard/pick-pack", symbol: "inspection" },
  { id: "dispatch", title: "Confirmar despacho", module: "Pick & Pack", detail: "Descuenta del Kardex únicamente la cantidad realmente empacada y despachada.", route: "/dashboard/pick-pack", symbol: "combined" },
  { id: "sale", title: "Registrar venta y cobro", module: "Ventas", detail: "Consolida pedidos despachados, emite el documento comercial interno y controla pagos y saldo pendiente.", route: "/dashboard/sales", symbol: "operation" },
];

const symbolLabels: Record<DopSymbol, string> = {
  operation: "Operación",
  inspection: "Inspección",
  combined: "Operación e inspección",
  inventory: "Inventario / almacenamiento",
};

function DopNodeView({ data }: NodeProps<DopNode>) {
  return <article className="dop-node" aria-label={`${symbolLabels[data.symbol]}: ${data.title}`}>
    <Handle id="t-left" type="target" position={Position.Left} />
    <Handle id="s-left" type="source" position={Position.Left} />
    <Handle id="t-right" type="target" position={Position.Right} />
    <Handle id="s-right" type="source" position={Position.Right} />
    <Handle id="t-top" type="target" position={Position.Top} />
    <Handle id="s-top" type="source" position={Position.Top} />
    <Handle id="t-bottom" type="target" position={Position.Bottom} />
    <Handle id="s-bottom" type="source" position={Position.Bottom} />
    <span className={`dop-symbol dop-symbol-${data.symbol}`} aria-hidden="true">{data.symbol === "inventory" ? "▽" : null}</span>
    <span className="dop-node-copy">
      <strong>{data.title}</strong>
      <small>{data.module}</small>
    </span>
  </article>;
}

const nodeTypes = { dop: DopNodeView };

function layoutSteps(steps: DopStep[], compact: boolean): DopNode[] {
  const columns = compact ? 2 : 5;
  const horizontalGap = compact ? 172 : 216;
  const verticalGap = compact ? 132 : 168;
  const width = compact ? 148 : 178;

  return steps.map((step, index) => {
    const row = Math.floor(index / columns);
    const offset = index % columns;
    const column = row % 2 === 0 ? offset : columns - 1 - offset;
    return {
      id: step.id,
      type: "dop",
      position: { x: column * horizontalGap, y: row * verticalGap },
      data: step,
      draggable: false,
      selectable: true,
      style: { width },
    };
  });
}

function connectorHandles(source: DopNode, target: DopNode) {
  const dx = target.position.x - source.position.x;
  const dy = target.position.y - source.position.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0
      ? { sourceHandle: "s-right", targetHandle: "t-left" }
      : { sourceHandle: "s-left", targetHandle: "t-right" };
  }
  return dy >= 0
    ? { sourceHandle: "s-bottom", targetHandle: "t-top" }
    : { sourceHandle: "s-top", targetHandle: "t-bottom" };
}

function makeEdge(source: DopNode, target: DopNode, id: string, label?: string, dashed = false): Edge {
  return {
    id,
    source: source.id,
    target: target.id,
    ...connectorHandles(source, target),
    type: "smoothstep",
    label,
    markerEnd: { type: MarkerType.ArrowClosed },
    className: dashed ? "dop-edge dop-edge-branch" : "dop-edge",
    labelShowBg: true,
    labelBgPadding: [6, 3],
    labelBgBorderRadius: 4,
  };
}

function buildEdges(nodes: DopNode[], flow: "production" | "commercial"): Edge[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges = nodes.slice(0, -1).map((node, index) => {
    const next = nodes[index + 1];
    const label = flow === "production" && node.id === "availability"
      ? "Disponible"
      : flow === "commercial" && node.id === "finished-availability"
        ? "Faltante"
        : undefined;
    return makeEdge(node, next, `${flow}-${node.id}-${next.id}`, label);
  });

  if (flow === "production") {
    edges.push({
      ...makeEdge(byId.get("availability")!, byId.get("purchase")!, "production-shortage", "Faltante: comprar", true),
      sourceHandle: "s-top",
      targetHandle: "t-bottom",
    });
  } else {
    edges.push({
      ...makeEdge(byId.get("finished-availability")!, byId.get("pick-pack")!, "commercial-available", "Disponible", true),
      sourceHandle: "s-bottom",
      targetHandle: "t-top",
    });
  }
  return edges;
}

function DopDiagram({ steps, flow }: { steps: DopStep[]; flow: "production" | "commercial" }) {
  const screens = Grid.useBreakpoint();
  const compact = !screens.md;
  const [selectedId, setSelectedId] = useState(steps[0].id);
  const nodes = useMemo(() => layoutSteps(steps, compact), [compact, steps]);
  const edges = useMemo(() => buildEdges(nodes, flow), [flow, nodes]);
  const selected = steps.find((step) => step.id === selectedId) ?? steps[0];

  return <div className="dop-diagram">
    <div className="dop-legend" aria-label="Leyenda del DOP">
      {(Object.keys(symbolLabels) as DopSymbol[]).map((symbol) => <span key={symbol}>
        <span className={`dop-symbol dop-symbol-${symbol}`} aria-hidden="true">{symbol === "inventory" ? "▽" : null}</span>
        {symbolLabels[symbol]}
      </span>)}
    </div>
    <div className="dop-canvas" style={{ height: compact ? 680 : 390 }}>
      <ReactFlow
        key={compact ? "compact" : "wide"}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_event, node) => setSelectedId(node.id)}
        fitView
        fitViewOptions={{ padding: compact ? 0.08 : 0.12 }}
        minZoom={0.55}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="var(--line)" gap={24} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
    <div className="dop-selected-detail" aria-live="polite">
      <div>
        <Space size={8} wrap><Tag>{symbolLabels[selected.symbol]}</Tag><Typography.Text strong>{selected.title}</Typography.Text></Space>
        <Typography.Paragraph type="secondary">{selected.detail}</Typography.Paragraph>
      </div>
      <Button href={selected.route} icon={<LinkOutlined />}>Abrir {selected.module}</Button>
    </div>
  </div>;
}

export function SystemDopGuide() {
  return <Card className="section-card guide-dop-card" title={<Space><ApartmentOutlined />DOP funcional del sistema</Space>}>
    <Alert
      type="info"
      showIcon
      message="Lectura industrial adaptada al sistema"
      description="Sigue las flechas para conocer el recorrido de la información y del inventario. Selecciona una actividad para ver su función y abrir el módulo correspondiente."
    />
    <Tabs
      defaultActiveKey="production"
      items={[
        { key: "production", label: "Abastecimiento y producción", children: <DopDiagram steps={productionSteps} flow="production" /> },
        { key: "commercial", label: "Pedido, despacho y venta", children: <DopDiagram steps={commercialSteps} flow="commercial" /> },
      ]}
    />
  </Card>;
}
