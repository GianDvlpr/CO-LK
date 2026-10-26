"use client";

import { CheckOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, ExperimentOutlined, PlusOutlined, ReloadOutlined, RocketOutlined, StopOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Empty, Form, Input, InputNumber, Modal, Radio, Space, Tag, Tooltip, Typography } from "antd";
import type { FormInstance } from "antd";
import type { ColumnsType } from "antd/es/table";
import Decimal from "decimal.js";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { ResponsiveTable as Table } from "@/components/common/responsive-table";
import { TableSearch, matchesSearch } from "@/components/common/table-search";
import { ModuleHeadingIntro } from "@/components/common/module-heading-intro";
import { ModuleImportButton } from "@/components/imports/module-import-button";
import { CreatableSelect } from "@/components/common/quick-create/creatable-select";
import { ItemQuickCreateModal } from "@/components/common/quick-create/item-quick-create";
import { ProductCreateModal } from "@/components/common/quick-create/product-create-modal";
import { WarehouseQuickCreateModal } from "@/components/common/quick-create/catalog-quick-create";

type Material = { id: string; code: string; name: string; type?: string; lotTrackingMode?: string; active?: boolean; unitCost?: string; unit: { symbol: string } };
type Product = { id: string; code: string; name: string; variants: { sku: string; size: { name: string }; color: { name: string } }[] };
type Ingredient = { id: string; quantity: string; item: Material };
type Version = { id: string; version: number; yieldQuantity: string; calculatedCost?: string | null; manualCost?: string | null; isActive: boolean; notes?: string; ingredients: Ingredient[] };
type Recipe = { id: string; code: string; name: string; status: string; product: { id: string; code: string; name: string } | null; outputItem: Material | null; versions: Version[] };
type Options = { products: Product[]; materials: Material[]; outputItems: Material[]; warehouses: { id: string; code: string; name: string }[] };
type RecipeForm = { name: string; resultType: "PRODUCT" | "INVENTORY"; productId?: string; outputItemId?: string; yieldQuantity: number; notes?: string; manualCost?: number | null; ingredients: { itemId: string; quantity: number }[] };
type WarehouseForm = { warehouseId: string; outputQuantity: number; wasteQuantity: number; outputLotCode?: string; notes?: string };

async function api<T>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, init); const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo completar la operación."); return payload.data; }

function materialLabel(material: Material) {
  return `${material.code} · ${material.name} (${material.unit.symbol})${material.active === false ? " · ítem inactivo" : ""}`;
}

function IngredientQuantityField({ form, index, materials }: { form: FormInstance<RecipeForm>; index: number; materials: Material[] }) {
  const itemId = Form.useWatch(["ingredients", index, "itemId"], form);
  const unit = materials.find((material) => material.id === itemId)?.unit.symbol;
  return <Form.Item
    name={[index, "quantity"]}
    label={unit ? `Cantidad de material (${unit})` : "Cantidad de material"}
    extra="Cantidad total necesaria para obtener el rendimiento indicado."
    rules={[{ required: true }]}
  >
    <InputNumber min={0.000001} precision={6} addonAfter={unit ?? "unidad"} style={{ width: "100%" }} />
  </Form.Item>;
}

