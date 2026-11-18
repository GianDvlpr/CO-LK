"use client";

import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Divider, Form, Input, InputNumber, Select, Space, Typography } from "antd";
import dayjs from "dayjs";

export type ElectronicDocumentKind = "CREDIT_NOTE" | "DEBIT_NOTE" | "SENDER_GUIDE" | "CARRIER_GUIDE" | "RETENTION" | "PERCEPTION" | "PURCHASE_SETTLEMENT" | "DAILY_SUMMARY" | "VOIDED_DOCUMENT" | "REVERSION";

const required = [{ required: true, message: "Este campo es obligatorio." }];
const documentTypes = [
  { value: "6", label: "RUC" },
  { value: "1", label: "DNI" },
  { value: "4", label: "Carné de extranjería" },
  { value: "7", label: "Pasaporte" },
  { value: "0", label: "Sin documento" },
];
const currencies = [{ value: "PEN", label: "PEN · Soles" }, { value: "USD", label: "USD · Dólares" }];
const units = [
  { value: "NIU", label: "NIU · Unidad" },
  { value: "KGM", label: "KGM · Kilogramo" },
  { value: "ZZ", label: "ZZ · Servicio" },
];

export function electronicDocumentInitialValues(kind: ElectronicDocumentKind) {
  const today = dayjs().format("YYYY-MM-DD");
  const party = { tipo_doc: "6", num_doc: "", razon_social: "", direccion: "" };
  switch (kind) {
    case "CREDIT_NOTE":
      return { fecha_emision: today, doc_afectado_tipo: "01", doc_afectado_serie: "F004", cod_motivo: "01", tipo_moneda: "PEN", cliente: { ...party }, items: [{ unidad: "NIU", cantidad: 1, tip_afe_igv: "10" }] };
    case "DEBIT_NOTE":
      return { fecha_emision: today, doc_afectado_tipo: "01", doc_afectado_serie: "F004", cod_motivo: "01", tipo_moneda: "PEN", cliente: { ...party }, items: [{ unidad: "NIU", cantidad: 1, tip_afe_igv: "10" }] };
    case "SENDER_GUIDE":
      return { fecha_emision: today, fecha_traslado: today, destinatario: { ...party }, cod_traslado: "01", mod_traslado: "02", und_peso_total: "KGM", vehiculo: {}, conductor: { tipo: "Principal", tipo_doc: "1" }, items: [{ unidad: "NIU", cantidad: 1 }] };
    case "CARRIER_GUIDE":
      return { fecha_emision: today, fecha_traslado: today, remitente: { ...party }, destinatario: { ...party }, doc_relacionado: { tipo_codigo: "09" }, cod_traslado: "01", mod_traslado: "01", und_peso_total: "KGM", vehiculo: {}, conductor: [{ tipo_doc: "1" }], items: [{ unidad: "NIU", cantidad: 1 }] };
    case "RETENTION":
      return { fecha_emision: today, cod_local: "0000", regimen: "01", tasa: 3, proveedor: { ...party }, documentos: [{ tipo_doc: "01", moneda: "PEN", fecha_emision: today, fecha_retencion: today, pagos: [{ moneda: "PEN", fecha: today }] }] };
    case "PERCEPTION":
      return { fecha_emision: today, cod_local: "0000", regimen: "01", tasa: 2, cliente: { ...party }, documentos: [{ tipo_doc: "01", moneda: "PEN", fecha_emision: today, fecha_percepcion: today, cobros: [{ fecha: today }] }] };
    case "PURCHASE_SETTLEMENT":
      return { fecha_emision: today, tipo_operacion: "0501", vendedor: { tipo_doc: "1", tipo_domicilio: "01" }, lugar: { tipo: "01" }, items: [{ unidad: "KGM", cantidad: 1, tip_afe_igv: "10" }] };
    case "DAILY_SUMMARY":
      return { fecha_resumen: today, anular: [] };
    case "VOIDED_DOCUMENT":
      return { fecha_generacion: today, fecha_comunicacion: today, detalles: [{ tipo_documento: "01", serie: "F004" }] };
    case "REVERSION":
      return { fecha_generacion: today, fecha_comunicacion: today, detalles: [{ tipo_documento: "20" }] };
  }
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <section><Divider titlePlacement="start" plain><Typography.Text strong>{title}</Typography.Text></Divider>{description ? <Typography.Paragraph type="secondary">{description}</Typography.Paragraph> : null}{children}</section>;
}

