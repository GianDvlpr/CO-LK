"use client";

import {
  AppstoreOutlined, CheckOutlined, DeleteOutlined, EditOutlined, FileExcelOutlined,
  FilePdfOutlined, PlusOutlined, ReloadOutlined, RocketOutlined, UnorderedListOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, DatePicker, Divider, Empty, Form, Input, InputNumber, Modal, Segmented, Select, Space, Tag, Tooltip, Typography } from "antd";
import type { FormInstance } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import Decimal from "decimal.js";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ModuleHeadingIntro } from "@/components/common/module-heading-intro";
import { ResponsiveTable as Table } from "@/components/common/responsive-table";
import { TableSearch, matchesSearch } from "@/components/common/table-search";
import { ProductionKanban } from "@/components/production/production-kanban";
import { productionBoardTransition } from "@/modules/production/domain/production-board";

type Material = { id: string; plannedQuantity: string; consumedQuantity: string; actualWasteQuantity: string; item: { code: string; name: string; unit: { symbol: string } } };
type SizeProgram = { productVariantId: string; sku?: string; size: string; color?: string; requestedPairs: number; producedPairs?: number };
type Turn = { date: string; quantities: { productVariantId: string; sku?: string; size: string; quantity: number }[]; observations?: string };
type ComponentValue = { itemId: string; componentType: "CERCO_VIRA" | "INSERTO_PUNTA" | "INSERTO_TALON" | "OTRO"; quantity: number; colorDetail?: string };
type SheetValues = {
  operatorName?: string; modelLogo?: string; brandColor?: string; customerBrandId?: string | null;
  sizeProgram: SizeProgram[];
  productionTurns: { date: Dayjs; quantities: { productVariantId: string; sku?: string; size: string; quantity: number }[]; observations?: string }[];
  components: ComponentValue[];
  dailyProduction: [];
};
type Variant = {
  id: string; sku: string; productId: string;
  product: { id: string; code: string; matrixCode: string; name: string };
  size: { id: string; code: string; name: string; sortOrder: number };
  color: { id: string; code: string; name: string };
  secondaryColor?: { id: string; code: string; name: string };
};
export type Order = {
  id: string; number: string; status: string; priority: number; recipeRuns: string; secondaryRecipeRuns?: string;
  plannedQuantity: string; producedQuantity: string; plannedAt?: string; productionTurns?: Turn[];
  machineEquipment?: string;
  salesOrders: { salesOrder: { id: string; number: string; customer: { id: string; name: string } } }[]; materialItem?: { id: string; code: string; name: string; unit: { symbol: string } };
  machine?: { id: string; code: string; name: string; type: string; status: string };
  warehouse: { code: string; name: string };
  productVariant: Variant;
  recipeVersion: { version: number; recipe: { code: string; name: string } };
  secondaryRecipeVersion?: { version: number; recipe: { code: string; name: string } };
  materials: Material[];
  components: { id: string; componentType: string; quantity: string; colorDetail?: string; item: { id: string; code: string; name: string; unit: { symbol: string } } }[];
  operatorName?: string; modelLogo?: string; brandColor?: string; sizeProgram?: SizeProgram[];
  customerBrandId?: string | null;
};
type Options = {
  warehouses: { id: string; code: string; name: string }[];
  variants: Variant[];
  recipes: { id: string; productId: string; code: string; name: string; product: { id: string; code: string; name: string }; versions: { id: string; version: number; yieldQuantity: string; ingredients: { quantity: string; item: { id: string; code: string; name: string; unit: { symbol: string } } }[] }[] }[];
  machines: { id: string; code: string; name: string; type: string; status: string }[];
  materials: { id: string; code: string; name: string; type: string; unit: { symbol: string } }[];
  salesOrders: { id: string; number: string; customer: { id: string; name: string }; promisedAt?: string; lines: { id: string; productVariantId: string; quantity: string }[] }[];
  customerBrands: { id: string; customerId: string; name: string }[];
};
type FormValues = SheetValues & {
  warehouseId: string; recipeVersionId: string; secondaryRecipeVersionId?: string; salesOrderIds?: string[];
  materialItemId?: string; machineId?: string; priority: number; plannedAt?: Dayjs;
};
type CompleteValues = { outputs: { productVariantId: string; quantity: number }[]; waste: { productionMaterialId: string; quantity: number }[] };

const componentLabels: Record<ComponentValue["componentType"], string> = {
  CERCO_VIRA: "Cerco / vira", INSERTO_PUNTA: "Inserto punta", INSERTO_TALON: "Inserto talón", OTRO: "Otro detalle",
};
const statuses: Record<string, [string, string]> = {
  DRAFT: ["Pendiente", "blue"], RELEASED: ["Pendiente", "gold"], IN_PROGRESS: ["En curso", "processing"], COMPLETED: ["Finalizada", "green"], CANCELLED: ["Cancelada", "default"],
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo completar la operación.");
  return payload.data;
}

