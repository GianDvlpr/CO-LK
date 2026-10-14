"use client";

import { AuditOutlined, CheckCircleOutlined, LinkOutlined, OrderedListOutlined } from "@ant-design/icons";
import { Alert, Card, Col, Collapse, Row, Space, Table, Tag, Timeline, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { ModuleHeadingIntro } from "@/components/common/module-heading-intro";

type FieldRow = { key: string; field: string; required: boolean; rule: string };

const inventoryFields: FieldRow[] = [
  { key: "code", field: "Código", required: false, rule: "En Excel puede dejarse vacío: el sistema genera un correlativo. Los reportes conservan el código generado." },
  { key: "name", field: "Nombre", required: true, rule: "Nombre de la materia prima o producto terminado." },
  { key: "unit", field: "Unidad de medida", required: true, rule: "Debe existir previamente en Catálogos: KG, L, UN, PAR, etc." },
];

const purchaseFields: FieldRow[] = [
  { key: "code", field: "Código", required: false, rule: "En Excel puede dejarse vacío: el sistema genera un correlativo. Los reportes conservan el código generado." },
  { key: "date", field: "Fecha de recepción", required: true, rule: "Fecha en la que se recibe físicamente la compra." },
  { key: "supplier", field: "Proveedor", required: true, rule: "Debe existir y estar activo en Catálogos." },
  { key: "document", field: "Documento / guía", required: true, rule: "No puede repetirse para el mismo proveedor y recepción." },
  { key: "lot", field: "Lote del proveedor", required: false, rule: "Opcional, salvo que la materia prima exija control de lote." },
  { key: "presentation", field: "Presentación", required: true, rule: "Tipo, cantidad y contenido. Ejemplo: 20 sacos de 10 kg." },
  { key: "received", field: "Cantidad recibida", required: true, rule: "Calculada: cantidad de presentaciones × contenido. Ejemplo: 20 × 10 = 200 kg." },
  { key: "price", field: "Precio", required: true, rule: "Precio neto por unidad base, mayor que cero." },
  { key: "tax", field: "IGV", required: true, rule: "18% por defecto; admite valores entre 0% y 100%." },
  { key: "status", field: "Estado", required: true, rule: "Pendiente al registrar; luego puede aprobarse o rechazarse." },
  { key: "final", field: "Precio final", required: true, rule: "Precio unitario con IGV = precio × (1 + IGV/100). Total = cantidad recibida × precio unitario con IGV." },
];

const fieldColumns: ColumnsType<FieldRow> = [
  { title: "Campo", dataIndex: "field", width: 180, render: (value) => <Typography.Text strong>{value}</Typography.Text> },
  { title: "Condición", dataIndex: "required", width: 110, render: (value) => <Tag color={value ? "red" : "default"}>{value ? "Obligatorio" : "Opcional"}</Tag> },
  { title: "Validación / ejemplo", dataIndex: "rule" },
];

const dependencies = [
  { key: "catalogs", label: "Catálogos", children: <p>Es la base: registra unidades de medida, almacenes, proveedores, clientes y monedas antes de operar.</p> },
  { key: "inventory", label: "Almacén", children: <p>Necesita unidades y almacenes de Catálogos. Aquí se crean las materias primas y los productos terminados que tendrán stock.</p> },
  { key: "products", label: "Productos", children: <p>Necesita unidades, tallas y colores. Cada variante genera o vincula un ítem de producto terminado en Almacén.</p> },
  { key: "purchases", label: "Compras", children: <p>Necesita proveedor, moneda, almacén y materias primas previamente registradas. Solo una compra aprobada incrementa el stock.</p> },
  { key: "recipes", label: "Recetas", children: <p>Necesita un producto y materias primas del Almacén. Crear o activar una receta no descuenta stock.</p> },
  { key: "production", label: "Producción", children: <p>Necesita una variante de producto, una receta activa, un almacén y stock suficiente. Al iniciar consume materiales; al completar ingresa producto terminado.</p> },
  { key: "orders", label: "Pedidos", children: <p>Necesita un cliente y variantes de Productos. Al confirmar reserva stock de producto terminado y al despachar registra la salida del kardex.</p> },
];

export function OperationsGuide() {
  return (
    <>
      <div className="page-heading">
        <ModuleHeadingIntro title="Guía de operación" eyebrow="Ayuda" description="Consulta el orden recomendado, las dependencias entre módulos y los campos obligatorios antes de registrar información." />
      </div>

      <Alert type="info" showIcon message="Orden recomendado para iniciar" description="Configura primero Catálogos y Almacén; después Productos, Compras y Recetas; finalmente Producción y Pedidos." style={{ marginBottom: 18 }} />
      <Alert type="success" showIcon message="Códigos automáticos en Excel" description="Usa referencia_carga para relacionar las hojas. Al crear registros puedes dejar vacío el código oficial; el sistema lo genera. Si vuelves a subir un reporte, los códigos descargados permiten omitir los registros existentes y agregar solo los nuevos." style={{ marginBottom: 18 }} />

      <Row gutter={[18, 18]}>
        <Col xs={24} lg={10}>
          <Card className="section-card" title={<Space><OrderedListOutlined />Flujo inicial</Space>}>
            <Timeline items={[
              { color: "green", children: <><strong>1. Catálogos</strong><br />Unidades, almacenes, proveedores, clientes y monedas.</> },
              { color: "green", children: <><strong>2. Almacén y Productos</strong><br />Materias primas, productos terminados, tallas, colores y SKU.</> },
              { color: "green", children: <><strong>3. Compras</strong><br />Registra y aprueba recepciones para alimentar el stock.</> },
              { color: "green", children: <><strong>4. Recetas</strong><br />Vincula productos con las materias primas requeridas.</> },
              { color: "green", children: <><strong>5. Producción y Pedidos</strong><br />Consume materiales, produce y atiende pedidos.</> },
            ]} />
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card className="section-card" title={<Space><LinkOutlined />Dependencias por módulo</Space>}>
            <Collapse items={dependencies} defaultActiveKey={["purchases", "recipes", "orders"]} />
          </Card>
        </Col>
      </Row>

      <Card className="section-card guide-fields-card" title={<Space><AuditOutlined />Puesta en marcha del stock</Space>}>
        <Alert
          type="warning"
          showIcon
          message="No cargues cantidades antiguas si ya hubo consumo"
          description="Registra los ítems con stock cero y utiliza como saldo inicial únicamente la cantidad que resulte del conteo o pesaje físico actual."
          style={{ marginBottom: 18 }}
        />
        <Timeline items={[
          { color: "green", children: <><strong>1. Registra el catálogo en cero</strong><br />Crea materias primas, insumos y productos terminados sin inventar existencias.</> },
          { color: "green", children: <><strong>2. Define una fecha de corte</strong><br />Realiza el conteo o pesaje físico y evita movimientos mientras termina el levantamiento.</> },
          { color: "green", children: <><strong>3. Registra el saldo verificado</strong><br />En Almacén abre Más acciones → Registrar saldo inicial. Indica almacén, cantidad, costo y lote cuando corresponda.</> },
          { color: "green", children: <><strong>4. Revisa el kardex</strong><br />Confirma que cada ítem tenga la cantidad y valoración correctas antes de iniciar Compras y Producción.</> },
          { color: "blue", children: <><strong>5. Continúa con la operación normal</strong><br />Desde la fecha de corte, el stock cambia mediante compras aprobadas, consumos y terminaciones de producción.</> },
        ]} />
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          El saldo inicial se usa una sola vez por existencia. No sirve para corregir diferencias posteriores y será rechazado si el ítem o lote ya tiene movimientos.
        </Typography.Paragraph>
      </Card>

      <Card className="section-card guide-fields-card" title={<Space><CheckCircleOutlined />Campos obligatorios de Almacén</Space>}>
        <Table rowKey="key" size="small" columns={fieldColumns} dataSource={inventoryFields} pagination={false} scroll={{ x: 620 }} />
      </Card>
      <Card className="section-card guide-fields-card" title={<Space><CheckCircleOutlined />Campos de Compras</Space>}>
        <Table rowKey="key" size="small" columns={fieldColumns} dataSource={purchaseFields} pagination={false} scroll={{ x: 700 }} />
      </Card>
    </>
  );
}