function PartyFields({ prefix, title, includeAddress = true }: { prefix: string; title: string; includeAddress?: boolean }) {
  return <Section title={title}><div className="purchase-form-grid">
    <Form.Item name={[prefix, "tipo_doc"]} label="Tipo de documento" rules={required}><Select options={documentTypes} /></Form.Item>
    <Form.Item name={[prefix, "num_doc"]} label="Número de documento" rules={required}><Input maxLength={20} /></Form.Item>
    <Form.Item name={[prefix, "razon_social"]} label="Razón social o nombres" rules={required}><Input maxLength={250} /></Form.Item>
    {includeAddress ? <Form.Item name={[prefix, "direccion"]} label="Dirección"><Input maxLength={500} /></Form.Item> : null}
  </div></Section>;
}

function RouteFields({ onModeChange }: { onModeChange?: (mode: "01" | "02") => void } = {}) {
  return <>
    <Section title="Traslado"><div className="purchase-form-grid">
      <Form.Item name="fecha_emision" label="Fecha de emisión" rules={required}><Input type="date" /></Form.Item>
      <Form.Item name="fecha_traslado" label="Inicio del traslado" rules={required}><Input type="date" /></Form.Item>
      <Form.Item name="cod_traslado" label="Motivo del traslado" rules={required}><Select options={[
        { value: "01", label: "Venta" }, { value: "02", label: "Compra" }, { value: "04", label: "Traslado entre establecimientos" },
        { value: "08", label: "Importación" }, { value: "09", label: "Exportación" }, { value: "13", label: "Otros" },
      ]} /></Form.Item>
      <Form.Item name="mod_traslado" label="Modalidad" rules={required}><Select onChange={onModeChange} options={[{ value: "01", label: "Transporte público" }, { value: "02", label: "Transporte privado" }]} /></Form.Item>
      <Form.Item name="peso_total" label="Peso total" rules={required}><InputNumber min={0.001} precision={3} style={{ width: "100%" }} /></Form.Item>
      <Form.Item name="und_peso_total" label="Unidad de peso" rules={required}><Select options={[{ value: "KGM", label: "Kilogramos" }, { value: "TNE", label: "Toneladas" }]} /></Form.Item>
      <Form.Item name="num_bultos" label="Número de bultos"><InputNumber min={1} precision={0} style={{ width: "100%" }} /></Form.Item>
    </div></Section>
    <Section title="Punto de partida y llegada"><div className="purchase-form-grid">
      <Form.Item name="partida_ubigeo" label="Ubigeo de partida" rules={[...required, { pattern: /^\d{6}$/, message: "Debe tener 6 dígitos." }]}><Input maxLength={6} /></Form.Item>
      <Form.Item name="partida_direccion" label="Dirección de partida" rules={required}><Input maxLength={500} /></Form.Item>
      <Form.Item name="llegada_ubigeo" label="Ubigeo de llegada" rules={[...required, { pattern: /^\d{6}$/, message: "Debe tener 6 dígitos." }]}><Input maxLength={6} /></Form.Item>
      <Form.Item name="llegada_direccion" label="Dirección de llegada" rules={required}><Input maxLength={500} /></Form.Item>
    </div></Section>
  </>;
}