function colorLabel(variant: Variant) {
  return variant.secondaryColor ? `${variant.color.name} / ${variant.secondaryColor.name}` : variant.color.name;
}

function colorPair(variant: Variant) {
  return `${variant.color.id}:${variant.secondaryColor?.id ?? ""}`;
}

function calculatePlannedRecipeConsumption(plannedPairs: number, recipes: (Options["recipes"][number] | undefined)[]) {
  if (plannedPairs <= 0) return [];
  const totals = new Map<string, { code: string; name: string; unit: string; quantity: Decimal }>();
  for (const recipe of recipes) {
    const version = recipe?.versions[0];
    if (!version) continue;
    const executions = new Decimal(plannedPairs).div(version.yieldQuantity);
    for (const ingredient of version.ingredients) {
      const current = totals.get(ingredient.item.id);
      const quantity = new Decimal(ingredient.quantity).mul(executions);
      totals.set(ingredient.item.id, {
        code: ingredient.item.code,
        name: ingredient.item.name,
        unit: ingredient.item.unit.symbol,
        quantity: (current?.quantity ?? new Decimal(0)).add(quantity).toDecimalPlaces(6),
      });
    }
  }
  return Array.from(totals.values()).sort((left, right) => left.name.localeCompare(right.name));
}

function setVariantSnapshot(form: FormInstance, path: "sizeProgram" | "productionTurns", fieldName: number, variant: Variant, turnIndex?: number) {
  const base: (string | number)[] = path === "sizeProgram" ? [path, fieldName] : [path, turnIndex!, "quantities", fieldName];
  form.setFieldValue([...base, "sku"], variant.sku);
  form.setFieldValue([...base, "size"], variant.size.name);
  if (path === "sizeProgram") form.setFieldValue([...base, "color"], colorLabel(variant));
}

