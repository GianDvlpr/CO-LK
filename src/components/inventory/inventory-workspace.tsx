"use client";

import { EditOutlined, HistoryOutlined, MoreOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Checkbox, DatePicker, Dropdown, Empty, Form, Input, InputNumber, Modal, Select, Space, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import Decimal from "decimal.js";
import { calculateReferenceTotalCost } from "@/modules/inventory/domain/reference-cost";
import { ModuleImportButton } from "@/components/imports/module-import-button";
import { ModuleHeadingIntro } from "@/components/common/module-heading-intro";
import { ResponsiveTable as Table } from "@/components/common/responsive-table";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

type Balance = { warehouseId: string; onHandQuantity: string; reservedQuantity: string; averageUnitCost: string; inventoryValue: string };
type Item = { id: string; code: string; abbreviation?: string; name: string; type: string; minimumStock: string; lotTrackingMode: string; active: boolean; supplierProductCode?: string | null; referenceNetPrice?: string | null; referenceTaxRate?: string | null; unit: { code: string; symbol: string }; supplier: { id: string; code: string; name: string } | null; currency: { id: string; code: string; name: string; symbol: string } | null; balances: Balance[] };
type Options = { units: { id: string; code: string; name: string; symbol: string }[]; warehouses: { id: string; code: string; name: string }[]; items: (Pick<Item, "id" | "code" | "name" | "lotTrackingMode"> & { unit: { symbol: string } })[]; suppliers: { id: string; code: string; name: string }[]; currencies: { id: string; code: string; name: string; symbol: string; isBase: boolean }[]; igvRate?: string };
type ItemForm = { name: string; abbreviation?: string; type: "RAW_MATERIAL" | "WASTE" | "FINISHED_PRODUCT"; unitId: string; supplierId: string; currencyId: string; minimumStock: number; lotTrackingMode: "NONE" | "OPTIONAL" | "REQUIRED"; active?: boolean; supplierProductCode?: string | null; referenceNetPrice?: number | null; referenceTaxRate?: number | null };
type OpeningForm = { referenceNumber: string; itemId: string; warehouseId: string; quantity: number; unitCost: number; lotCode?: string; occurredAt: Dayjs };

async function api<T>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, init); const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo completar la operación."); return payload.data; }