function GuideItems() {
  return <Section title="Bienes transportados"><Form.List name="items">{(fields, { add, remove }) => <Space direction="vertical" style={{ width: "100%" }}>
    {fields.map((field, index) => <Card size="small" key={field.key} title={`Bien ${index + 1}`} extra={fields.length > 1 ? <Button danger type="text" icon={<DeleteOutlined />} onClick={() => remove(field.name)}>Quitar</Button> : null}><div className="purchase-form-grid">
      <Form.Item name={[field.name, "codigo"]} label="Código"><Input /></Form.Item>
      <Form.Item name={[field.name, "descripcion"]} label="Descripción" rules={required}><Input /></Form.Item>
      <Form.Item name={[field.name, "cantidad"]} label="Cantidad" rules={required}><InputNumber min={0.001} precision={3} style={{ width: "100%" }} /></Form.Item>
      <Form.Item name={[field.name, "unidad"]} label="Unidad" rules={required}><Select options={units} /></Form.Item>
    </div></Card>)}
    <Button icon={<PlusOutlined />} onClick={() => add({ unidad: "NIU", cantidad: 1 })}>Agregar bien</Button>
  </Space>}</Form.List></Section>;
}

function BillingItems() {
  return <Section title="Conceptos del documento" description="El precio unitario debe incluir IGV."><Form.List name="items">{(fields, { add, remove }) => <Space direction="vertical" style={{ width: "100%" }}>
    {fields.map((field, index) => <Card size="small" key={field.key} title={`Concepto ${index + 1}`} extra={fields.length > 1 ? <Button danger type="text" icon={<DeleteOutlined />} onClick={() => remove(field.name)}>Quitar</Button> : null}><div className="purchase-form-grid">
      <Form.Item name={[field.name, "codigo"]} label="Código"><Input /></Form.Item>
      <Form.Item name={[field.name, "descripcion"]} label="Descripción" rules={required}><Input /></Form.Item>
      <Form.Item name={[field.name, "cantidad"]} label="Cantidad" rules={required}><InputNumber min={0.001} precision={3} style={{ width: "100%" }} /></Form.Item>
      <Form.Item name={[field.name, "unidad"]} label="Unidad" rules={required}><Select options={units} /></Form.Item>
      <Form.Item name={[field.name, "precio_unitario"]} label="Precio unitario con IGV" rules={required}><InputNumber min={0.01} precision={4} style={{ width: "100%" }} /></Form.Item>
      <Form.Item name={[field.name, "tip_afe_igv"]} label="Afectación IGV" rules={required}><Select options={[{ value: "10", label: "Gravado" }, { value: "20", label: "Exonerado" }, { value: "30", label: "Inafecto" }, { value: "40", label: "Exportación" }]} /></Form.Item>
    </div></Card>)}
    <Button icon={<PlusOutlined />} onClick={() => add({ unidad: "NIU", cantidad: 1, tip_afe_igv: "10" })}>Agregar concepto</Button>
  </Space>}</Form.List></Section>;
}

function NoteFields({ kind }: { kind: "CREDIT_NOTE" | "DEBIT_NOTE" }) {
  const motives = kind === "CREDIT_NOTE"
    ? [{ value: "01", label: "Anulación de la operación" }, { value: "02", label: "Anulación por error en RUC" }, { value: "06", label: "Devolución total" }, { value: "07", label: "Devolución parcial" }, { value: "09", label: "Disminución en el valor" }]
    : [{ value: "01", label: "Intereses por mora" }, { value: "02", label: "Aumento en el valor" }, { value: "03", label: "Penalidades u otros conceptos" }];
  return <>
    <Section title="Documento afectado"><div className="purchase-form-grid">
      <Form.Item name="fecha_emision" label="Fecha de emisión" rules={required}><Input type="date" /></Form.Item>
      <Form.Item name="doc_afectado_tipo" label="Tipo de comprobante" rules={required}><Select options={[{ value: "01", label: "Factura" }, { value: "03", label: "Boleta" }]} /></Form.Item>
      <Form.Item name="doc_afectado_serie" label="Serie afectada" rules={required}><Input placeholder="F004" /></Form.Item>
      <Form.Item name="doc_afectado_correlativo" label="Correlativo afectado" rules={required}><Input placeholder="123" /></Form.Item>
      <Form.Item name="cod_motivo" label="Motivo" rules={required}><Select options={motives} /></Form.Item>
      <Form.Item name="tipo_moneda" label="Moneda" rules={required}><Select options={currencies} /></Form.Item>
    </div>
    <Form.Item name="des_motivo" label="Descripción del motivo" rules={required}><Input.TextArea rows={2} maxLength={500} showCount /></Form.Item></Section>
    <PartyFields prefix="cliente" title="Cliente" />
    <BillingItems />
  </>;
}

