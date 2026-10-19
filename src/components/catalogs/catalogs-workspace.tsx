"use client";

import { CheckCircleOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, StopOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Checkbox, Empty, Form, Input, InputNumber, Modal, Select, Space, Tabs, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { toast } from "sonner";
import { ModuleHeadingIntro } from "@/components/common/module-heading-intro";
import { ResponsiveTable as Table } from "@/components/common/responsive-table";

type CatalogType = "SUPPLIER" | "CUSTOMER" | "WAREHOUSE" | "UNIT" | "CURRENCY";
type DocumentType = "DNI" | "RUC";
type Common = {
  id: string;
  code: string;
  name: string;
  documentType?: DocumentType | null;
  taxId?: string | null;
  email?: string | null;
  phone?: string | null;
  fiscalAddress?: string | null;
  ubigeo?: string | null;
  department?: string | null;
  province?: string | null;
  district?: string | null;
  rucStatus?: string | null;
  rucCondition?: string | null;
  sunatSource?: "APIS.NET.PE" | null;
  sunatCheckedAt?: string | null;
  symbol?: string;
  decimalPlaces?: number;
  isBase?: boolean;
  active?: boolean;
};
type Contact = Common & { active: boolean };
type Warehouse = Common & { active: boolean };
type Unit = Common & { symbol: string; decimalPlaces: number };
type Currency = Common & { symbol: string; isBase: boolean };
type Catalogs = { suppliers: Contact[]; customers: Contact[]; warehouses: Warehouse[]; units: Unit[]; currencies: Currency[] };
type CatalogForm = {
  code?: string;
  name: string;
  documentType?: DocumentType;
  taxId?: string;
  email?: string;
  phone?: string;
  fiscalAddress?: string;
  ubigeo?: string;
  department?: string;
  province?: string;
  district?: string;
  rucStatus?: string;
  rucCondition?: string;
  sunatSource?: "APIS.NET.PE";
  sunatCheckedAt?: string;
  symbol?: string;
  decimalPlaces?: number;
  isBase?: boolean;
};
type RucLookup = {
  ruc: string;
  name: string;
  status: string | null;
  condition: string | null;
  fiscalAddress: string | null;
  ubigeo: string | null;
  department: string | null;
  province: string | null;
  district: string | null;
  source: "APIS.NET.PE";
  consultedAt: string;
};
type DniLookup = {
  dni: string;
  name: string;
  firstNames: string | null;
  paternalSurname: string | null;
  maternalSurname: string | null;
  source: "APIS.NET.PE";
  consultedAt: string;
};

const labels: Record<CatalogType, { singular: string; plural: string }> = {
  SUPPLIER: { singular: "proveedor", plural: "Proveedores" },
  CUSTOMER: { singular: "cliente", plural: "Clientes" },
  WAREHOUSE: { singular: "almacén", plural: "Almacenes" },
  UNIT: { singular: "unidad", plural: "Unidades" },
  CURRENCY: { singular: "moneda", plural: "Monedas" },
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(payload?.error?.message ?? "No se pudo completar la operación.");
  return payload.data;
}

const commonColumns: ColumnsType<Common> = [
  { title: "Código", dataIndex: "code", width: 130, render: (value) => <strong>{value}</strong> },
  { title: "Nombre", dataIndex: "name", width: 260 },
];
const contactColumns: ColumnsType<Common> = [
  ...commonColumns,
  { title: "Documento", dataIndex: "taxId", width: 190, render: (value, row) => value ? <Space size={4}><Tag>{row.documentType ?? (value.length === 8 ? "DNI" : "RUC")}</Tag><span>{value}</span></Space> : "—" },
  { title: "Estado", dataIndex: "active", width: 100, render: (value) => value === false ? <Tag>Inactivo</Tag> : <Tag color="green">Activo</Tag> },
];

export function CatalogsWorkspace({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [active, setActive] = useState<CatalogType>("SUPPLIER");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Common>();
  const [checkedDocument, setCheckedDocument] = useState<string>();
  const [form] = Form.useForm<CatalogForm>();
  const [settingsForm] = Form.useForm<{ igvRate: number }>();
  const taxId = Form.useWatch("taxId", form);
  const documentType = Form.useWatch("documentType", form) ?? "RUC";

  const catalogs = useQuery({ queryKey: ["catalogs"], queryFn: () => api<Catalogs>("/api/v1/catalogs") });
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api<{ igvRate: string }>("/api/v1/settings") });
  const refreshCatalogDependencies = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["catalogs"] }),
    queryClient.invalidateQueries({ queryKey: ["purchase-options"] }),
    queryClient.invalidateQueries({ queryKey: ["order-options"] }),
    queryClient.invalidateQueries({ queryKey: ["inventory-options"] }),
  ]);
  const create = useMutation({
    mutationFn: (values: CatalogForm) => api("/api/v1/catalogs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: active, ...values }) }),
    onSuccess: async () => { toast.success(`${labels[active].singular[0].toUpperCase()}${labels[active].singular.slice(1)} creado.`); setOpen(false); form.resetFields(); await refreshCatalogDependencies(); },
    onError: (error) => toast.error(error.message),
  });
  const update = useMutation({
    mutationFn: (values: CatalogForm) => api(`/api/v1/catalogs/${active}/${editing?.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(values) }),
    onSuccess: async () => { toast.success("Registro actualizado."); setOpen(false); setEditing(undefined); form.resetFields(); await refreshCatalogDependencies(); },
    onError: (error) => toast.error(error.message),
  });
  const rucLookup = useMutation({
    mutationFn: (ruc: string) => api<RucLookup>("/api/v1/taxpayers/ruc", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ruc }) }),
    onSuccess: (result) => {
      form.setFieldsValue({
        taxId: result.ruc,
        name: result.name,
        fiscalAddress: result.fiscalAddress ?? undefined,
        ubigeo: result.ubigeo ?? undefined,
        department: result.department ?? undefined,
        province: result.province ?? undefined,
        district: result.district ?? undefined,
        rucStatus: result.status ?? undefined,
        rucCondition: result.condition ?? undefined,
        sunatSource: result.source,
        sunatCheckedAt: result.consultedAt,
      });
      setCheckedDocument(result.ruc);
      toast.success("Datos del RUC encontrados. Revísalos antes de guardar.");
    },
    onError: (error) => toast.error(error.message),
  });
  const dniLookup = useMutation({
    mutationFn: (dni: string) => api<DniLookup>("/api/v1/taxpayers/dni", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dni }) }),
    onSuccess: (result) => {
      form.setFieldsValue({
        taxId: result.dni,
        name: result.name,
        fiscalAddress: undefined,
        ubigeo: undefined,
        department: undefined,
        province: undefined,
        district: undefined,
        rucStatus: undefined,
        rucCondition: undefined,
        sunatSource: result.source,
        sunatCheckedAt: result.consultedAt,
      });
      setCheckedDocument(result.dni);
      toast.success("Nombre encontrado. Revísalo antes de guardar.");
    },
    onError: (error) => toast.error(error.message),
  });
  const updateSettings = useMutation({
    mutationFn: (values: { igvRate: number }) => api("/api/v1/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(values) }),
    onSuccess: async () => {
      toast.success("Configuración actualizada.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["settings"] }),
        queryClient.invalidateQueries({ queryKey: ["purchase-options"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-options"] }),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });
  const changeStatus = useMutation({
    mutationFn: ({ type, id, nextActive }: { type: "SUPPLIER" | "CUSTOMER"; id: string; nextActive: boolean }) => api(`/api/v1/catalogs/${type}/${id}/status`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ active: nextActive }) }),
    onSuccess: async (_, variables) => {
      toast.success(`${labels[variables.type].singular[0].toUpperCase()}${labels[variables.type].singular.slice(1)} ${variables.nextActive ? "reactivado" : "inactivado"}.`);
      await refreshCatalogDependencies();
    },
    onError: (error) => toast.error(error.message),
  });

  const openCreate = () => {
    setEditing(undefined);
    setCheckedDocument(undefined);
    rucLookup.reset();
    dniLookup.reset();
    form.resetFields();
    form.setFieldsValue(active === "UNIT" ? { decimalPlaces: 3 } : active === "CURRENCY" ? { isBase: false } : (active === "SUPPLIER" || active === "CUSTOMER") ? { documentType: "RUC" } : {});
    setOpen(true);
  };
  const openEdit = (record: Common) => {
    setEditing(record);
    setCheckedDocument(record.sunatCheckedAt ? record.taxId ?? undefined : undefined);
    rucLookup.reset();
    dniLookup.reset();
    form.setFieldsValue({
      ...record,
      documentType: record.documentType ?? (record.taxId?.length === 8 ? "DNI" : "RUC"),
      taxId: record.taxId ?? undefined,
      email: record.email ?? undefined,
      phone: record.phone ?? undefined,
      fiscalAddress: record.fiscalAddress ?? undefined,
      ubigeo: record.ubigeo ?? undefined,
      department: record.department ?? undefined,
      province: record.province ?? undefined,
      district: record.district ?? undefined,
      rucStatus: record.rucStatus ?? undefined,
      rucCondition: record.rucCondition ?? undefined,
      sunatSource: record.sunatSource ?? undefined,
      sunatCheckedAt: record.sunatCheckedAt ?? undefined,
    });
    setOpen(true);
  };

  const table = (type: CatalogType, data: Common[], columns: ColumnsType<Common> = commonColumns) => {
    const actionColumns: ColumnsType<Common> = canManage ? [{
      title: "Acciones",
      width: type === "SUPPLIER" || type === "CUSTOMER" ? 230 : 100,
      render: (_: unknown, row: Common) => <Space wrap>
        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>Editar</Button>
        {type === "SUPPLIER" || type === "CUSTOMER" ? <Button
          size="small"
          danger={row.active !== false}
          icon={row.active === false ? <CheckCircleOutlined /> : <StopOutlined />}
          loading={changeStatus.isPending}
          onClick={() => {
            const nextActive = row.active === false;
            Modal.confirm({
              title: `¿${nextActive ? "Reactivar" : "Inactivar"} ${labels[type].singular}?`,
              content: nextActive ? `${row.name} volverá a estar disponible en nuevas operaciones.` : `${row.name} conservará todo su historial, pero dejará de aparecer al crear nuevas ${type === "SUPPLIER" ? "compras" : "órdenes de pedido"}.`,
              okText: nextActive ? "Reactivar" : "Inactivar",
              cancelText: "Cancelar",
              okButtonProps: { danger: !nextActive },
              onOk: () => changeStatus.mutateAsync({ type, id: row.id, nextActive }),
            });
          }}
        >{row.active === false ? "Reactivar" : "Inactivar"}</Button> : null}
      </Space>,
    }] : [];
    return <Table
      rowKey="id"
      loading={catalogs.isLoading}
      dataSource={data}
      columns={[...columns, ...actionColumns]}
      scroll={{ x: type === "SUPPLIER" || type === "CUSTOMER" ? 900 : 720 }}
      pagination={{ pageSize: 15 }}
      locale={{ emptyText: <Empty description={`No hay ${labels[type].plural.toLowerCase()}`} /> }}
    />;
  };
  const tabs = [
    { key: "SUPPLIER", label: "Proveedores", children: table("SUPPLIER", catalogs.data?.suppliers ?? [], contactColumns) },
    { key: "CUSTOMER", label: "Clientes", children: table("CUSTOMER", catalogs.data?.customers ?? [], contactColumns) },
    { key: "WAREHOUSE", label: "Almacenes", children: table("WAREHOUSE", catalogs.data?.warehouses ?? [], [...commonColumns, { title: "Estado", dataIndex: "active", width: 110, render: (value) => value ? <Tag color="green">Activo</Tag> : <Tag>Inactivo</Tag> }]) },
    { key: "UNIT", label: "Unidades", children: table("UNIT", catalogs.data?.units ?? [], [...commonColumns, { title: "Símbolo", dataIndex: "symbol", width: 120 }, { title: "Decimales", dataIndex: "decimalPlaces", width: 120 }]) },
    { key: "CURRENCY", label: "Monedas", children: table("CURRENCY", catalogs.data?.currencies ?? [], [...commonColumns, { title: "Símbolo", dataIndex: "symbol", width: 120 }, { title: "Tipo", dataIndex: "isBase", width: 130, render: (value) => value ? <Tag color="gold">Moneda base</Tag> : "Alterna" }]) },
  ];
  const contactCatalog = active === "SUPPLIER" || active === "CUSTOMER";

  return <>
    <div className="page-heading">
      <ModuleHeadingIntro title="Catálogos" eyebrow="Maestros" description="Administra los datos base usados por compras, almacén, producción y pedidos." />
      <Space wrap className="module-actions"><Button icon={<ReloadOutlined />} onClick={() => catalogs.refetch()}>Actualizar</Button></Space>
    </div>
    <Card className="section-card" title={labels[active].plural} extra={canManage ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Nuevo {labels[active].singular}</Button> : null}>
      {catalogs.error ? <Alert type="error" showIcon message={catalogs.error.message} style={{ marginBottom: 16 }} /> : null}
      <Tabs activeKey={active} onChange={(key) => setActive(key as CatalogType)} items={tabs} />
    </Card>
    {settings.data ? <Card className="section-card" title="Configuración general" style={{ marginTop: 16 }}>
      <Form form={settingsForm} layout="vertical" initialValues={{ igvRate: Number(settings.data.igvRate) }} onFinish={(values) => updateSettings.mutate(values)}>
        <Form.Item name="igvRate" label="IGV (%)" rules={[{ required: true }]} extra="Tasa aplicada por defecto a las compras y al costo de referencia de los ítems de Almacén.">
          <InputNumber min={0} max={100} precision={2} style={{ width: 200 }} disabled={!canManage} />
        </Form.Item>
        {canManage ? <Button type="primary" htmlType="submit" loading={updateSettings.isPending}>Guardar configuración</Button> : null}
      </Form>
    </Card> : null}
    <Modal
      title={`${editing ? "Editar" : "Nuevo"} ${labels[active].singular}`}
      width={760}
      open={open}
      onCancel={() => { setOpen(false); setEditing(undefined); setCheckedDocument(undefined); }}
      onOk={() => form.submit()}
      okText={editing ? "Guardar cambios" : "Crear"}
      confirmLoading={create.isPending || update.isPending}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => editing ? update.mutate(values) : create.mutate(values)}
        onValuesChange={(changed) => {
          if ("taxId" in changed && changed.taxId !== checkedDocument) {
            form.setFieldsValue({ rucStatus: undefined, rucCondition: undefined, sunatSource: undefined, sunatCheckedAt: undefined });
          }
        }}
      >
        {contactCatalog ? <>
          <Form.Item name="rucStatus" hidden><Input /></Form.Item>
          <Form.Item name="rucCondition" hidden><Input /></Form.Item>
          <Form.Item name="sunatSource" hidden><Input /></Form.Item>
          <Form.Item name="sunatCheckedAt" hidden><Input /></Form.Item>
          {editing ? <Form.Item label="Código"><Input disabled value={editing.code} /></Form.Item> : null}
          <div className="catalog-document-grid">
            <Form.Item name="documentType" label="Tipo de documento" rules={[{ required: true }]}>
              <Select
                options={[{ value: "DNI", label: "DNI" }, { value: "RUC", label: "RUC" }]}
                onChange={() => {
                  setCheckedDocument(undefined);
                  rucLookup.reset();
                  dniLookup.reset();
                  form.setFieldsValue({ taxId: undefined, fiscalAddress: undefined, ubigeo: undefined, department: undefined, province: undefined, district: undefined, rucStatus: undefined, rucCondition: undefined, sunatSource: undefined, sunatCheckedAt: undefined });
                }}
              />
            </Form.Item>
            <Form.Item label="Número de documento">
              <Space.Compact block>
                <Form.Item
                  name="taxId"
                  noStyle
                  normalize={(value) => typeof value === "string" ? value.replace(/\D/g, "").slice(0, documentType === "DNI" ? 8 : 11) : value}
                  rules={[{ pattern: documentType === "DNI" ? /^\d{8}$/ : /^\d{11}$/, message: `Ingresa un ${documentType} válido.` }]}
                >
                  <Input inputMode="numeric" maxLength={documentType === "DNI" ? 8 : 11} placeholder={documentType === "DNI" ? "44556677" : "20131312955"} />
                </Form.Item>
                <Button
                  icon={<SearchOutlined />}
                  loading={rucLookup.isPending || dniLookup.isPending}
                  disabled={documentType === "DNI" ? !/^\d{8}$/.test(taxId ?? "") : !/^\d{11}$/.test(taxId ?? "")}
                  onClick={() => documentType === "DNI" ? dniLookup.mutate(taxId!) : rucLookup.mutate(taxId!)}
                >Consultar {documentType}</Button>
              </Space.Compact>
            </Form.Item>
          </div>
          <Form.Item name="name" label={documentType === "DNI" ? "Nombre completo" : "Nombre o razón social"} rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="fiscalAddress" label="Dirección fiscal"><Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} /></Form.Item>
          <div className="catalog-location-grid">
            <Form.Item name="department" label="Departamento"><Input /></Form.Item>
            <Form.Item name="province" label="Provincia"><Input /></Form.Item>
            <Form.Item name="district" label="Distrito"><Input /></Form.Item>
            <Form.Item name="ubigeo" label="Ubigeo"><Input maxLength={6} /></Form.Item>
          </div>
          <div className="catalog-contact-grid">
            <Form.Item name="email" label="Correo"><Input type="email" /></Form.Item>
            <Form.Item name="phone" label="Teléfono"><Input /></Form.Item>
          </div>
        </> : <>
          <Form.Item name="code" label={active === "CURRENCY" ? "Código ISO" : "Código"} rules={[{ required: true }, ...(active === "CURRENCY" ? [{ len: 3, message: "Usa el código ISO de 3 letras" }] : [])]}>
            <Input disabled={Boolean(editing)} placeholder={active === "CURRENCY" ? "PEN" : undefined} />
          </Form.Item>
          <Form.Item name="name" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item>
        </>}
        {active === "UNIT" ? <><Form.Item name="symbol" label="Símbolo" rules={[{ required: true }]}><Input placeholder="kg" /></Form.Item><Form.Item name="decimalPlaces" label="Cantidad de decimales" rules={[{ required: true }]}><InputNumber min={0} max={6} style={{ width: "100%" }} /></Form.Item></> : null}
        {active === "CURRENCY" ? <><Form.Item name="symbol" label="Símbolo" rules={[{ required: true }]}><Input placeholder="S/" /></Form.Item><Form.Item name="isBase" valuePropName="checked"><Checkbox>Usar como moneda base</Checkbox></Form.Item></> : null}
      </Form>
    </Modal>
  </>;
}