function ProductionDetailsFields({ form, variants, materials, customerBrands = [], structureLocked = false }: { form: FormInstance; variants: Variant[]; materials: Options["materials"]; customerBrands?: Options["customerBrands"]; structureLocked?: boolean }) {
  const program = (Form.useWatch("sizeProgram", form) ?? []) as SizeProgram[];
  const firstVariant = variants.find((item) => item.id === program.find((item) => item?.productVariantId)?.productVariantId);
  const compatibleVariants = firstVariant ? variants.filter((item) => colorPair(item) === colorPair(firstVariant)) : variants;
  const programmedVariants = program.map((item) => variants.find((variant) => variant.id === item?.productVariantId)).filter((item): item is Variant => Boolean(item));

  return <>
    <Divider titlePlacement="left">Datos técnicos</Divider>
    <div className="purchase-form-grid">
      <Form.Item name="operatorName" label="Operario"><Input maxLength={150} /></Form.Item>
      <Form.Item name="customerBrandId" label="Logo / marca registrado" tooltip="Logos/marcas registrados del cliente de los pedidos seleccionados."><Select allowClear showSearch optionFilterProp="label" disabled={structureLocked} placeholder={customerBrands.length ? "Selecciona un logo/marca" : "Sin logos/marcas registrados"} onChange={(id) => { const brand = customerBrands.find((item) => item.id === id); if (brand) form.setFieldValue("modelLogo", brand.name); }} options={customerBrands.map((brand) => ({ value: brand.id, label: brand.name }))} /></Form.Item>
      <Form.Item name="modelLogo" label="Logo / marca"><Input maxLength={150} /></Form.Item>
      <Form.Item name="brandColor" label="Color de marca"><Input maxLength={150} /></Form.Item>
    </div>

    <Divider titlePlacement="left">Programación de pares por talla</Divider>
    {firstVariant ? <Alert type="info" showIcon message={`${firstVariant.product.matrixCode} · C1 ${firstVariant.color.name}${firstVariant.secondaryColor ? ` · C2 ${firstVariant.secondaryColor.name}` : " · Monocolor"}`} style={{ marginBottom: 12 }} /> : null}
    <Form.List name="sizeProgram">
      {(fields, { add, remove }) => <Space direction="vertical" style={{ width: "100%" }}>
        {fields.map((field) => <div key={field.key} className="purchase-form-grid">
          <Form.Item {...field} name={[field.name, "productVariantId"]} label="SKU / talla" rules={[{ required: true, message: "Selecciona una talla." }]}>
            <Select disabled={structureLocked} showSearch optionFilterProp="label" onChange={(id) => { const variant = variants.find((item) => item.id === id); if (variant) setVariantSnapshot(form, "sizeProgram", field.name, variant); }} options={compatibleVariants.map((variant) => ({ value: variant.id, label: `${variant.sku} · Talla ${variant.size.name} · ${colorLabel(variant)}`, disabled: program.some((item, index) => index !== field.name && item?.productVariantId === variant.id) }))} />
          </Form.Item>
          <Form.Item {...field} name={[field.name, "sku"]} hidden><Input /></Form.Item>
          <Form.Item {...field} name={[field.name, "size"]} hidden><Input /></Form.Item>
          <Form.Item {...field} name={[field.name, "color"]} hidden><Input /></Form.Item>
          <Form.Item {...field} name={[field.name, "requestedPairs"]} label="Pares a fabricar" rules={[{ required: true }]}><InputNumber disabled={structureLocked} min={1} precision={0} style={{ width: "100%" }} /></Form.Item>
          {!structureLocked ? <Form.Item label=" "><Button danger type="text" icon={<DeleteOutlined />} onClick={() => remove(field.name)}>Quitar</Button></Form.Item> : null}
        </div>)}
        {!structureLocked ? <Button type="dashed" icon={<PlusOutlined />} disabled={!variants.length} onClick={() => add({ requestedPairs: 1 })}>Agregar talla</Button> : null}
      </Space>}
    </Form.List>

    <Divider titlePlacement="left">Componentes integrados</Divider>
    <Form.List name="components">
      {(fields, { add, remove }) => <Space direction="vertical" style={{ width: "100%" }}>
        {fields.map((field) => <div key={field.key} className="purchase-form-grid">
          <Form.Item {...field} name={[field.name, "componentType"]} label="Componente" rules={[{ required: true }]}><Select disabled={structureLocked} options={Object.entries(componentLabels).map(([value, label]) => ({ value, label }))} /></Form.Item>
          <Form.Item {...field} name={[field.name, "itemId"]} label="Artículo" tooltip="Ítem de almacén: materia prima, merma o componente." rules={[{ required: true }]}><Select disabled={structureLocked} showSearch optionFilterProp="label" options={materials.map((item) => ({ value: item.id, label: `${item.code} · ${item.name} · ${item.unit.symbol}` }))} /></Form.Item>
          <Form.Item {...field} name={[field.name, "quantity"]} label="Cantidad total" rules={[{ required: true }]}><InputNumber disabled={structureLocked} min={0.000001} precision={6} style={{ width: "100%" }} /></Form.Item>
          <Form.Item {...field} name={[field.name, "colorDetail"]} label="Color / detalle"><Input disabled={structureLocked} maxLength={150} suffix={!structureLocked ? <Button danger type="text" size="small" icon={<DeleteOutlined />} onClick={() => remove(field.name)} /> : undefined} /></Form.Item>
        </div>)}
        {!structureLocked ? <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ componentType: "OTRO", quantity: 1 })}>Agregar componente opcional</Button> : null}
      </Space>}
    </Form.List>

    <Divider titlePlacement="left">Control de producción por turno</Divider>
    <Form.List name="productionTurns">
      {(fields, { add, remove }) => <Space direction="vertical" style={{ width: "100%" }}>
        {fields.map((field, turnIndex) => <Card key={field.key} size="small" title={`Turno ${turnIndex + 1}`} extra={<Button danger type="text" icon={<DeleteOutlined />} onClick={() => remove(field.name)}>Quitar</Button>}>
          <Form.Item {...field} name={[field.name, "date"]} label="Fecha" rules={[{ required: true }]}><DatePicker style={{ width: "100%" }} /></Form.Item>
          <Form.List name={[field.name, "quantities"]}>
            {(quantityFields) => <div className="purchase-form-grid">{quantityFields.map((quantityField) => {
              const variantId = form.getFieldValue(["productionTurns", field.name, "quantities", quantityField.name, "productVariantId"]);
              const variant = variants.find((item) => item.id === variantId);
              return <Form.Item {...quantityField} key={quantityField.key} name={[quantityField.name, "quantity"]} label={variant ? `Talla ${variant.size.name}` : "Cantidad"} rules={[{ required: true }]}>
                <InputNumber min={0} precision={0} style={{ width: "100%" }} />
              </Form.Item>;
            })}</div>}
          </Form.List>
          <Form.Item {...field} name={[field.name, "observations"]} label="Observaciones / incidencias"><Input.TextArea rows={2} maxLength={500} /></Form.Item>
        </Card>)}
        <Button type="dashed" icon={<PlusOutlined />} disabled={!programmedVariants.length} onClick={() => add({ date: dayjs(), quantities: programmedVariants.map((variant) => ({ productVariantId: variant.id, sku: variant.sku, size: variant.size.name, quantity: 0 })) })}>Agregar turno</Button>
      </Space>}
    </Form.List>
  </>;
}

function sheetPayload(values: SheetValues) {
  return {
    ...values,
    customerBrandId: values.customerBrandId ?? null,
    productionTurns: (values.productionTurns ?? []).map((turn) => ({ ...turn, date: turn.date.format("YYYY-MM-DD") })),
    components: values.components ?? [], sizeProgram: values.sizeProgram ?? [], dailyProduction: [],
  };
}