function SenderGuideFields() {
  const mode = Form.useWatch("mod_traslado");
  const form = Form.useFormInstance();
  return <>
    <PartyFields prefix="destinatario" title="Destinatario" />
    <RouteFields onModeChange={(nextMode) => {
      if (nextMode === "01") form.setFieldsValue({ vehiculo: undefined, conductor: undefined });
      else form.setFieldsValue({ transportista: undefined, vehiculo: {}, conductor: { tipo: "Principal", tipo_doc: "1" } });
    }} />
    {mode === "01" ? <PartyFields prefix="transportista" title="Empresa transportista" includeAddress={false} /> : <>
      <Section title="Vehículo"><div className="purchase-form-grid"><Form.Item name={["vehiculo", "placa"]} label="Placa" rules={required}><Input /></Form.Item></div></Section>
      <Section title="Conductor"><div className="purchase-form-grid">
        <Form.Item name={["conductor", "tipo_doc"]} label="Tipo de documento" rules={required}><Select options={documentTypes.filter((item) => item.value !== "0")} /></Form.Item>
        <Form.Item name={["conductor", "num_doc"]} label="Documento" rules={required}><Input /></Form.Item>
        <Form.Item name={["conductor", "nombres"]} label="Nombres" rules={required}><Input /></Form.Item>
        <Form.Item name={["conductor", "apellidos"]} label="Apellidos" rules={required}><Input /></Form.Item>
        <Form.Item name={["conductor", "licencia"]} label="Licencia" rules={required}><Input /></Form.Item>
      </div></Section>
    </>}
    <GuideItems />
  </>;
}

function CarrierGuideFields() {
  return <>
    <PartyFields prefix="remitente" title="Remitente" />
    <PartyFields prefix="destinatario" title="Destinatario" />
    <Section title="Documento relacionado"><div className="purchase-form-grid">
      <Form.Item name={["doc_relacionado", "tipo_codigo"]} label="Tipo" rules={required}><Select options={[{ value: "09", label: "Guía de remisión remitente" }, { value: "01", label: "Factura" }, { value: "03", label: "Boleta" }, { value: "50", label: "DAM" }]} /></Form.Item>
      <Form.Item name={["doc_relacionado", "numero"]} label="Número" rules={required}><Input placeholder="T001-1" /></Form.Item>
      <Form.Item name={["doc_relacionado", "ruc_emisor"]} label="RUC del emisor"><Input maxLength={11} /></Form.Item>
    </div></Section>
    <RouteFields />
    <Section title="Vehículo"><div className="purchase-form-grid">
      <Form.Item name={["vehiculo", "placa"]} label="Placa" rules={required}><Input /></Form.Item>
      <Form.Item name={["vehiculo", "nro_circulacion"]} label="Certificado de circulación"><Input /></Form.Item>
    </div></Section>
    <Section title="Conductores"><Form.List name="conductor">{(fields, { add, remove }) => <Space direction="vertical" style={{ width: "100%" }}>
      {fields.map((field, index) => <Card size="small" key={field.key} title={`Conductor ${index + 1}`} extra={fields.length > 1 ? <Button danger type="text" icon={<DeleteOutlined />} onClick={() => remove(field.name)}>Quitar</Button> : null}><div className="purchase-form-grid">
        <Form.Item name={[field.name, "tipo_doc"]} label="Tipo de documento" rules={required}><Select options={documentTypes.filter((item) => item.value !== "0")} /></Form.Item>
        <Form.Item name={[field.name, "num_doc"]} label="Documento" rules={required}><Input /></Form.Item>
        <Form.Item name={[field.name, "nombres"]} label="Nombres" rules={required}><Input /></Form.Item>
        <Form.Item name={[field.name, "apellidos"]} label="Apellidos" rules={required}><Input /></Form.Item>
        <Form.Item name={[field.name, "licencia"]} label="Licencia" rules={required}><Input /></Form.Item>
      </div></Card>)}
      <Button icon={<PlusOutlined />} onClick={() => add({ tipo_doc: "1" })}>Agregar conductor</Button>
    </Space>}</Form.List></Section>
    <GuideItems />
  </>;
}