export function RecipesWorkspace({ permissions, canCreate, canActivate, canUpdate, canArchive }: { permissions: string[]; canCreate: boolean; canActivate: boolean; canUpdate: boolean; canArchive: boolean }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false); const [form] = Form.useForm<RecipeForm>();
  const [search, setSearch] = useState("");
  const [editingRecipe, setEditingRecipe] = useState<Recipe>();
  const [warehouseRecipe, setWarehouseRecipe] = useState<Recipe>(); const [warehouseForm] = Form.useForm<WarehouseForm>();
  const [quickProductOpen, setQuickProductOpen] = useState(false);
  const [quickOutputOpen, setQuickOutputOpen] = useState(false);
  const [quickIngredientIndex, setQuickIngredientIndex] = useState<number>();
  const [quickWarehouseOpen, setQuickWarehouseOpen] = useState(false);
  const resultType = Form.useWatch("resultType", form) ?? "PRODUCT";
  const outputItemId = Form.useWatch("outputItemId", form);
  const recipes = useQuery({ queryKey: ["recipes"], queryFn: () => api<{ items: Recipe[] }>("/api/v1/recipes") });
  const filteredRecipes = (recipes.data?.items ?? []).filter((recipe) => matchesSearch(search, recipe.code, recipe.name, recipe.product?.name, recipe.outputItem?.name));
  const options = useQuery({ queryKey: ["recipe-options"], queryFn: () => api<Options>("/api/v1/recipes/options") });
  const editIngredientFallbacks = editingRecipe ? (editingRecipe.versions[0]?.ingredients ?? []).map((ingredient) => ingredient.item).filter((item) => !(options.data?.materials ?? []).some((material) => material.id === item.id)) : [];
  const materialOptions = [...(options.data?.materials ?? []), ...editIngredientFallbacks];
  const outputUnit = options.data?.outputItems.find((item) => item.id === outputItemId)?.unit.symbol;
  const watchedIngredients = (Form.useWatch("ingredients", form) ?? []) as { itemId?: string; quantity?: number }[];
  const liveCalculatedCost = watchedIngredients.reduce((total, ingredient) => {
    if (!ingredient?.itemId || !ingredient.quantity) return total;
    const unitCost = materialOptions.find((material) => material.id === ingredient.itemId)?.unitCost;
    return total.add(new Decimal(ingredient.quantity).mul(new Decimal(unitCost ?? 0)));
  }, new Decimal(0));
  const refresh = async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["recipes"] }), queryClient.invalidateQueries({ queryKey: ["inventory"] }), queryClient.invalidateQueries({ queryKey: ["kardex"] })]); };
  const create = useMutation({ mutationFn: (values: RecipeForm) => api("/api/v1/recipes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...values, resultType: undefined }) }), onSuccess: async () => { toast.success("Receta creada como borrador; el stock no fue modificado."); setOpen(false); form.resetFields(); await refresh(); }, onError: (error) => toast.error(error.message) });
  const activate = useMutation({ mutationFn: (id: string) => api(`/api/v1/recipes/${id}/activate`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), onSuccess: async () => { toast.success("Versión activada y disponible para su destino."); await refresh(); }, onError: (error) => toast.error(error.message) });
  const update = useMutation({ mutationFn: ({ id, values }: { id: string; values: RecipeForm }) => api(`/api/v1/recipes/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: values.name, yieldQuantity: values.yieldQuantity, notes: values.notes, manualCost: values.manualCost ?? null, ingredients: values.ingredients }) }), onSuccess: async () => { toast.success("Receta actualizada."); setOpen(false); setEditingRecipe(undefined); form.resetFields(); await refresh(); }, onError: (error) => toast.error(error.message) });
  const archive = useMutation({ mutationFn: (id: string) => api(`/api/v1/recipes/${id}/archive`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), onSuccess: async () => { toast.success("Receta archivada."); await refresh(); }, onError: (error) => toast.error(error.message) });
  const remove = useMutation({ mutationFn: (id: string) => api(`/api/v1/recipes/${id}`, { method: "DELETE" }), onSuccess: async () => { toast.success("Receta eliminada."); await refresh(); }, onError: (error) => toast.error(error.message) });
  const openCreate = () => { setEditingRecipe(undefined); form.resetFields(); form.setFieldsValue({ resultType: "PRODUCT", yieldQuantity: 1, ingredients: [{}] }); setOpen(true); };
  const openEdit = (recipe: Recipe) => {
    const version = recipe.versions[0];
    if (!version) return;
    setEditingRecipe(recipe);
    form.resetFields();
    form.setFieldsValue({
      name: recipe.name,
      resultType: recipe.product ? "PRODUCT" : "INVENTORY",
      productId: recipe.product?.id,
      outputItemId: recipe.outputItem?.id,
      yieldQuantity: Number(version.yieldQuantity),
      notes: version.notes ?? undefined,
      manualCost: version.manualCost ? Number(version.manualCost) : undefined,
      ingredients: version.ingredients.map((ingredient) => ({ itemId: ingredient.item.id, quantity: Number(ingredient.quantity) })),
    });
    setOpen(true);
  };
  const produceToInventory = useMutation({ mutationFn: (values: WarehouseForm) => api(`/api/v1/recipes/${warehouseRecipe?.id}/produce-to-inventory`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(values) }), onSuccess: async () => { toast.success("Ingredientes descontados y producto resultante ingresado al almacén."); setWarehouseRecipe(undefined); warehouseForm.resetFields(); await refresh(); }, onError: (error) => toast.error(error.message) });
  const ingredientColumns: ColumnsType<Ingredient> = [
    { title: "Código", render: (_, row) => <strong>{row.item.code}</strong> }, { title: "Ingrediente", render: (_, row) => row.item.name },
    { title: "Cantidad estándar", align: "right", render: (_, row) => `${new Decimal(row.quantity).toFixed(3)} ${row.item.unit.symbol}` },
  ];
  const columns: ColumnsType<Recipe> = [
    { title: "Código", dataIndex: "code", width: 130, render: (value) => <strong>{value}</strong> },
    { title: "Receta", width: 260, render: (_, row) => <><strong>{row.name}</strong><br /><Typography.Text type="secondary">{row.product ? `${row.product.code} · ${row.product.name}` : row.outputItem ? `${row.outputItem.code} · ${row.outputItem.name}` : "Sin resultado"}</Typography.Text></> },
    { title: "Destino", width: 130, render: (_, row) => <Tag color={row.product ? "blue" : "purple"}>{row.product ? "Producción" : "Almacén"}</Tag> },
    { title: "Versión", width: 90, align: "center", render: (_, row) => row.versions[0]?.version ?? "—" },
    { title: "Rendimiento", width: 160, align: "right", render: (_, row) => row.product ? `${new Decimal(row.versions[0]?.yieldQuantity ?? 0).toFixed(0)} pares` : `${new Decimal(row.versions[0]?.yieldQuantity ?? 0).toFixed(3)} ${row.outputItem?.unit.symbol ?? "und."}` },
    { title: "Costo", width: 160, align: "right", render: (_, row) => <><strong>S/ {new Decimal(row.versions[0]?.calculatedCost ?? 0).toFixed(2)}</strong>{row.versions[0]?.manualCost !== null && row.versions[0]?.manualCost !== undefined ? <><br /><Typography.Text type="secondary">Manual: S/ {new Decimal(row.versions[0]?.manualCost ?? 0).toFixed(2)}</Typography.Text></> : null}</> },
    { title: "Ingredientes", width: 110, align: "center", render: (_, row) => row.versions[0]?.ingredients.length ?? 0 },
    { title: "Estado", dataIndex: "status", width: 105, render: (value) => <Tag color={value === "ACTIVE" ? "green" : value === "DRAFT" ? "blue" : "default"}>{value === "ACTIVE" ? "Activa" : value === "DRAFT" ? "Borrador" : "Inactiva"}</Tag> },
    { title: "Acciones", width: 480, render: (_, row) => <Space wrap>
      {canUpdate && row.status !== "INACTIVE" ? <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>Editar</Button> : null}
      {canActivate && (row.status === "INACTIVE" || !row.versions[0]?.isActive) ? <Button size="small" icon={<CheckOutlined />} loading={activate.isPending} onClick={() => Modal.confirm({ title: `¿${row.status === "INACTIVE" ? "Reactivar" : "Activar"} ${row.code}?`, content: "La última versión quedará disponible para su envío. Activarla no modifica el stock.", okText: row.status === "INACTIVE" ? "Reactivar" : "Activar", cancelText: "Cancelar", onOk: () => activate.mutateAsync(row.id) })}>{row.status === "INACTIVE" ? "Reactivar" : "Activar"}</Button> : null}
      {row.status === "ACTIVE" && row.product && permissions.includes("production.create") ? <Link href={`/dashboard/production?recipeVersionId=${row.versions.find((version) => version.isActive)?.id ?? row.versions[0]?.id}`}><Button size="small" type="primary" icon={<RocketOutlined />}>Enviar a Producción</Button></Link> : null}
      {row.status === "ACTIVE" && row.outputItem && canCreate && permissions.includes("inventory.create_item") ? <Button size="small" type="primary" icon={<ExperimentOutlined />} onClick={() => { setWarehouseRecipe(row); warehouseForm.setFieldsValue({ outputQuantity: Number((row.versions.find((version) => version.isActive) ?? row.versions[0])?.yieldQuantity ?? 1), wasteQuantity: 0 }); }}>Enviar a Almacén</Button> : null}
      {canArchive && row.status === "ACTIVE" ? <Button size="small" icon={<StopOutlined />} loading={archive.isPending} onClick={() => Modal.confirm({ title: `¿Archivar ${row.code}?`, content: "Dejará de estar disponible para Producción y Almacén. Puedes reactivarla después.", okText: "Archivar", cancelText: "Cancelar", okButtonProps: { danger: true }, onOk: () => archive.mutateAsync(row.id) })}>Archivar</Button> : null}
      {canArchive ? <Button size="small" danger icon={<DeleteOutlined />} loading={remove.isPending} onClick={() => Modal.confirm({ title: `¿Eliminar ${row.code}?`, content: "Solo se elimina si nunca se usó en órdenes de producción o transformaciones.", okText: "Eliminar", cancelText: "Cancelar", okButtonProps: { danger: true }, onOk: () => remove.mutateAsync(row.id) })}>Eliminar</Button> : null}
      <Button size="small" icon={<DownloadOutlined />} href={`/api/v1/recipes/${row.id}/print`}>PDF</Button>
    </Space> },
  ];
  return <>
    <div className="page-heading"><ModuleHeadingIntro title="Recetas" eyebrow="Formulaciones" description="Define una sola vez los ingredientes y decide si el resultado se envía a Producción o se elabora para ingresar a Almacén." /><Space wrap className="module-actions"><TableSearch value={search} onChange={setSearch} placeholder="Buscar código, nombre o producto" /><Tooltip title="Actualizar"><Button icon={<ReloadOutlined />} aria-label="Actualizar" onClick={() => recipes.refetch()} /></Tooltip><ModuleImportButton module="recipes" permissions={permissions} /></Space></div>
    <Card className="section-card" title="Recetas registradas" extra={canCreate ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Nueva receta</Button> : null}>{recipes.error ? <Alert type="error" showIcon message={recipes.error.message} style={{ marginBottom: 16 }} /> : null}<Table rowKey="id" loading={recipes.isLoading} columns={columns} dataSource={filteredRecipes} expandable={{ expandedRowRender: (row) => { const version = row.versions[0]; return version ? <><Typography.Text strong>Versión {version.version}{version.isActive ? " · activa" : ""}</Typography.Text><Typography.Paragraph type="secondary">Costo calculado: S/ {new Decimal(version.calculatedCost ?? 0).toFixed(2)}{version.manualCost !== null && version.manualCost !== undefined ? ` · Costo manual: S/ ${new Decimal(version.manualCost ?? 0).toFixed(2)}` : ""}</Typography.Paragraph>{version.notes ? <Typography.Paragraph type="secondary">{version.notes}</Typography.Paragraph> : null}<Table rowKey="id" size="small" sticky={false} pagination={false} columns={ingredientColumns} dataSource={version.ingredients} /></> : null; } }} scroll={{ x: 1440 }} pagination={{ pageSize: 8, pageSizeOptions: [8, 16, 32] }} locale={{ emptyText: <Empty description="Aún no hay recetas registradas" /> }} /></Card>
    <Modal className="compact-form-modal" title={editingRecipe ? `Editar ${editingRecipe.code}` : "Nueva receta"} open={open} onCancel={() => { setOpen(false); setEditingRecipe(undefined); }} onOk={() => form.submit()} okText={editingRecipe ? (editingRecipe.status === "DRAFT" ? "Guardar cambios" : "Guardar nueva versión") : "Crear borrador"} confirmLoading={create.isPending || update.isPending} width={900} destroyOnHidden>
      {!materialOptions.length ? <Alert type="warning" showIcon message="Primero registra los ingredientes en Almacén." style={{ marginBottom: 16 }} /> : null}
      {editingRecipe ? <Alert type="info" showIcon message={editingRecipe.status === "DRAFT" ? "Los cambios se aplican al borrador actual." : "Se guardará como una versión nueva; la versión activa seguirá disponible hasta que actives la nueva."} style={{ marginBottom: 16 }} /> : null}
      <Form form={form} layout="vertical" onFinish={(values) => editingRecipe ? update.mutate({ id: editingRecipe.id, values }) : create.mutate(values)} initialValues={{ resultType: "PRODUCT", yieldQuantity: 1, ingredients: [{}] }}>
        <Form.Item name="resultType" label="Destino del resultado"><Radio.Group optionType="button" buttonStyle="solid" disabled={Boolean(editingRecipe)} onChange={() => form.setFieldsValue({ productId: undefined, outputItemId: undefined })} options={[{ value: "PRODUCT", label: "Enviar a Producción" }, { value: "INVENTORY", label: "Ingresar a Almacén" }]} /></Form.Item>
        <div className="modal-form-grid modal-form-grid-3"><Form.Item name="name" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item>{resultType === "PRODUCT" ? <Form.Item name="productId" label="Producto final" rules={[{ required: true }]}><CreatableSelect createLabel="Nuevo producto" createDisabled={!permissions.includes("products.create")} onCreate={() => setQuickProductOpen(true)} disabled={Boolean(editingRecipe)} showSearch optionFilterProp="label" options={options.data?.products.map((product) => ({ value: product.id, label: `${product.code} · ${product.name}` }))} /></Form.Item> : <Form.Item name="outputItemId" label="Insumo resultante" tooltip="Debe existir previamente en Almacén como Insumo elaborado." rules={[{ required: true }]}><CreatableSelect createLabel="Nuevo insumo elaborado" createDisabled={!permissions.includes("inventory.create_item")} onCreate={() => setQuickOutputOpen(true)} disabled={Boolean(editingRecipe)} showSearch optionFilterProp="label" options={options.data?.outputItems.map((item) => ({ value: item.id, label: `${item.code} · ${item.name} (${item.unit.symbol})` }))} /></Form.Item>}<Form.Item name="yieldQuantity" label={resultType === "PRODUCT" ? "Rendimiento en pares" : `Rendimiento${outputUnit ? ` (${outputUnit})` : ""}`} extra={resultType === "PRODUCT" ? "Pares que se obtienen usando las cantidades de materiales indicadas abajo." : "Cantidad del insumo resultante por ejecución."} rules={[{ required: true }]}><InputNumber min={resultType === "PRODUCT" ? 1 : 0.000001} precision={resultType === "PRODUCT" ? 0 : 6} addonAfter={resultType === "PRODUCT" ? "pares" : outputUnit ?? "unidad"} style={{ width: "100%" }} /></Form.Item></div>
        <div className="modal-form-grid modal-form-grid-2">
          <Form.Item label="Costo calculado" extra="Se obtiene del costo promedio del almacén o del costo de referencia de cada material."><Tag color="blue" style={{ marginInlineEnd: 0, fontSize: 14 }}>S/ {liveCalculatedCost.toFixed(2)}</Tag></Form.Item>
          <Form.Item name="manualCost" label="Costo manual (opcional)" extra="Si lo dejas vacío se usa solo el costo calculado."><InputNumber min={0} precision={2} addonBefore="S/" style={{ width: "100%" }} /></Form.Item>
        </div>
        <Form.Item name="notes" label="Notas de versión"><Input.TextArea rows={2} /></Form.Item>
        <Form.List name="ingredients">{(fields, { add, remove }) => <Space direction="vertical" style={{ width: "100%" }}><Typography.Title level={5}>Materiales e insumos</Typography.Title>{fields.map((field, index) => <Card size="small" key={field.key} title={`Material ${index + 1}`} extra={fields.length > 1 ? <Button type="link" danger onClick={() => remove(field.name)}>Quitar</Button> : null}><div className="purchase-form-grid"><Form.Item name={[field.name, "itemId"]} label="Material o insumo" rules={[{ required: true }]}><CreatableSelect createLabel="Nuevo material" createDisabled={!permissions.includes("inventory.create_item")} onCreate={() => setQuickIngredientIndex(field.name)} showSearch optionFilterProp="label" options={materialOptions.map((material) => ({ value: material.id, label: materialLabel(material) }))} /></Form.Item><IngredientQuantityField form={form} index={field.name} materials={materialOptions} /></div></Card>)}<Button block icon={<PlusOutlined />} onClick={() => add({})}>Agregar material</Button></Space>}</Form.List>
      </Form>
    </Modal>
    <Modal className="compact-form-modal" title={`Enviar ${warehouseRecipe?.name ?? "receta"} a Almacén`} open={Boolean(warehouseRecipe)} onCancel={() => setWarehouseRecipe(undefined)} onOk={() => warehouseForm.submit()} okText="Elaborar e ingresar" confirmLoading={produceToInventory.isPending} width={720} destroyOnHidden>
      <Alert type="warning" showIcon message="Esta acción sí modifica existencias" description="Se descontarán los ingredientes según el rendimiento de la receta y se ingresará la cantidad obtenida al stock del almacén seleccionado." style={{ marginBottom: 16 }} />
      <Form form={warehouseForm} layout="vertical" onFinish={(values) => produceToInventory.mutate(values)}><div className="modal-form-grid modal-form-grid-2"><Form.Item className="form-span-all" name="warehouseId" label="Almacén" rules={[{ required: true }]}><CreatableSelect createLabel="Nuevo almacén" createDisabled={!permissions.includes("catalogs.manage")} onCreate={() => setQuickWarehouseOpen(true)} showSearch optionFilterProp="label" options={options.data?.warehouses.map((warehouse) => ({ value: warehouse.id, label: `${warehouse.code} · ${warehouse.name}` }))} /></Form.Item><Form.Item name="outputQuantity" label={`Cantidad obtenida (${warehouseRecipe?.outputItem?.unit.symbol ?? ""})`} rules={[{ required: true }]}><InputNumber min={0.000001} precision={6} style={{ width: "100%" }} /></Form.Item><Form.Item name="wasteQuantity" label="Merma real del proceso" rules={[{ required: true }]}><InputNumber min={0} precision={6} style={{ width: "100%" }} /></Form.Item>{warehouseRecipe?.outputItem?.lotTrackingMode !== "NONE" ? <Form.Item name="outputLotCode" label="Lote de salida" rules={warehouseRecipe?.outputItem?.lotTrackingMode === "REQUIRED" ? [{ required: true }] : undefined}><Input /></Form.Item> : null}<Form.Item className="form-span-all" name="notes" label="Observaciones"><Input.TextArea rows={2} /></Form.Item></div></Form>
    </Modal>
    <ItemQuickCreateModal open={quickOutputOpen} defaultType="INTERMEDIATE" allowedTypes={["INTERMEDIATE"]} onCancel={() => setQuickOutputOpen(false)} onCreated={(item) => { form.setFieldValue("outputItemId", item.id); setQuickOutputOpen(false); }} />
    <ItemQuickCreateModal open={quickIngredientIndex !== undefined} defaultType="RAW_MATERIAL" onCancel={() => setQuickIngredientIndex(undefined)} onCreated={(item) => { if (quickIngredientIndex !== undefined) form.setFieldValue(["ingredients", quickIngredientIndex, "itemId"], item.id); setQuickIngredientIndex(undefined); }} />
    <ProductCreateModal open={quickProductOpen} onCancel={() => setQuickProductOpen(false)} onCreated={(product) => { form.setFieldValue("productId", product.id); setQuickProductOpen(false); }} />
    <WarehouseQuickCreateModal open={quickWarehouseOpen} onCancel={() => setQuickWarehouseOpen(false)} onCreated={(warehouse) => { warehouseForm.setFieldValue("warehouseId", warehouse.id); setQuickWarehouseOpen(false); }} />
  </>;
}
