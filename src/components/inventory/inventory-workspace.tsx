"use client";

import { AppstoreOutlined, DeleteOutlined, EditOutlined, HistoryOutlined, MoreOutlined, PlusOutlined, ReloadOutlined, ShopOutlined, TableOutlined, UploadOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, AutoComplete, Avatar, Button, Card, Checkbox, DatePicker, Dropdown, Empty, Form, Image, Input, InputNumber, Modal, Popconfirm, Segmented, Select, Space, Tag, Tooltip, Upload } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import Decimal from "decimal.js";
import { calculateReferenceTotalCost } from "@/modules/inventory/domain/reference-cost";
import { presentationBreakdown } from "@/modules/inventory/domain/default-presentation";
import { ModuleImportButton } from "@/components/imports/module-import-button";
import { ModuleHeadingIntro } from "@/components/common/module-heading-intro";
import { ResponsiveTable as Table } from "@/components/common/responsive-table";
import { TableSearch, matchesSearch } from "@/components/common/table-search";
import { WarehouseLayout } from "@/components/inventory/warehouse-layout";
import { PRESENTATION_TYPES } from "@/modules/purchases/domain/presentation-types";
import { CreatableSelect } from "@/components/common/quick-create/creatable-select";
import { ContactQuickCreateModal, CurrencyQuickCreateModal, UnitQuickCreateModal, WarehouseQuickCreateModal } from "@/components/common/quick-create/catalog-quick-create";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

type Balance = { warehouseId: string; onHandQuantity: string; reservedQuantity: string; averageUnitCost: string; inventoryValue: string };
type ItemImage = { id: string; secureUrl: string; fileName: string; sortOrder: number };
type Item = { id: string; code: string; abbreviation?: string; name: string; type: string; minimumStock: string; lotTrackingMode: string; active: boolean; supplierProductCode?: string | null; referenceNetPrice?: string | null; referenceTaxRate?: string | null; defaultPresentationType?: string | null; defaultPresentationContent?: string | null; defaultWarehouseId?: string | null; defaultWarehouse?: { code: string; name: string } | null; productVariants: { id: string; sku: string; product: { id: string; code: string; name: string } }[]; images: ItemImage[]; unit: { code: string; symbol: string }; supplier: { id: string; code: string; name: string } | null; currency: { id: string; code: string; name: string; symbol: string } | null; balances: Balance[] };
type Options = { units: { id: string; code: string; name: string; symbol: string }[]; warehouses: { id: string; code: string; name: string }[]; items: (Pick<Item, "id" | "code" | "name" | "lotTrackingMode" | "defaultWarehouseId"> & { unit: { symbol: string } })[]; suppliers: { id: string; code: string; name: string }[]; currencies: { id: string; code: string; name: string; symbol: string; isBase: boolean }[]; igvRate?: string };
type ItemForm = { name: string; abbreviation?: string; type: "RAW_MATERIAL" | "INTERMEDIATE" | "WASTE" | "FINISHED_PRODUCT"; unitId: string; supplierId?: string | null; currencyId?: string | null; minimumStock: number; lotTrackingMode: "NONE" | "OPTIONAL" | "REQUIRED"; active?: boolean; supplierProductCode?: string | null; referenceNetPrice?: number | null; referenceTaxRate?: number | null; defaultPresentationType?: string | null; defaultPresentationContent?: number | null; defaultWarehouseId?: string | null };
type OpeningForm = { referenceNumber: string; itemId: string; warehouseId: string; quantity: number; unitCost: number; lotCode?: string; occurredAt: Dayjs };
type PublishProductForm = { matrixCode: string; productName: string; colorCode: string; colorName: string };

async function api<T>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, init); const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo completar la operación."); return payload.data; }