function RetentionFields() {
  return <>
    <PartyFields prefix="proveedor" title="Proveedor" includeAddress={false} />
    <Section title="Datos de la retención"><div className="purchase-form-grid">
      <Form.Item name="fecha_emision" label="Fecha de emisión" rules={required}><Input type="date" /></Form.Item>
      <Form.Item name="cod_local" label="Código de local"><Input /></Form.Item>
      <Form.Item name="regimen" label="Régimen" rules={required}><Select options={[{ value: "01", label: "Régimen general" }]} /></Form.Item>
      <Form.Item name="tasa" label="Tasa (%)" rules={required}><InputNumber min={0.01} precision={2} style={{ width: "100%" }} /></Form.Item>
    </div></Section>
    <Section title="Comprobantes retenidos"><Form.List name="documentos">{(fields, { add, remove }) => <Space direction="vertical" style={{ width: "100%" }}>
      {fields.map((field, index) => <Card size="small" key={field.key} title={`Comprobante ${index + 1}`} extra={fields.length > 1 ? <Button danger type="text" icon={<DeleteOutlined />} onClick={() => remove(field.name)}>Quitar</Button> : null}><div className="purchase-form-grid">
        <Form.Item name={[field.name, "tipo_doc"]} label="Tipo" rules={required}><Select options={[{ value: "01", label: "Factura" }, { value: "03", label: "Boleta" }, { value: "07", label: "Nota de crédito" }, { value: "08", label: "Nota de débito" }]} /></Form.Item>
        <Form.Item name={[field.name, "num_doc"]} label="Número" rules={required}><Input placeholder="F001-100" /></Form.Item>
        <Form.Item name={[field.name, "fecha_emision"]} label="Fecha del comprobante" rules={required}><Input type="date" /></Form.Item>
        <Form.Item name={[field.name, "moneda"]} label="Moneda" rules={required}><Select options={currencies} /></Form.Item>
        <Form.Item name={[field.name, "imp_total"]} label="Importe total" rules={required}><InputNumber min={0.01} precision={2} style={{ width: "100%" }} /></Form.Item>
        <Form.Item name={[field.name, "fecha_retencion"]} label="Fecha de retención" rules={required}><Input type="date" /></Form.Item>
        <Form.Item name={[field.name, "imp_retenido"]} label="Importe retenido"><InputNumber min={0} precision={2} style={{ width: "100%" }} /></Form.Item>
        <Form.Item name={[field.name, "imp_pagar"]} label="Importe a pagar"><InputNumber min={0} precision={2} style={{ width: "100%" }} /></Form.Item>
      </div><Divider plain>Pago aplicado</Divider><Form.List name={[field.name, "pagos"]}>{(payments, helpers) => <Space direction="vertical" style={{ width: "100%" }}>{payments.map((payment) => <div className="purchase-form-grid" key={payment.key}><Form.Item name={[payment.name, "fecha"]} label="Fecha" rules={required}><Input type="date" /></Form.Item><Form.Item name={[payment.name, "importe"]} label="Importe" rules={required}><InputNumber min={0.01} precision={2} style={{ width: "100%" }} /></Form.Item><Form.Item name={[payment.name, "moneda"]} label="Moneda"><Select options={currencies} /></Form.Item></div>)}<Button size="small" icon={<PlusOutlined />} onClick={() => helpers.add({ fecha: dayjs().format("YYYY-MM-DD"), moneda: "PEN" })}>Agregar pago</Button></Space>}</Form.List></Card>)}
      <Button icon={<PlusOutlined />} onClick={() => add({ tipo_doc: "01", moneda: "PEN", fecha_emision: dayjs().format("YYYY-MM-DD"), fecha_retencion: dayjs().format("YYYY-MM-DD"), pagos: [{ moneda: "PEN", fecha: dayjs().format("YYYY-MM-DD") }] })}>Agregar comprobante</Button>
    </Space>}</Form.List></Section>
  </>;
}