function orderToSheet(order: Order, variants: Variant[]): SheetValues {
  const productVariants = variants.filter((variant) => variant.product.id === order.productVariant.product.id);
  const sizeProgram = (order.sizeProgram ?? []).map((item) => {
    if (item.productVariantId) return item;
    const variant = productVariants.find((candidate) => candidate.size.name.replace(/^Talla\s+/i, "") === item.size.replace(/^Talla\s+/i, "") && (!item.color || colorLabel(candidate).toLocaleUpperCase() === item.color.toLocaleUpperCase()));
    return variant ? { ...item, productVariantId: variant.id, sku: variant.sku, size: variant.size.name, color: colorLabel(variant) } : null;
  }).filter((item): item is SizeProgram => Boolean(item));
  return {
    operatorName: order.operatorName, modelLogo: order.modelLogo, brandColor: order.brandColor,
    customerBrandId: order.customerBrandId ?? undefined,
    sizeProgram,
    productionTurns: (order.productionTurns ?? []).map((turn) => ({ ...turn, date: dayjs(turn.date) })),
    components: order.components.map((component) => ({ itemId: component.item.id, componentType: component.componentType as ComponentValue["componentType"], quantity: Number(component.quantity), colorDetail: component.colorDetail })),
    dailyProduction: [],
  };
}