export function InventoryWorkspace({ permissions, canCreate, canOpenStock, canManageImages, cloudinaryConfigured }: { permissions: string[]; canCreate: boolean; canOpenStock: boolean; canManageImages: boolean; cloudinaryConfigured: boolean }) {
  const queryClient = useQueryClient();
  const [itemOpen, setItemOpen] = useState(false);
  const [quickUnitOpen, setQuickUnitOpen] = useState(false);
  const [quickSupplierOpen, setQuickSupplierOpen] = useState(false);
  const [quickCurrencyOpen, setQuickCurrencyOpen] = useState(false);
  const [quickWarehouseOpen, setQuickWarehouseOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"items" | "layout">("items");
  const [search, setSearch] = useState("");
  const [editingItem, setEditingItem] = useState<Item>();
  const [openingOpen, setOpeningOpen] = useState(false);
  const [publishingItem, setPublishingItem] = useState<Item>();
  const [pendingImage, setPendingImage] = useState<File>();
  const [pendingPreview, setPendingPreview] = useState<string>();
  const [itemForm] = Form.useForm<ItemForm>();
  const [openingForm] = Form.useForm<OpeningForm>();
  const [publishForm] = Form.useForm<PublishProductForm>();
  const inventory = useQuery({ queryKey: ["inventory"], queryFn: () => api<{ items: Item[] }>("/api/v1/inventory") });
  const options = useQuery({ queryKey: ["inventory-options"], queryFn: () => api<Options>("/api/v1/inventory/options") });
  const referenceNetPrice = Form.useWatch("referenceNetPrice", itemForm);
  const referenceTaxRate = Form.useWatch("referenceTaxRate", itemForm);
  const itemType = Form.useWatch("type", itemForm);
  const selectedUnitId = Form.useWatch("unitId", itemForm);
  const defaultPresentationType = Form.useWatch("defaultPresentationType", itemForm);
  const defaultPresentationContent = Form.useWatch("defaultPresentationContent", itemForm);
  const selectedUnit = options.data?.units.find((unit) => unit.id === selectedUnitId);
  const filteredItems = (inventory.data?.items ?? []).filter((item) => matchesSearch(search, item.code, item.name, item.abbreviation, item.supplier?.name, item.supplierProductCode, item.defaultPresentationType));
  const companyIgvRate = options.data?.igvRate ? Number(options.data.igvRate) : 18;
  const referenceTotal = (() => {
    if (referenceNetPrice === null || referenceNetPrice === undefined) return null;
    try { return calculateReferenceTotalCost({ netPrice: referenceNetPrice, taxRate: referenceTaxRate ?? companyIgvRate }); } catch { return null; }
  })();
  const choosePendingImage = (file: File) => { if (pendingPreview) URL.revokeObjectURL(pendingPreview); setPendingImage(file); setPendingPreview(URL.createObjectURL(file)); };
  const clearPendingImage = () => { if (pendingPreview) URL.revokeObjectURL(pendingPreview); setPendingImage(undefined); setPendingPreview(undefined); };
  const createItem = useMutation({
    mutationFn: async (values: ItemForm) => {
      const created = await api<Item>("/api/v1/inventory", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(values) });
      if (pendingImage) {
        try {
          const body = new FormData(); body.append("file", pendingImage);
          await api(`/api/v1/inventory/${created.id}/images`, { method: "POST", body });
        } catch { toast.warning("El ítem se creó, pero la imagen no se pudo subir."); }
      }
      return created;
    },
    onSuccess: async () => { toast.success("Ítem creado."); setItemOpen(false); itemForm.resetFields(); clearPendingImage(); await Promise.all([queryClient.invalidateQueries({ queryKey: ["inventory"] }), queryClient.invalidateQueries({ queryKey: ["inventory-options"] })]); },
    onError: (error) => toast.error(error.message),
  });
  const updateItem = useMutation({ mutationFn: (values: ItemForm) => api(`/api/v1/inventory/${editingItem?.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(values) }), onSuccess: async () => { toast.success("Ítem actualizado."); setItemOpen(false); setEditingItem(undefined); itemForm.resetFields(); await Promise.all([queryClient.invalidateQueries({ queryKey: ["inventory"] }), queryClient.invalidateQueries({ queryKey: ["inventory-options"] })]); }, onError: (error) => toast.error(error.message) });
  const uploadItemImage = useMutation({ mutationFn: async (file: File) => { const body = new FormData(); body.append("file", file); return api<ItemImage>(`/api/v1/inventory/${editingItem!.id}/images`, { method: "POST", body }); }, onSuccess: async (image) => { setEditingItem((current) => current ? { ...current, images: [image] } : current); toast.success("Imagen cargada."); await queryClient.invalidateQueries({ queryKey: ["inventory"] }); }, onError: (error) => toast.error(error.message) });
  const deleteItemImage = useMutation({ mutationFn: (imageId: string) => api(`/api/v1/inventory/${editingItem!.id}/images/${imageId}`, { method: "DELETE" }), onSuccess: async (_data, imageId) => { setEditingItem((current) => current ? { ...current, images: current.images.filter((image) => image.id !== imageId) } : current); toast.success("Imagen eliminada."); await queryClient.invalidateQueries({ queryKey: ["inventory"] }); }, onError: (error) => toast.error(error.message) });
  const createOpening = useMutation({ mutationFn: (values: OpeningForm) => api("/api/v1/inventory/opening", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...values, occurredAt: values.occurredAt.format("YYYY-MM-DD") }) }), onSuccess: async () => { toast.success("Stock inicial contabilizado."); setOpeningOpen(false); openingForm.resetFields(); await queryClient.invalidateQueries({ queryKey: ["inventory"] }); }, onError: (error) => toast.error(error.message) });
  const publishProduct = useMutation({ mutationFn: (values: PublishProductForm) => api(`/api/v1/inventory/${publishingItem?.id}/publish-product`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(values) }), onSuccess: async () => { toast.success("El insumo quedó disponible también como producto, sin duplicar el stock."); setPublishingItem(undefined); publishForm.resetFields(); await Promise.all([queryClient.invalidateQueries({ queryKey: ["inventory"] }), queryClient.invalidateQueries({ queryKey: ["products"] })]); }, onError: (error) => toast.error(error.message) });
  const deleteItem = useMutation({ mutationFn: (id: string) => api(`/api/v1/inventory/${id}`, { method: "DELETE" }), onSuccess: async () => { toast.success("Ítem eliminado."); await Promise.all([queryClient.invalidateQueries({ queryKey: ["inventory"] }), queryClient.invalidateQueries({ queryKey: ["inventory-options"] })]); }, onError: (error) => toast.error(error.message) });

  const columns: ColumnsType<Item> = [
    { title: "", width: 70, fixed: "left", render: (_, row) => row.images?.[0] ? <Avatar shape="square" size={44} src={row.images[0].secureUrl} alt={row.images[0].fileName} /> : <Avatar shape="square" size={44}>{row.code.slice(0, 2)}</Avatar> },
    { title: "Código", dataIndex: "code", width: 150, fixed: "left", render: (value) => <strong>{value}</strong> },
    { title: "Ítem", dataIndex: "name", width: 260, render: (value, row) => <>{value}{row.abbreviation ? <><br /><Tag>{row.abbreviation}</Tag></> : null}</> },
    { title: "Tipo", dataIndex: "type", width: 180, render: (value, row) => {
      const types: Record<string, { label: string; color: string }> = {
        RAW_MATERIAL: { label: "Materia prima", color: "blue" },
        INTERMEDIATE: { label: "Insumo elaborado", color: "cyan" },
        WASTE: { label: "Merma", color: "orange" },
        FINISHED_PRODUCT: { label: "Producto terminado", color: "purple" },
      };
      const type = types[value] ?? { label: value, color: "default" };
      return <><Tag color={type.color}>{type.label}</Tag>{row.productVariants.length ? <><br /><Tag color="green">Vendible</Tag></> : null}</>;
    } },
    { title: "Proveedor", width: 220, render: (_, row) => row.supplier ? <>{row.supplier.name}<br /><Tag>{row.supplier.code}</Tag></> : <Tag>Sin asignar</Tag> },
    { title: "Código del proveedor", dataIndex: "supplierProductCode", width: 170, render: (value) => value || "—" },
    { title: "Sector", width: 120, render: (_, row) => row.defaultWarehouse ? <Tag color="geekblue">{row.defaultWarehouse.code}</Tag> : "—" },
    { title: "Moneda", width: 110, render: (_, row) => row.currency ? <Tag color="blue">{row.currency.code}</Tag> : <Tag>Sin asignar</Tag> },
    { title: "Unidad", width: 90, render: (_, row) => row.unit.symbol },
    { title: "Presentación", width: 180, render: (_, row) => row.defaultPresentationType && row.defaultPresentationContent ? `${row.defaultPresentationType} de ${new Decimal(row.defaultPresentationContent).toFixed()} ${row.unit.symbol}` : "—" },
    { title: "Stock", width: 250, align: "right", render: (_, row) => {
      const stock = row.balances.reduce((sum, balance) => sum.add(balance.onHandQuantity), new Decimal(0));
      const breakdown = presentationBreakdown(stock, row.defaultPresentationType, row.defaultPresentationContent, row.unit.symbol);
      return <><strong>{stock.toFixed(3)}</strong>{breakdown ? <><br /><span className="table-secondary">Equivalencia estimada: {breakdown}</span></> : null}</>;
    } },
    { title: "Disponible", width: 120, align: "right", render: (_, row) => row.balances.reduce((sum, balance) => sum.add(balance.onHandQuantity).sub(balance.reservedQuantity), new Decimal(0)).toFixed(3) },
    { title: "Stock mínimo", dataIndex: "minimumStock", width: 130, align: "right", render: (value) => new Decimal(value).toFixed(3) },
    { title: "Valor inventario", width: 150, align: "right", render: (_, row) => `S/ ${row.balances.reduce((sum, balance) => sum.add(balance.inventoryValue), new Decimal(0)).toFixed(2)}` },
    { title: "Lotes", dataIndex: "lotTrackingMode", width: 110, render: (value: Item["lotTrackingMode"]) => ({ NONE: "No", OPTIONAL: "Opcional", REQUIRED: "Obligatorio" } as Record<string, string>)[value] ?? value },
    ...((canCreate || permissions.includes("products.create") || permissions.includes("inventory.delete")) ? [{ title: "Acciones", fixed: "right" as const, width: 300, render: (_: unknown, row: Item) => <Space>{canCreate ? <Button size="small" icon={<EditOutlined />} onClick={() => { setEditingItem(row); itemForm.setFieldsValue({ name: row.name, abbreviation: row.abbreviation, type: row.type as ItemForm["type"], unitId: options.data?.units.find((unit) => unit.code === row.unit.code)?.id, supplierId: row.supplier?.id, currencyId: row.currency?.id, minimumStock: Number(row.minimumStock), lotTrackingMode: row.lotTrackingMode as ItemForm["lotTrackingMode"], active: row.active, supplierProductCode: row.supplierProductCode ?? undefined, referenceNetPrice: row.referenceNetPrice ? Number(row.referenceNetPrice) : undefined, referenceTaxRate: row.referenceTaxRate != null ? Number(row.referenceTaxRate) : undefined, defaultPresentationType: row.defaultPresentationType ?? undefined, defaultPresentationContent: row.defaultPresentationContent ? Number(row.defaultPresentationContent) : undefined, defaultWarehouseId: row.defaultWarehouseId ?? undefined }); setItemOpen(true); }}>Editar</Button> : null}{permissions.includes("products.create") && row.type === "INTERMEDIATE" && !row.productVariants.length ? <Button size="small" icon={<ShopOutlined />} onClick={() => { setPublishingItem(row); publishForm.setFieldsValue({ matrixCode: row.code, productName: row.name, colorCode: row.name.toUpperCase().includes("NEGRO") ? "NEG" : "EST", colorName: row.name.toUpperCase().includes("NEGRO") ? "Negro" : "Estándar" }); }}>Publicar</Button> : null}{permissions.includes("inventory.delete") ? <Button size="small" danger icon={<DeleteOutlined />} onClick={() => Modal.confirm({ title: `¿Eliminar ${row.code}?`, content: "Solo se elimina si nunca tuvo stock, movimientos ni referencias. Si ya se usó, desactívalo.", okText: "Eliminar", cancelText: "Cancelar", okButtonProps: { danger: true }, onOk: () => deleteItem.mutateAsync(row.id) })}>Eliminar</Button> : null}</Space> }] : []),
  ];

  return <>
    <div className="page-heading"><ModuleHeadingIntro title="Almacén" eyebrow="Operativo" description="Administra materias primas, productos terminados, existencias, costo promedio y stock mínimo." /><Space wrap className="module-actions">{viewMode === "items" ? <TableSearch value={search} onChange={setSearch} placeholder="Buscar código, nombre, sigla o proveedor" /> : null}<Segmented value={viewMode} onChange={(value) => setViewMode(value as "items" | "layout")} options={[{ value: "items", label: "Existencias", icon: <TableOutlined /> }, { value: "layout", label: "Plano", icon: <AppstoreOutlined /> }]} /><Tooltip title="Actualizar"><Button icon={<ReloadOutlined />} aria-label="Actualizar" onClick={() => viewMode === "items" ? inventory.refetch() : queryClient.invalidateQueries({ queryKey: ["warehouse-layout"] })} /></Tooltip>{viewMode === "items" ? <><ModuleImportButton module="inventory" permissions={permissions} /><Link href="/dashboard/inventory/kardex"><Button icon={<HistoryOutlined />}>Ver kardex</Button></Link>{canOpenStock ? <Dropdown menu={{ items: [{ key: "opening", label: "Registrar saldo inicial" }], onClick: ({ key }) => { if (key === "opening") setOpeningOpen(true); } }} trigger={["click"]}><Button icon={<MoreOutlined />}>Más acciones</Button></Dropdown> : null}</> : null}</Space></div>
    {viewMode === "items" ? <Card className="section-card" title="Ítems y existencias" extra={canCreate ? <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingItem(undefined); itemForm.resetFields(); clearPendingImage(); itemForm.setFieldsValue({ type: "RAW_MATERIAL", currencyId: options.data?.currencies.find((currency) => currency.isBase)?.id, minimumStock: 0, lotTrackingMode: "NONE", active: true, referenceTaxRate: companyIgvRate }); setItemOpen(true); }}>Nuevo ítem</Button> : null}>{inventory.error ? <Alert type="error" showIcon message={inventory.error.message} style={{ marginBottom: 16 }} /> : null}<Table rowKey="id" loading={inventory.isLoading} columns={columns} dataSource={filteredItems} scroll={{ x: 2300 }} pagination={{ pageSize: 8, pageSizeOptions: [8, 16, 32] }} locale={{ emptyText: <Empty description="Aún no hay ítems registrados" /> }} /></Card> : <WarehouseLayout canManage={permissions.includes("catalogs.manage")} />}
    <Modal className="compact-form-modal" title={editingItem ? "Editar ítem de almacén" : "Nuevo ítem de almacén"} open={itemOpen} onCancel={() => { setItemOpen(false); setEditingItem(undefined); clearPendingImage(); }} onOk={() => itemForm.submit()} okText={editingItem ? "Guardar cambios" : "Crear ítem"} confirmLoading={createItem.isPending || updateItem.isPending} width={920} destroyOnHidden>
      <Form form={itemForm} layout="vertical" onFinish={(values) => editingItem ? updateItem.mutate(values) : createItem.mutate(values)} initialValues={{ type: "RAW_MATERIAL", minimumStock: 0, lotTrackingMode: "NONE", active: true }}>
        <div className="modal-form-grid modal-form-grid-3">
          {editingItem ? <Form.Item label="Código LK INNOVACIÓN"><Input disabled value={editingItem.code} /></Form.Item> : null}
          <Form.Item className={editingItem ? undefined : "form-span-2"} name="name" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="abbreviation" label="Sigla"><Input maxLength={30} placeholder="Ejemplo: PVC" /></Form.Item>
          <Form.Item name="type" label="Tipo" tooltip={editingItem?.type === "FINISHED_PRODUCT" ? "Los productos terminados se gestionan desde Productos." : undefined} rules={[{ required: true }]}><Select disabled={editingItem?.type === "FINISHED_PRODUCT"} options={[{ value: "RAW_MATERIAL", label: "Materia prima" }, { value: "INTERMEDIATE", label: "Insumo elaborado" }, { value: "WASTE", label: "Merma" }, ...(!editingItem || editingItem.type === "FINISHED_PRODUCT" ? [{ value: "FINISHED_PRODUCT", label: "Producto terminado" }] : [])]} /></Form.Item>
          <Form.Item name="defaultWarehouseId" label="Sector" tooltip="Sector del almacén donde se ubica el ítem." rules={[{ required: itemType === "RAW_MATERIAL", message: "Selecciona el sector para la materia prima." }]}><CreatableSelect createLabel="Nuevo sector" createDisabled={!permissions.includes("catalogs.manage")} onCreate={() => setQuickWarehouseOpen(true)} allowClear showSearch optionFilterProp="label" loading={options.isLoading} placeholder={itemType === "RAW_MATERIAL" ? "Selecciona el sector" : "Opcional para este tipo de ítem"} options={options.data?.warehouses.map((warehouse) => ({ value: warehouse.id, label: `${warehouse.code} · ${warehouse.name}` }))} /></Form.Item>
          <Form.Item name="supplierId" label="Proveedor" rules={[{ required: itemType !== "INTERMEDIATE", message: "Selecciona el proveedor." }]}><CreatableSelect createLabel="Nuevo proveedor" createDisabled={!permissions.includes("catalogs.manage")} onCreate={() => setQuickSupplierOpen(true)} allowClear showSearch optionFilterProp="label" loading={options.isLoading} placeholder={itemType === "INTERMEDIATE" ? "Opcional para insumos elaborados" : "Selecciona un proveedor activo"} options={options.data?.suppliers.map((supplier) => ({ value: supplier.id, label: `${supplier.name} · ${supplier.code}` }))} /></Form.Item>
          <Form.Item name="currencyId" label="Moneda" tooltip="Moneda de referencia del ítem para el precio de compra." rules={[{ required: itemType !== "INTERMEDIATE", message: "Selecciona la moneda." }]}><CreatableSelect createLabel="Nueva moneda" createDisabled={!permissions.includes("catalogs.manage")} onCreate={() => setQuickCurrencyOpen(true)} allowClear showSearch optionFilterProp="label" loading={options.isLoading} placeholder={itemType === "INTERMEDIATE" ? "Opcional para insumos elaborados" : "Selecciona una moneda"} options={options.data?.currencies.map((currency) => ({ value: currency.id, label: `${currency.code} · ${currency.name} (${currency.symbol})` }))} /></Form.Item>
          <Form.Item name="supplierProductCode" label="Código de producto del proveedor"><Input maxLength={100} placeholder="Código del proveedor" /></Form.Item>
          <Form.Item name="referenceNetPrice" label={referenceTaxRate === 0 ? "Precio total" : "Precio neto"} tooltip={referenceTaxRate === 0 ? "Importe final por unidad base en la moneda del ítem; no se agrega IGV." : "Precio de referencia sin IGV por unidad base, en la moneda del ítem."}><InputNumber min={0} precision={6} style={{ width: "100%" }} placeholder={referenceTaxRate === 0 ? "Precio total por unidad base" : "Precio sin IGV por unidad base"} /></Form.Item>
          <Form.Item name="referenceTaxRate" hidden><Input /></Form.Item>
          <Form.Item label="IGV"><Segmented value={referenceTaxRate === 0 ? "EXCLUDED" : "INCLUDED"} onChange={(value) => itemForm.setFieldValue("referenceTaxRate", value === "EXCLUDED" ? 0 : companyIgvRate)} options={[{ value: "INCLUDED", label: `Con IGV (${companyIgvRate} %)` }, { value: "EXCLUDED", label: "Sin IGV (0 %)" }]} /></Form.Item>
          <Form.Item label="Costo total (con IGV)"><Input readOnly value={referenceTotal ? referenceTotal.toDecimalPlaces(4).toString() : ""} placeholder="Cálculo automático" /></Form.Item>
          <Form.Item name="unitId" label="Unidad base" rules={[{ required: true }]}><CreatableSelect createLabel="Nueva unidad" createDisabled={!permissions.includes("catalogs.manage")} onCreate={() => setQuickUnitOpen(true)} showSearch optionFilterProp="label" loading={options.isLoading} options={options.data?.units.map((unit) => ({ value: unit.id, label: `${unit.code} · ${unit.name} (${unit.symbol})` }))} /></Form.Item>
          <Form.Item name="defaultPresentationType" label="Tipo de presentación" tooltip="Presentación habitual informativa. No altera el stock ni el kardex." dependencies={["defaultPresentationContent"]} rules={[{ required: defaultPresentationContent !== null && defaultPresentationContent !== undefined, message: "Indica el tipo de presentación." }]}><AutoComplete allowClear options={PRESENTATION_TYPES.map((value) => ({ value }))} placeholder="Ejemplo: BOLSA" filterOption={(input, option) => String(option?.value ?? "").toLowerCase().includes(input.toLowerCase())} /></Form.Item>
          <Form.Item name="defaultPresentationContent" label="Contenido por presentación" tooltip="Capacidad de cada envase en la unidad base del ítem." dependencies={["defaultPresentationType"]} rules={[{ required: Boolean(defaultPresentationType), message: "Indica el contenido de la presentación." }]}><InputNumber min={0.000001} precision={6} style={{ width: "100%" }} addonAfter={selectedUnit?.symbol ?? "unidad"} placeholder="Ejemplo: 50" /></Form.Item>
          <Form.Item name="minimumStock" label="Stock mínimo" rules={[{ required: true }]}><InputNumber min={0} precision={3} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="lotTrackingMode" label="Control de lotes" rules={[{ required: true }]}><Select options={[{ value: "NONE", label: "Sin lotes" }, { value: "OPTIONAL", label: "Opcional" }, { value: "REQUIRED", label: "Obligatorio" }]} /></Form.Item>
        </div>
        {itemType === "RAW_MATERIAL" && canManageImages ? <Form.Item label="Imagen de la materia prima" extra={editingItem ? "Una imagen por materia prima." : "Se subirá al guardar el ítem."}>
          {!cloudinaryConfigured ? <Alert type="info" showIcon message="Cloudinary no está configurado; no se pueden subir imágenes." /> : editingItem ? (editingItem.images[0] ? <Space align="start"><Image src={editingItem.images[0].secureUrl} alt={editingItem.images[0].fileName} width={120} height={120} style={{ objectFit: "cover", borderRadius: 8 }} /><Popconfirm title="¿Eliminar la imagen?" description="También se eliminará de Cloudinary." okText="Eliminar" cancelText="Cancelar" okButtonProps={{ danger: true, loading: deleteItemImage.isPending }} onConfirm={() => deleteItemImage.mutate(editingItem.images[0].id)}><Button danger icon={<DeleteOutlined />} loading={deleteItemImage.isPending}>Eliminar</Button></Popconfirm></Space> : <Upload accept="image/jpeg,image/png,image/webp" showUploadList={false} disabled={uploadItemImage.isPending} beforeUpload={(file) => { uploadItemImage.mutate(file as File); return Upload.LIST_IGNORE; }}><Button icon={<UploadOutlined />} loading={uploadItemImage.isPending}>Subir imagen</Button></Upload>) : (pendingImage ? <Space align="start"><Image src={pendingPreview} alt={pendingImage.name} width={120} height={120} style={{ objectFit: "cover", borderRadius: 8 }} /><Button danger onClick={clearPendingImage}>Quitar</Button></Space> : <Upload accept="image/jpeg,image/png,image/webp" showUploadList={false} beforeUpload={(file) => { choosePendingImage(file as File); return Upload.LIST_IGNORE; }}><Button icon={<UploadOutlined />}>Seleccionar imagen</Button></Upload>)}
        </Form.Item> : null}
        {editingItem ? <Form.Item name="active" valuePropName="checked"><Checkbox>Ítem activo</Checkbox></Form.Item> : null}
      </Form>
    </Modal>
    <Modal className="compact-form-modal" title={`Publicar como producto · ${publishingItem?.code ?? ""}`} open={Boolean(publishingItem)} onCancel={() => setPublishingItem(undefined)} onOk={() => publishForm.submit()} okText="Publicar producto" confirmLoading={publishProduct.isPending} width={720} destroyOnHidden>
      <Alert type="info" showIcon message="Se reutilizará la misma existencia" description={`El ítem seguirá siendo un insumo elaborado en ${publishingItem?.unit.symbol ?? "su unidad base"}. Los pedidos, despachos y recetas moverán el mismo stock; no se creará una copia.`} style={{ marginBottom: 16 }} />
      <Form form={publishForm} layout="vertical" onFinish={(values) => publishProduct.mutate(values)}>
        <div className="modal-form-grid modal-form-grid-2">
          <Form.Item name="matrixCode" label="Código interno del producto" rules={[{ required: true }]}><Input maxLength={50} /></Form.Item>
          <Form.Item name="productName" label="Nombre comercial" rules={[{ required: true }]}><Input maxLength={150} /></Form.Item>
          <Form.Item name="colorCode" label="Código de color" rules={[{ required: true }]}><Input maxLength={30} /></Form.Item>
          <Form.Item name="colorName" label="Nombre del color" rules={[{ required: true }]}><Input maxLength={80} /></Form.Item>
        </div>
      </Form>
    </Modal>
    <Modal className="compact-form-modal" title="Registrar saldo inicial" open={openingOpen} onCancel={() => setOpeningOpen(false)} onOk={() => openingForm.submit()} okText="Registrar saldo" confirmLoading={createOpening.isPending} width={760} destroyOnHidden>
      <Alert type="warning" showIcon message="Uso excepcional de implementación" description="Registra aquí únicamente las existencias que ya tenía la fábrica antes de usar el sistema. Si el ítem ya tiene movimientos en el almacén o lote seleccionado, la operación será rechazada. Las correcciones posteriores deben realizarse mediante ajustes de inventario." style={{ marginBottom: 16 }} />
      <Form form={openingForm} layout="vertical" onFinish={(values) => createOpening.mutate(values)} initialValues={{ occurredAt: dayjs(), quantity: 1, unitCost: 0 }}>
        <div className="modal-form-grid modal-form-grid-2"><Form.Item name="referenceNumber" label="Referencia del saldo inicial" rules={[{ required: true }]}><Input placeholder="SALDO-2026-0001" /></Form.Item>
          <Form.Item name="occurredAt" label="Fecha de corte" rules={[{ required: true }]}><DatePicker style={{ width: "100%" }} /></Form.Item>
          <Form.Item className="form-span-all" name="itemId" label="Ítem" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" onChange={(value) => { const item = options.data?.items.find((candidate) => candidate.id === value); openingForm.setFieldValue("warehouseId", item?.defaultWarehouseId ?? undefined); }} options={options.data?.items.map((item) => ({ value: item.id, label: `${item.code} · ${item.name} (${item.unit.symbol})` }))} /></Form.Item>
          <Form.Item name="warehouseId" label="Almacén" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={options.data?.warehouses.map((warehouse) => ({ value: warehouse.id, label: `${warehouse.code} · ${warehouse.name}` }))} /></Form.Item>
          <Form.Item name="lotCode" label="Código de lote"><Input placeholder="Según configuración del ítem" /></Form.Item>
          <Form.Item name="quantity" label="Cantidad" rules={[{ required: true }]}><InputNumber min={0.001} precision={3} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="unitCost" label="Costo unitario con IGV (PEN)" rules={[{ required: true }]}><InputNumber min={0} precision={6} prefix="S/" style={{ width: "100%" }} /></Form.Item></div>
      </Form>
    </Modal>
    <UnitQuickCreateModal open={quickUnitOpen} onCancel={() => setQuickUnitOpen(false)} onCreated={(unit) => { itemForm.setFieldValue("unitId", unit.id); setQuickUnitOpen(false); }} />
    <ContactQuickCreateModal kind="SUPPLIER" open={quickSupplierOpen} onCancel={() => setQuickSupplierOpen(false)} onCreated={(supplier) => { itemForm.setFieldValue("supplierId", supplier.id); setQuickSupplierOpen(false); }} />
    <CurrencyQuickCreateModal open={quickCurrencyOpen} onCancel={() => setQuickCurrencyOpen(false)} onCreated={(currency) => { itemForm.setFieldValue("currencyId", currency.id); setQuickCurrencyOpen(false); }} />
    <WarehouseQuickCreateModal open={quickWarehouseOpen} onCancel={() => setQuickWarehouseOpen(false)} onCreated={(warehouse) => { itemForm.setFieldValue("defaultWarehouseId", warehouse.id); setQuickWarehouseOpen(false); }} />
  </>;
}