function PerceptionFields() {
  return <>
    <PartyFields prefix="cliente" title="Cliente" />
    <Section title="Datos de la percepción"><div className="purchase-form-grid">
      <Form.Item name="fecha_emision" label="Fecha de emisión" rules={required}><Input type="date" /></Form.Item>
      <Form.Item name="cod_local" label="Código de local"><Input /></Form.Item>
      <Form.Item name="regimen" label="Régimen" rules={required}><Select options={[{ value: "01", label: "Venta interna" }, { value: "02", label: "Combustible" }]} /></Form.Item>
      <Form.Item name="tasa" label="Tasa (%)" rules={required}><InputNumber min={0.01} precision={2} style={{ width: "100%" }} /></Form.Item>
    </div><Form.Item name="observacion" label="Observación"><Input.TextArea rows={2} /></Form.Item></Section>
    <Section title="Comprobantes percibidos"><Form.List name="documentos">{(fields, { add, remove }) => <Space direction="vertical" style={{ width: "100%" }}>
      {fields.map((field, index) => <Card size="small" key={field.key} title={`Comprobante ${index + 1}`} extra={fields.length > 1 ? <Button danger type="text" icon={<DeleteOutlined />} onClick={() => remove(field.name)}>Quitar</Button> : null}><div className="purchase-form-grid">
        <Form.Item name={[field.name, "tipo_doc"]} label="Tipo" rules={required}><Select options={[{ value: "01", label: "Factura" }, { value: "03", label: "Boleta" }]} /></Form.Item>
        <Form.Item name={[field.name, "num_doc"]} label="Número" rules={required}><Input /></Form.Item>
        <Form.Item name={[field.name, "fecha_emision"]} label="Fecha del comprobante" rules={required}><Input type="date" /></Form.Item>
        <Form.Item name={[field.name, "moneda"]} label="Moneda" rules={required}><Select options={currencies} /></Form.Item>
        <Form.Item name={[field.name, "imp_total"]} label="Importe total" rules={required}><InputNumber min={0.01} precision={2} style={{ width: "100%" }} /></Form.Item>
        <Form.Item name={[field.name, "fecha_percepcion"]} label="Fecha de percepción" rules={required}><Input type="date" /></Form.Item>
      </div><Divider plain>Cobro aplicado</Divider><Form.List name={[field.name, "cobros"]}>{(payments, helpers) => <Space direction="vertical" style={{ width: "100%" }}>{payments.map((payment) => <div className="purchase-form-grid" key={payment.key}><Form.Item name={[payment.name, "fecha"]} label="Fecha" rules={required}><Input type="date" /></Form.Item><Form.Item name={[payment.name, "importe"]} label="Importe" rules={required}><InputNumber min={0.01} precision={2} style={{ width: "100%" }} /></Form.Item></div>)}<Button size="small" icon={<PlusOutlined />} onClick={() => helpers.add({ fecha: dayjs().format("YYYY-MM-DD") })}>Agregar cobro</Button></Space>}</Form.List></Card>)}
      <Button icon={<PlusOutlined />} onClick={() => add({ tipo_doc: "01", moneda: "PEN", fecha_emision: dayjs().format("YYYY-MM-DD"), fecha_percepcion: dayjs().format("YYYY-MM-DD"), cobros: [{ fecha: dayjs().format("YYYY-MM-DD") }] })}>Agregar comprobante</Button>
    </Space>}</Form.List></Section>
  </>;
}