export function InventoryWorkspace({ permissions, canCreate, canOpenStock }: { permissions: string[]; canCreate: boolean; canOpenStock: boolean }) {
  const queryClient = useQueryClient();
  const [itemOpen, setItemOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item>();
  const [openingOpen, setOpeningOpen] = useState(false);
  const [itemForm] = Form.useForm<ItemForm>();
  const [openingForm] = Form.useForm<OpeningForm>();
  const inventory = useQuery({ queryKey: ["inventory"], queryFn: () => api<{ items: Item[] }>("/api/v1/inventory") });
  const options = useQuery({ queryKey: ["inventory-options"], queryFn: () => api<Options>("/api/v1/inventory/options") });
  const referenceNetPrice = Form.useWatch("referenceNetPrice", itemForm);
  const referenceTaxRate = Form.useWatch("referenceTaxRate", itemForm);
  const companyIgvRate = options.data?.igvRate ? Number(options.data.igvRate) : 18;
  const referenceTotal = (() => {
    if (referenceNetPrice === null || referenceNetPrice === undefined) return null;
    try { return calculateReferenceTotalCost({ netPrice: referenceNetPrice, taxRate: referenceTaxRate ?? companyIgvRate }); } catch { return null; }
  })();
  const createItem = useMutation({ mutationFn: (values: ItemForm) => api("/api/v1/inventory", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(values) }), onSuccess: async () => { toast.success("Ítem creado."); setItemOpen(false); itemForm.resetFields(); await Promise.all([queryClient.invalidateQueries({ queryKey: ["inventory"] }), queryClient.invalidateQueries({ queryKey: ["inventory-options"] })]); }, onError: (error) => toast.error(error.message) });
  const updateItem = useMutation({ mutationFn: (values: ItemForm) => api(`/api/v1/inventory/${editingItem?.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(values) }), onSuccess: async () => { toast.success("Ítem actualizado."); setItemOpen(false); setEditingItem(undefined); itemForm.resetFields(); await Promise.all([queryClient.invalidateQueries({ queryKey: ["inventory"] }), queryClient.invalidateQueries({ queryKey: ["inventory-options"] })]); }, onError: (error) => toast.error(error.message) });
  const createOpening = useMutation({ mutationFn: (values: OpeningForm) => api("/api/v1/inventory/opening", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...values, occurredAt: values.occurredAt.format("YYYY-MM-DD") }) }), onSuccess: async () => { toast.success("Stock inicial contabilizado."); setOpeningOpen(false); openingForm.resetFields(); await queryClient.invalidateQueries({ queryKey: ["inventory"] }); }, onError: (error) => toast.error(error.message) });

  const columns: ColumnsType<Item> = [
    { title: "Código", dataIndex: "code", width: 150, fixed: "left", render: (value) => <strong>{value}</strong> },
    { title: "Ítem", dataIndex: "name", width: 260, render: (value, row) => <>{value}{row.abbreviation ? <><br /><Tag>{row.abbreviation}</Tag></> : null}</> },
    { title: "Tipo", dataIndex: "type", width: 150, render: (value) => {
      const types: Record<string, { label: string; color: string }> = {
        RAW_MATERIAL: { label: "Materia prima", color: "blue" },
        WASTE: { label: "Merma", color: "orange" },
        FINISHED_PRODUCT: { label: "Producto terminado", color: "purple" },
      };
      const type = types[value] ?? { label: value, color: "default" };
      return <Tag color={type.color}>{type.label}</Tag>;
    } },
    { title: "Proveedor", width: 220, render: (_, row) => row.supplier ? <>{row.supplier.name}<br /><Tag>{row.supplier.code}</Tag></> : <Tag>Sin asignar</Tag> },
    { title: "Código del proveedor", dataIndex: "supplierProductCode", width: 170, render: (value) => value || "—" },
    { title: "Moneda", width: 110, render: (_, row) => row.currency ? <Tag color="blue">{row.currency.code}</Tag> : <Tag>Sin asignar</Tag> },
    { title: "Unidad", width: 90, render: (_, row) => row.unit.symbol },
    { title: "Stock", width: 120, align: "right", render: (_, row) => row.balances.reduce((sum, balance) => sum.add(balance.onHandQuantity), new Decimal(0)).toFixed(3) },
    { title: "Disponible", width: 120, align: "right", render: (_, row) => row.balances.reduce((sum, balance) => sum.add(balance.onHandQuantity).sub(balance.reservedQuantity), new Decimal(0)).toFixed(3) },
    { title: "Stock mínimo", dataIndex: "minimumStock", width: 130, align: "right", render: (value) => new Decimal(value).toFixed(3) },
    { title: "Valor inventario", width: 150, align: "right", render: (_, row) => `S/ ${row.balances.reduce((sum, balance) => sum.add(balance.inventoryValue), new Decimal(0)).toFixed(2)}` },
    { title: "Lotes", dataIndex: "lotTrackingMode", width: 110, render: (value: Item["lotTrackingMode"]) => ({ NONE: "No", OPTIONAL: "Opcional", REQUIRED: "Obligatorio" } as Record<string, string>)[value] ?? value },
    ...(canCreate ? [{ title: "Acciones", fixed: "right" as const, width: 100, render: (_: unknown, row: Item) => <Button size="small" icon={<EditOutlined />} onClick={() => { setEditingItem(row); itemForm.setFieldsValue({ name: row.name, abbreviation: row.abbreviation, type: row.type as ItemForm["type"], unitId: options.data?.units.find((unit) => unit.code === row.unit.code)?.id, supplierId: row.supplier?.id, currencyId: row.currency?.id, minimumStock: Number(row.minimumStock), lotTrackingMode: row.lotTrackingMode as ItemForm["lotTrackingMode"], active: row.active, supplierProductCode: row.supplierProductCode ?? undefined, referenceNetPrice: row.referenceNetPrice ? Number(row.referenceNetPrice) : undefined, referenceTaxRate: row.referenceTaxRate ? Number(row.referenceTaxRate) : undefined }); setItemOpen(true); }}>Editar</Button> }] : []),
  ];

  return <>
    <div className="page-heading"><ModuleHeadingIntro title="Almacén" eyebrow="Operativo" description="Administra materias primas, productos terminados, existencias, costo promedio y stock mínimo." /><Space wrap className="module-actions"><Button icon={<ReloadOutlined />} onClick={() => inventory.refetch()}>Actualizar</Button><ModuleImportButton module="inventory" permissions={permissions} /><Link href="/dashboard/inventory/kardex"><Button icon={<HistoryOutlined />}>Ver kardex</Button></Link>{canOpenStock ? <Dropdown menu={{ items: [{ key: "opening", label: "Registrar saldo inicial" }], onClick: ({ key }) => { if (key === "opening") setOpeningOpen(true); } }} trigger={["click"]}><Button icon={<MoreOutlined />}>Más acciones</Button></Dropdown> : null}</Space></div>
    <Card className="section-card" title="Ítems y existencias" extra={canCreate ? <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingItem(undefined); itemForm.resetFields(); itemForm.setFieldsValue({ type: "RAW_MATERIAL", currencyId: options.data?.currencies.find((currency) => currency.isBase)?.id, minimumStock: 0, lotTrackingMode: "NONE", active: true, referenceTaxRate: companyIgvRate }); setItemOpen(true); }}>Nuevo ítem</Button> : null}>{inventory.error ? <Alert type="error" showIcon message={inventory.error.message} style={{ marginBottom: 16 }} /> : null}<Table rowKey="id" loading={inventory.isLoading} columns={columns} dataSource={inventory.data?.items ?? []} scroll={{ x: 1860 }} pagination={{ pageSize: 20 }} locale={{ emptyText: <Empty description="Aún no hay ítems registrados" /> }} /></Card>
    <Modal title={editingItem ? "Editar ítem de almacén" : "Nuevo ítem de almacén"} open={itemOpen} onCancel={() => { setItemOpen(false); setEditingItem(undefined); }} onOk={() => itemForm.submit()} okText={editingItem ? "Guardar cambios" : "Crear ítem"} confirmLoading={createItem.isPending || updateItem.isPending} width={680} destroyOnHidden>
      <Form form={itemForm} layout="vertical" onFinish={(values) => editingItem ? updateItem.mutate(values) : createItem.mutate(values)} initialValues={{ type: "RAW_MATERIAL", minimumStock: 0, lotTrackingMode: "NONE", active: true }}>
        {editingItem ? <Form.Item label="Código LK INNOVACIÓN"><Input disabled value={editingItem.code} /></Form.Item> : null}<Form.Item name="name" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="abbreviation" label="Sigla"><Input maxLength={30} placeholder="Ejemplo: PVC" /></Form.Item>
        <Form.Item name="type" label="Tipo" rules={[{ required: true }]}><Select disabled={Boolean(editingItem)} options={[{ value: "RAW_MATERIAL", label: "Materia prima" }, { value: "WASTE", label: "Merma" }, { value: "FINISHED_PRODUCT", label: "Producto terminado" }]} /></Form.Item>
        <div className="purchase-form-grid">
          <Form.Item name="supplierId" label="Proveedor" rules={[{ required: true, message: "Selecciona el proveedor." }]}><Select showSearch optionFilterProp="label" loading={options.isLoading} placeholder="Selecciona un proveedor activo" options={options.data?.suppliers.map((supplier) => ({ value: supplier.id, label: `${supplier.name} · ${supplier.code}` }))} /></Form.Item>
          <Form.Item name="currencyId" label="Moneda de referencia" rules={[{ required: true, message: "Selecciona la moneda." }]}><Select showSearch optionFilterProp="label" loading={options.isLoading} placeholder="Selecciona una moneda" options={options.data?.currencies.map((currency) => ({ value: currency.id, label: `${currency.code} · ${currency.name} (${currency.symbol})` }))} /></Form.Item>
        </div>
        <Form.Item name="supplierProductCode" label="Código de producto del proveedor"><Input maxLength={100} placeholder="Código con el que el proveedor identifica el producto" /></Form.Item>
        <div className="purchase-form-grid">
          <Form.Item name="referenceNetPrice" label="Precio neto de referencia"><InputNumber min={0} precision={6} style={{ width: "100%" }} placeholder="Precio sin IGV por unidad base" /></Form.Item>
          <Form.Item name="referenceTaxRate" label="IGV (%)"><InputNumber min={0} max={100} precision={2} style={{ width: "100%" }} /></Form.Item>
        </div>
        <Form.Item label="Costo total (con IGV)"><Input readOnly value={referenceTotal ? referenceTotal.toDecimalPlaces(4).toString() : ""} placeholder="Se calcula con el precio neto y el IGV" /></Form.Item>
        <Form.Item name="unitId" label="Unidad base" rules={[{ required: true }]}><Select loading={options.isLoading} options={options.data?.units.map((unit) => ({ value: unit.id, label: `${unit.code} · ${unit.name} (${unit.symbol})` }))} /></Form.Item>
        <Form.Item name="minimumStock" label="Stock mínimo" rules={[{ required: true }]}><InputNumber min={0} precision={3} style={{ width: "100%" }} /></Form.Item>
        <Form.Item name="lotTrackingMode" label="Control de lotes" rules={[{ required: true }]}><Select options={[{ value: "NONE", label: "Sin lotes" }, { value: "OPTIONAL", label: "Opcional" }, { value: "REQUIRED", label: "Obligatorio" }]} /></Form.Item>
        {editingItem ? <Form.Item name="active" valuePropName="checked"><Checkbox>Ítem activo</Checkbox></Form.Item> : null}
      </Form>
    </Modal>
    <Modal title="Registrar saldo inicial" open={openingOpen} onCancel={() => setOpeningOpen(false)} onOk={() => openingForm.submit()} okText="Registrar saldo" confirmLoading={createOpening.isPending} destroyOnHidden>
      <Alert type="warning" showIcon message="Uso excepcional de implementación" description="Registra aquí únicamente las existencias que ya tenía la fábrica antes de usar el sistema. Si el ítem ya tiene movimientos en el almacén o lote seleccionado, la operación será rechazada. Las correcciones posteriores deben realizarse mediante ajustes de inventario." style={{ marginBottom: 16 }} />
      <Form form={openingForm} layout="vertical" onFinish={(values) => createOpening.mutate(values)} initialValues={{ occurredAt: dayjs(), quantity: 1, unitCost: 0 }}>
        <Form.Item name="referenceNumber" label="Referencia del saldo inicial" rules={[{ required: true }]}><Input placeholder="SALDO-2026-0001" /></Form.Item>
        <Form.Item name="occurredAt" label="Fecha de corte" rules={[{ required: true }]}><DatePicker style={{ width: "100%" }} /></Form.Item>
        <Form.Item name="itemId" label="Ítem" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={options.data?.items.map((item) => ({ value: item.id, label: `${item.code} · ${item.name} (${item.unit.symbol})` }))} /></Form.Item>
        <Form.Item name="warehouseId" label="Almacén" rules={[{ required: true }]}><Select options={options.data?.warehouses.map((warehouse) => ({ value: warehouse.id, label: `${warehouse.code} · ${warehouse.name}` }))} /></Form.Item>
        <Form.Item name="quantity" label="Cantidad" rules={[{ required: true }]}><InputNumber min={0.001} precision={3} style={{ width: "100%" }} /></Form.Item>
        <Form.Item name="unitCost" label="Costo unitario con IGV (PEN)" rules={[{ required: true }]}><InputNumber min={0} precision={6} prefix="S/" style={{ width: "100%" }} /></Form.Item>
        <Form.Item name="lotCode" label="Código de lote"><Input placeholder="Según configuración del ítem" /></Form.Item>
      </Form>
    </Modal>
  </>;
}