export function ProductionWorkspace({ permissions }: { permissions: string[] }) {
  const searchParams = useSearchParams();
  const requestedRecipeVersionId = searchParams.get("recipeVersionId") ?? undefined;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(Boolean(requestedRecipeVersionId));
  const [editOrder, setEditOrder] = useState<Order>();
  const [completeOrder, setCompleteOrder] = useState<Order>();
  const [viewMode, setViewMode] = useState<"list" | "board">("list");
  const [search, setSearch] = useState("");
  const [form] = Form.useForm<FormValues>();
  const [editForm] = Form.useForm<SheetValues>();
  const [completeForm] = Form.useForm<CompleteValues>();
  const recipeVersionId = Form.useWatch("recipeVersionId", form);
  const secondaryRecipeVersionId = Form.useWatch("secondaryRecipeVersionId", form);
  const program = (Form.useWatch("sizeProgram", form) ?? []) as SizeProgram[];
  const completeOutputs = Form.useWatch("outputs", completeForm) ?? [];
  const orders = useQuery({ queryKey: ["production"], queryFn: () => api<{ items: Order[] }>("/api/v1/production") });
  const filteredOrders = (orders.data?.items ?? []).filter((order) => matchesSearch(search, order.number, order.productVariant.sku, order.productVariant.product.name, order.machine?.name, order.machineEquipment));
  const options = useQuery({ queryKey: ["production-options"], queryFn: () => api<Options>("/api/v1/production/options") });
  const selectedRecipe = options.data?.recipes.find((recipe) => recipe.versions[0]?.id === recipeVersionId);
  const secondaryRecipe = options.data?.recipes.find((recipe) => recipe.versions[0]?.id === secondaryRecipeVersionId);
  const allowedVariants = selectedRecipe ? options.data?.variants.filter((variant) => variant.product.id === selectedRecipe.product.id) ?? [] : [];
  const firstProgramVariant = allowedVariants.find((variant) => variant.id === program.find((item) => item?.productVariantId)?.productVariantId);
  const editVariants = editOrder ? options.data?.variants.filter((variant) => variant.product.id === editOrder.productVariant.product.id) ?? [] : [];
  const selectedSalesOrderIds = Form.useWatch("salesOrderIds", form) ?? [];
  const selectedCustomerIds = [...new Set((options.data?.salesOrders ?? []).filter((order) => selectedSalesOrderIds.includes(order.id)).map((order) => order.customer.id))];
  const createBrands = selectedCustomerIds.length === 1 ? (options.data?.customerBrands ?? []).filter((brand) => brand.customerId === selectedCustomerIds[0]) : [];
  const editCustomerIds = [...new Set((editOrder?.salesOrders ?? []).map((link) => link.salesOrder.customer.id))];
  const editBrands = editCustomerIds.length === 1 ? (options.data?.customerBrands ?? []).filter((brand) => brand.customerId === editCustomerIds[0]) : [];
  const plannedPairs = program.reduce((sum, item) => sum + Number(item?.requestedPairs ?? 0), 0);
  const plannedRecipeConsumption = calculatePlannedRecipeConsumption(plannedPairs, [selectedRecipe, secondaryRecipe]);
  const refresh = async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["production"] }), queryClient.invalidateQueries({ queryKey: ["inventory"] }), queryClient.invalidateQueries({ queryKey: ["kardex"] }), queryClient.invalidateQueries({ queryKey: ["calendar"] }), queryClient.invalidateQueries({ queryKey: ["orders"] })]); };

  const create = useMutation({ mutationFn: (values: FormValues) => api("/api/v1/production", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...sheetPayload(values), warehouseId: values.warehouseId, recipeVersionId: values.recipeVersionId, secondaryRecipeVersionId: values.secondaryRecipeVersionId, salesOrderIds: values.salesOrderIds ?? [], materialItemId: values.materialItemId, machineId: values.machineId, priority: values.priority, plannedAt: values.plannedAt?.format("YYYY-MM-DD") }) }), onSuccess: async () => { toast.success("Orden creada en estado pendiente."); setOpen(false); form.resetFields(); await refresh(); }, onError: (error) => toast.error(error.message) });
  const update = useMutation({ mutationFn: ({ id, values }: { id: string; values: SheetValues }) => api(`/api/v1/production/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(sheetPayload(values)) }), onSuccess: async () => { toast.success("Orden de producción actualizada."); setEditOrder(undefined); editForm.resetFields(); await refresh(); }, onError: (error) => toast.error(error.message) });
  const transition = useMutation({ mutationFn: ({ id, action, body }: { id: string; action: string; body?: object }) => api(`/api/v1/production/${id}/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) }), onSuccess: async (_, variables) => { toast.success(variables.action === "release" ? "Materiales reservados." : variables.action === "start" ? "Orden iniciada y materiales descontados." : "Producción finalizada e ingresada al almacén."); setCompleteOrder(undefined); completeForm.resetFields(); await refresh(); }, onError: (error) => toast.error(error.message) });
  const startFromBoard = useMutation({ mutationFn: async (order: Order) => { if (order.status === "DRAFT") await api(`/api/v1/production/${order.id}/release`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); return api(`/api/v1/production/${order.id}/start`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); }, onSuccess: async () => { toast.success("Orden iniciada y materiales descontados del kardex."); await refresh(); }, onError: (error) => toast.error(error.message) });

  const loadSalesOrders = (salesOrderIds: string[]) => {
    if (!salesOrderIds.length || !selectedRecipe) return form.setFieldsValue({ sizeProgram: [], productionTurns: [], customerBrandId: undefined });
    const selectedOrders = options.data?.salesOrders.filter((item) => salesOrderIds.includes(item.id)) ?? [];
    const candidates = selectedOrders.flatMap((salesOrder) => salesOrder.lines.map((line) => ({ line, variant: allowedVariants.find((variant) => variant.id === line.productVariantId) }))).filter((item): item is { line: Options["salesOrders"][number]["lines"][number]; variant: Variant } => Boolean(item.variant));
    if (!candidates.length) return toast.error("El pedido no tiene variantes del producto seleccionado.");
    const pair = colorPair(candidates[0].variant);
    const compatible = candidates.filter((item) => colorPair(item.variant) === pair);
    const compatibleVariantIds = new Set(compatible.map((item) => item.variant.id));
    const compatibleOrderIds = selectedOrders.filter((order) => order.lines.some((line) => compatibleVariantIds.has(line.productVariantId))).map((order) => order.id);
    if (compatibleOrderIds.length !== salesOrderIds.length) form.setFieldValue("salesOrderIds", compatibleOrderIds);
    const grouped = new Map<string, SizeProgram>();
    for (const { line, variant } of compatible) {
      const current = grouped.get(variant.id);
      grouped.set(variant.id, { productVariantId: variant.id, sku: variant.sku, size: variant.size.name, color: colorLabel(variant), requestedPairs: Number(line.quantity) + Number(current?.requestedPairs ?? 0) });
    }
    form.setFieldsValue({ sizeProgram: Array.from(grouped.values()).sort((a, b) => Number(a.size) - Number(b.size)), productionTurns: [], customerBrandId: undefined });
    if (compatible.length !== candidates.length) toast.info("Los pedidos contienen otras combinaciones de color; deberán producirse en otra orden.");
  };

  const openCompletion = (order: Order) => {
    const scheduled = order.sizeProgram ?? [];
    const turnTotals = new Map<string, number>();
    for (const turn of order.productionTurns ?? []) for (const item of turn.quantities) turnTotals.set(item.productVariantId, (turnTotals.get(item.productVariantId) ?? 0) + Number(item.quantity));
    const outputs = scheduled.length ? scheduled.map((item) => ({ productVariantId: item.productVariantId, quantity: turnTotals.get(item.productVariantId) || Number(item.requestedPairs) })) : [{ productVariantId: order.productVariant.id, quantity: Number(order.plannedQuantity) }];
    const waste = order.materials.map((material) => ({ productionMaterialId: material.id, quantity: Number(material.actualWasteQuantity ?? 0) }));
    setCompleteOrder(order); completeForm.setFieldsValue({ outputs, waste });
  };

  const columns: ColumnsType<Order> = [
    { title: "Orden", dataIndex: "number", width: 135, render: (value, row) => <><strong>{value}</strong><br /><Tag color={row.priority === 1 ? "red" : row.priority === 2 ? "gold" : "blue"}>Prioridad {row.priority}</Tag></> },
    { title: "Pedidos", width: 180, render: (_, row) => row.salesOrders.length ? row.salesOrders.map((link) => link.salesOrder.number).join(", ") : "—" },
    { title: "Producto / seriado", width: 300, render: (_, row) => <><strong>{row.productVariant.product.code} · {row.productVariant.product.name}</strong><br /><Typography.Text type="secondary">Matriz {row.productVariant.product.matrixCode} · {colorLabel(row.productVariant)} · Tallas {(row.sizeProgram ?? []).map((item) => item.size).join(", ")}</Typography.Text></> },
    { title: "Máquina", width: 180, render: (_, row) => row.machine ? `${row.machine.code} · ${row.machine.name}` : "—" },
    { title: "Planificado", dataIndex: "plannedQuantity", width: 110, align: "right", render: (value) => `${new Decimal(value).toFixed(0)} pares` },
    { title: "Producido", dataIndex: "producedQuantity", width: 110, align: "right", render: (value) => `${new Decimal(value).toFixed(0)} pares` },
    { title: "Estado", dataIndex: "status", width: 115, render: (value) => { const [label, color] = statuses[value] ?? [value, "default"]; return <Tag color={color}>{label}</Tag>; } },
    { title: "Acciones", fixed: "right", width: 430, render: (_, row) => <Space wrap>
      <Button size="small" icon={<FileExcelOutlined />} href={`/api/v1/production/${row.id}/export?format=xlsx`}>Excel</Button>
      <Button size="small" icon={<FilePdfOutlined />} href={`/api/v1/production/${row.id}/export?format=pdf`}>PDF</Button>
      {permissions.includes("production.create") && !["COMPLETED", "CANCELLED"].includes(row.status) ? <Button size="small" icon={<EditOutlined />} onClick={() => { setEditOrder(row); editForm.setFieldsValue(orderToSheet(row, options.data?.variants ?? [])); }}>Editar</Button> : null}
      {row.status === "DRAFT" && permissions.includes("production.release") ? <Button size="small" onClick={() => Modal.confirm({ title: `¿Liberar ${row.number}?`, content: "Se validará y reservará el stock de formulaciones y componentes.", okText: "Liberar", onOk: () => transition.mutateAsync({ id: row.id, action: "release" }) })}>Liberar</Button> : null}
      {row.status === "RELEASED" && permissions.includes("production.start") ? <Button size="small" type="primary" icon={<RocketOutlined />} onClick={() => Modal.confirm({ title: `¿Iniciar ${row.number}?`, content: "Se descontarán del kardex los materiales y componentes reservados.", okText: "Iniciar", onOk: () => transition.mutateAsync({ id: row.id, action: "start" }) })}>Iniciar</Button> : null}
      {row.status === "IN_PROGRESS" && permissions.includes("production.complete") ? <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => openCompletion(row)}>Finalizar</Button> : null}
    </Space> },
  ];
  const materialColumns: ColumnsType<Material> = [
    { title: "Código", render: (_, row) => <strong>{row.item.code}</strong> }, { title: "Material / componente", render: (_, row) => row.item.name },
    { title: "Planificado", align: "right", render: (_, row) => `${new Decimal(row.plannedQuantity).toFixed(3)} ${row.item.unit.symbol}` },
    { title: "Consumido", align: "right", render: (_, row) => `${new Decimal(row.consumedQuantity).toFixed(3)} ${row.item.unit.symbol}` },
    { title: "Merma real", align: "right", render: (_, row) => `${new Decimal(row.actualWasteQuantity ?? 0).toFixed(3)} ${row.item.unit.symbol}` },
  ];

  const moveOrder = (order: Order, targetStatus: string) => {
    if (transition.isPending || startFromBoard.isPending) return toast.info("Espera a que termine el movimiento anterior.");
    if (targetStatus === "IN_PROGRESS" && ["DRAFT", "RELEASED"].includes(order.status)) {
      const required = order.status === "DRAFT" ? ["production.release", "production.start"] : ["production.start"];
      if (required.some((permission) => !permissions.includes(permission))) return toast.error("No tienes permiso para iniciar esta orden.");
      return Modal.confirm({ title: `¿Iniciar ${order.number}?`, content: "Se reservarán y consumirán los materiales necesarios, actualizando el kardex.", okText: "Iniciar y mover", onOk: () => startFromBoard.mutateAsync(order) });
    }
    const boardTransition = productionBoardTransition(order.status, targetStatus);
    if (!boardTransition) return toast.info("Las órdenes deben avanzar una etapa a la vez.");
    if (!permissions.includes(boardTransition.permission)) return toast.error("No tienes permiso para realizar esta transición.");
    openCompletion(order);
  };

  return <>
    <div className="page-heading"><ModuleHeadingIntro title="Producción" eyebrow="Manufactura" description="Órdenes de fabricación por producto, formulación, talla y turno." /><Space wrap className="module-actions"><TableSearch value={search} onChange={setSearch} placeholder="Buscar orden, producto, SKU o máquina" /><Segmented value={viewMode} onChange={(value) => setViewMode(value as "list" | "board")} options={[{ value: "list", label: "Lista", icon: <UnorderedListOutlined /> }, { value: "board", label: "Tablero", icon: <AppstoreOutlined /> }]} /><Tooltip title="Actualizar"><Button icon={<ReloadOutlined />} aria-label="Actualizar" onClick={() => orders.refetch()} /></Tooltip><Button icon={<FilePdfOutlined />} href="/api/v1/production/blank">Formato en blanco</Button></Space></div>
    <Card className="section-card production-board-card" title={viewMode === "list" ? "Órdenes de producción" : "Tablero de producción"} extra={permissions.includes("production.create") ? <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>Nueva orden</Button> : null}>
      {orders.error ? <Alert type="error" showIcon message={orders.error.message} style={{ marginBottom: 16 }} /> : null}
      {viewMode === "list" ? <Table rowKey="id" loading={orders.isLoading} columns={columns} dataSource={filteredOrders} expandable={{ expandedRowRender: (row) => <Table rowKey="id" size="small" sticky={false} pagination={false} columns={materialColumns} dataSource={row.materials} /> }} scroll={{ x: 1510 }} pagination={{ pageSize: 8, pageSizeOptions: [8, 16, 32] }} locale={{ emptyText: <Empty description="Aún no hay órdenes de producción" /> }} /> : <ProductionKanban orders={filteredOrders} onMove={moveOrder} onOpen={(order) => { if (!permissions.includes("production.create")) return; setEditOrder(order); editForm.setFieldsValue(orderToSheet(order, options.data?.variants ?? [])); }} />}
    </Card>

    <Modal className="compact-form-modal" title="Nueva orden de producción" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText="Crear orden pendiente" confirmLoading={create.isPending} width={1180} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={(values) => create.mutate(values)} initialValues={{ recipeVersionId: requestedRecipeVersionId, priority: 2, plannedAt: dayjs(), sizeProgram: [], productionTurns: [], components: [], dailyProduction: [] }}>
        <Divider titlePlacement="left">Orden y formulaciones</Divider>
        <div className="purchase-form-grid">
          <Form.Item name="warehouseId" label="Almacén" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={options.data?.warehouses.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))} /></Form.Item>
          <Form.Item name="plannedAt" label="Fecha programada" rules={[{ required: true }]}><DatePicker style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="priority" label="Prioridad" rules={[{ required: true }]}><Select options={[1, 2, 3].map((value) => ({ value, label: `Prioridad ${value}` }))} /></Form.Item>
          <Form.Item name="machineId" label="Máquina"><Select allowClear showSearch optionFilterProp="label" options={options.data?.machines.map((machine) => ({ value: machine.id, label: `${machine.code} · ${machine.name}${machine.status === "MAINTENANCE" ? " · En mantenimiento" : ""}` }))} /></Form.Item>
          <Form.Item name="recipeVersionId" label="Formulación C1" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" onChange={() => form.setFieldsValue({ secondaryRecipeVersionId: undefined, salesOrderIds: [], sizeProgram: [], productionTurns: [], customerBrandId: undefined })} options={options.data?.recipes.filter((recipe) => recipe.versions[0]).map((recipe) => ({ value: recipe.versions[0].id, label: `${recipe.code} · ${recipe.name} · ${recipe.versions[0].yieldQuantity} pares` }))} /></Form.Item>
          <Form.Item name="secondaryRecipeVersionId" label="Formulación C2"><Select allowClear showSearch optionFilterProp="label" options={options.data?.recipes.filter((recipe) => recipe.productId === selectedRecipe?.productId && recipe.versions[0]?.id !== recipeVersionId).map((recipe) => ({ value: recipe.versions[0].id, label: `${recipe.code} · ${recipe.name} · ${recipe.versions[0].yieldQuantity} pares` }))} /></Form.Item>
          <Form.Item name="salesOrderIds" label="Pedidos" tooltip="Pedidos de cliente vinculados a la orden; puedes seleccionar varios."><Select mode="multiple" maxTagCount="responsive" allowClear showSearch optionFilterProp="label" placeholder="Selecciona uno o varios pedidos" onChange={loadSalesOrders} options={options.data?.salesOrders.filter((order) => order.lines.some((line) => allowedVariants.some((variant) => variant.id === line.productVariantId))).map((order) => ({ value: order.id, label: `${order.number} · ${order.customer.name}${order.promisedAt ? ` · ${dayjs(order.promisedAt).format("DD/MM/YYYY")}` : ""}` }))} /></Form.Item>
          <Form.Item name="materialItemId" label="Material"><Select allowClear showSearch optionFilterProp="label" options={options.data?.materials.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))} /></Form.Item>
        </div>
        {selectedRecipe ? <Alert
          type={firstProgramVariant?.secondaryColor && !secondaryRecipe ? "warning" : "info"}
          showIcon
          message={`${plannedPairs} pares programados · C1 rinde ${new Decimal(selectedRecipe.versions[0].yieldQuantity).toFixed(0)} pares${secondaryRecipe ? ` · C2 rinde ${new Decimal(secondaryRecipe.versions[0].yieldQuantity).toFixed(0)} pares` : ""}`}
          description={firstProgramVariant?.secondaryColor && !secondaryRecipe
            ? "La variante bicolor requiere seleccionar la formulación C2."
            : <Space size={[4, 4]} wrap><Typography.Text>Consumo al iniciar:</Typography.Text>{plannedRecipeConsumption.length ? plannedRecipeConsumption.map((item) => <Tag key={item.code}>{item.code}: {item.quantity.toFixed(3)} {item.unit}</Tag>) : <Typography.Text type="secondary">agrega las tallas y pares para calcularlo</Typography.Text>}</Space>}
          style={{ marginBottom: 12 }}
        /> : null}
        <ProductionDetailsFields form={form} variants={allowedVariants} materials={options.data?.materials ?? []} customerBrands={createBrands} />
      </Form>
    </Modal>

    <Modal className="compact-form-modal" title={`Editar ${editOrder?.number ?? "orden"}`} open={Boolean(editOrder)} onCancel={() => setEditOrder(undefined)} onOk={() => editForm.submit()} okText="Guardar cambios" confirmLoading={update.isPending} width={1180} destroyOnHidden>
      <Form form={editForm} layout="vertical" onFinish={(values) => editOrder && update.mutate({ id: editOrder.id, values })}>
        {editOrder ? <Alert type="info" showIcon message={`${editOrder.recipeVersion.recipe.name}${editOrder.secondaryRecipeVersion ? ` + ${editOrder.secondaryRecipeVersion.recipe.name}` : ""} · ${editOrder.productVariant.product.matrixCode} · ${colorLabel(editOrder.productVariant)}`} style={{ marginBottom: 12 }} /> : null}
        <ProductionDetailsFields form={editForm} variants={editVariants} materials={options.data?.materials ?? []} customerBrands={editBrands} structureLocked={editOrder?.status !== "DRAFT"} />
      </Form>
    </Modal>

    <Modal className="compact-form-modal" title={`Finalizar ${completeOrder?.number ?? "orden"}`} open={Boolean(completeOrder)} onCancel={() => setCompleteOrder(undefined)} onOk={() => completeForm.submit()} okText="Ingresar productos terminados" confirmLoading={transition.isPending} width={820} destroyOnHidden>
      <Alert type="warning" showIcon message="Confirma la producción buena y la merma real del proceso." description={`Total a ingresar: ${completeOutputs.reduce((sum, item) => sum + Number(item?.quantity ?? 0), 0).toFixed(0)} pares. La merma se informa ahora porque puede variar en cada orden.`} style={{ marginBottom: 16 }} />
      <Form form={completeForm} layout="vertical" onFinish={(values) => completeOrder && transition.mutate({ id: completeOrder.id, action: "complete", body: values })}>
        <Form.List name="outputs">{(fields) => <Space direction="vertical" style={{ width: "100%" }}>{fields.map((field) => { const variantId = completeOutputs[field.name]?.productVariantId; const schedule = completeOrder?.sizeProgram?.find((item) => item.productVariantId === variantId); return <div key={field.key} className="purchase-form-grid"><Form.Item {...field} name={[field.name, "productVariantId"]} hidden><Input /></Form.Item><Form.Item label="SKU / talla"><Input disabled value={schedule ? `${schedule.sku} · Talla ${schedule.size}` : completeOrder?.productVariant.sku} /></Form.Item><Form.Item {...field} name={[field.name, "quantity"]} label="Cantidad buena" rules={[{ required: true }]}><InputNumber min={0} max={schedule?.requestedPairs ? Number(schedule.requestedPairs) : undefined} precision={0} style={{ width: "100%" }} /></Form.Item></div>; })}</Space>}</Form.List>
        <Divider titlePlacement="left">Merma real por material</Divider>
        <Form.List name="waste">{(fields) => <Space direction="vertical" style={{ width: "100%" }}>{fields.map((field) => { const material = completeOrder?.materials[field.name]; return <div key={field.key} className="purchase-form-grid"><Form.Item {...field} name={[field.name, "productionMaterialId"]} hidden><Input /></Form.Item><Form.Item label="Material"><Input disabled value={material ? `${material.item.code} · ${material.item.name}` : ""} /></Form.Item><Form.Item {...field} name={[field.name, "quantity"]} label={`Merma real${material ? ` (${material.item.unit.symbol})` : ""}`} rules={[{ required: true }]}><InputNumber min={0} max={material ? Number(material.consumedQuantity) : undefined} precision={6} style={{ width: "100%" }} /></Form.Item></div>; })}</Space>}</Form.List>
      </Form>
    </Modal>
  </>;
}