function PurchaseSettlementFields() {
  return <>
    <Section title="Datos generales"><div className="purchase-form-grid">
      <Form.Item name="fecha_emision" label="Fecha de emisión" rules={required}><Input type="date" /></Form.Item>
      <Form.Item name="tipo_operacion" label="Tipo de operación" rules={required}><Select options={[{ value: "0501", label: "Compra a productor primario" }]} /></Form.Item>
    </div></Section>
    <Section title="Vendedor"><div className="purchase-form-grid">
      <Form.Item name={["vendedor", "tipo_doc"]} label="Tipo de documento" rules={required}><Select options={documentTypes.filter((item) => item.value !== "0")} /></Form.Item>
      <Form.Item name={["vendedor", "num_doc"]} label="Documento" rules={required}><Input /></Form.Item>
      <Form.Item name={["vendedor", "nombre"]} label="Nombre completo" rules={required}><Input /></Form.Item>
      <Form.Item name={["vendedor", "direccion"]} label="Dirección" rules={required}><Input /></Form.Item>
      <Form.Item name={["vendedor", "ubigeo"]} label="Ubigeo" rules={[...required, { pattern: /^\d{6}$/, message: "Debe tener 6 dígitos." }]}><Input maxLength={6} /></Form.Item>
      <Form.Item name={["vendedor", "tipo_domicilio"]} label="Tipo de domicilio" rules={required}><Select options={[{ value: "01", label: "Domicilio fiscal" }]} /></Form.Item>
    </div></Section>
    <Section title="Lugar de compra"><div className="purchase-form-grid">
      <Form.Item name={["lugar", "direccion"]} label="Dirección" rules={required}><Input /></Form.Item>
      <Form.Item name={["lugar", "ubigeo"]} label="Ubigeo" rules={[...required, { pattern: /^\d{6}$/, message: "Debe tener 6 dígitos." }]}><Input maxLength={6} /></Form.Item>
      <Form.Item name={["lugar", "tipo"]} label="Tipo" rules={required}><Select options={[{ value: "01", label: "Lugar de compra" }]} /></Form.Item>
    </div></Section>
    <Section title="Bienes adquiridos"><Form.List name="items">{(fields, { add, remove }) => <Space direction="vertical" style={{ width: "100%" }}>
      {fields.map((field, index) => <Card size="small" key={field.key} title={`Bien ${index + 1}`} extra={fields.length > 1 ? <Button danger type="text" icon={<DeleteOutlined />} onClick={() => remove(field.name)}>Quitar</Button> : null}><div className="purchase-form-grid">
        <Form.Item name={[field.name, "descripcion"]} label="Descripción" rules={required}><Input /></Form.Item>
        <Form.Item name={[field.name, "cantidad"]} label="Cantidad" rules={required}><InputNumber min={0.001} precision={3} style={{ width: "100%" }} /></Form.Item>
        <Form.Item name={[field.name, "valor_unitario"]} label="Valor unitario" rules={required}><InputNumber min={0.01} precision={4} style={{ width: "100%" }} /></Form.Item>
        <Form.Item name={[field.name, "unidad"]} label="Unidad" rules={required}><Select options={units} /></Form.Item>
        <Form.Item name={[field.name, "cod_producto_sunat"]} label="Código producto SUNAT"><Input /></Form.Item>
        <Form.Item name={[field.name, "tip_afe_igv"]} label="Afectación IGV" rules={required}><Select options={[{ value: "10", label: "Gravado" }, { value: "20", label: "Exonerado" }, { value: "30", label: "Inafecto" }]} /></Form.Item>
      </div></Card>)}
      <Button icon={<PlusOutlined />} onClick={() => add({ unidad: "KGM", cantidad: 1, tip_afe_igv: "10" })}>Agregar bien</Button>
    </Space>}</Form.List></Section>
  </>;
}

function DailySummaryFields() {
  return <>
    <Alert type="info" showIcon message="Sin anulaciones, el resumen enviará las boletas pendientes de la fecha indicada." />
    <Section title="Resumen diario"><div className="purchase-form-grid"><Form.Item name="fecha_resumen" label="Fecha del resumen" rules={required}><Input type="date" /></Form.Item></div></Section>
    <Section title="Boletas a anular (opcional)"><Form.List name="anular">{(fields, { add, remove }) => <Space direction="vertical" style={{ width: "100%" }}>{fields.map((field, index) => <Card size="small" key={field.key} title={`Boleta ${index + 1}`} extra={<Button danger type="text" icon={<DeleteOutlined />} onClick={() => remove(field.name)}>Quitar</Button>}><div className="purchase-form-grid"><Form.Item name={[field.name, "id"]} label="ID en plataforma SUNAT" rules={required}><InputNumber min={1} precision={0} style={{ width: "100%" }} /></Form.Item><Form.Item name={[field.name, "motivo"]} label="Motivo" rules={required}><Input /></Form.Item></div></Card>)}<Button icon={<PlusOutlined />} onClick={() => add()}>Agregar boleta a anular</Button></Space>}</Form.List></Section>
  </>;
}

function CommunicationFields({ kind }: { kind: "VOIDED_DOCUMENT" | "REVERSION" }) {
  const isReversion = kind === "REVERSION";
  return <>
    <Section title={isReversion ? "Datos de la reversión" : "Datos de la comunicación de baja"}><div className="purchase-form-grid">
      <Form.Item name="fecha_generacion" label="Fecha de generación" rules={required}><Input type="date" /></Form.Item>
      <Form.Item name="fecha_comunicacion" label="Fecha de comunicación"><Input type="date" /></Form.Item>
    </div></Section>
    <Section title="Documentos"><Form.List name="detalles">{(fields, { add, remove }) => <Space direction="vertical" style={{ width: "100%" }}>{fields.map((field, index) => <Card size="small" key={field.key} title={`Documento ${index + 1}`} extra={fields.length > 1 ? <Button danger type="text" icon={<DeleteOutlined />} onClick={() => remove(field.name)}>Quitar</Button> : null}><div className="purchase-form-grid">
      <Form.Item name={[field.name, "tipo_documento"]} label="Tipo" rules={required}><Select options={isReversion ? [{ value: "20", label: "Retención" }, { value: "40", label: "Percepción" }] : [{ value: "01", label: "Factura" }, { value: "07", label: "Nota de crédito" }, { value: "08", label: "Nota de débito" }]} /></Form.Item>
      <Form.Item name={[field.name, "serie"]} label="Serie" rules={required}><Input /></Form.Item>
      <Form.Item name={[field.name, "correlativo"]} label="Correlativo" rules={required}><Input /></Form.Item>
      <Form.Item name={[field.name, "motivo"]} label="Motivo" rules={required}><Input /></Form.Item>
    </div></Card>)}<Button icon={<PlusOutlined />} onClick={() => add({ tipo_documento: isReversion ? "20" : "01" })}>Agregar documento</Button></Space>}</Form.List></Section>
  </>;
}

export function ElectronicDocumentFormFields({ kind }: { kind: ElectronicDocumentKind }) {
  switch (kind) {
    case "CREDIT_NOTE": return <NoteFields kind={kind} />;
    case "DEBIT_NOTE": return <NoteFields kind={kind} />;
    case "SENDER_GUIDE": return <SenderGuideFields />;
    case "CARRIER_GUIDE": return <CarrierGuideFields />;
    case "RETENTION": return <RetentionFields />;
    case "PERCEPTION": return <PerceptionFields />;
    case "PURCHASE_SETTLEMENT": return <PurchaseSettlementFields />;
    case "DAILY_SUMMARY": return <DailySummaryFields />;
    case "VOIDED_DOCUMENT": return <CommunicationFields kind={kind} />;
    case "REVERSION": return <CommunicationFields kind={kind} />;
  }
}
