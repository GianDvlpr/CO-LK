"use client";

import { CheckOutlined, CloseCircleOutlined, PlusOutlined, ReloadOutlined, WhatsAppOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Alert, Button, Card, DatePicker, Divider, Empty, Form, Input, InputNumber, Modal, Segmented, Select, Space, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import Decimal from "decimal.js";
import { useRouter } from "next/navigation";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";
import { ModuleImportButton } from "@/components/imports/module-import-button";
import { ModuleHeadingIntro } from "@/components/common/module-heading-intro";
import { ResponsiveTable as Table } from "@/components/common/responsive-table";
import { TableSearch } from "@/components/common/table-search";
import { PRESENTATION_TYPES } from "@/modules/purchases/domain/presentation-types";
import { CreatableSelect } from "@/components/common/quick-create/creatable-select";
import { ContactQuickCreateModal, CurrencyQuickCreateModal, WarehouseQuickCreateModal } from "@/components/common/quick-create/catalog-quick-create";
import { ItemQuickCreateModal } from "@/components/common/quick-create/item-quick-create";
import { buildPurchaseRequestMessage, normalizeWhatsAppPhone } from "@/modules/purchases/domain/whatsapp-request";

type PurchaseLine = { id: string; lineNumber: number; presentationType: string; presentationQty: string; contentPerUnit: string; receivedQuantity: string; pricePerBaseUnit: string; taxRate: string; total: string; item: { code: string; name: string; supplierProductCode?: string | null; unit: { symbol: string }; images: { secureUrl: string }[] }; lots: { lot: { supplierLot: string | null } }[] };
type Purchase = {
  id: string; code: string; receptionDate: string; documentNumber: string; status: string;
  total: string; supplier: { code: string; name: string; phone?: string | null }; currency: { code: string }; lines: PurchaseLine[]; _count: { lines: number };
};
type Option = { id: string; code: string; name: string };
type ItemOption = Option & { supplierId?: string | null; lotTrackingMode: "NONE" | "OPTIONAL" | "REQUIRED"; supplierProductCode?: string | null; referenceNetPrice?: string | null; referenceTaxRate?: string | null; unit: { symbol: string }; supplier?: { id: string; name: string } | null };
type Options = { suppliers: Option[]; warehouses: Option[]; currencies: (Option & { isBase: boolean })[]; items: ItemOption[]; igvRate?: string };
type LineForm = { itemId?: string; presentationType?: string; presentationQuantity?: number; contentPerUnit?: number; pricePerBaseUnit?: number; taxRate?: number; lotCode?: string; supplierLot?: string };
type PurchaseForm = { supplierId: string; warehouseId: string; currencyId: string; receptionDate: Dayjs; documentNumber: string; exchangeRate: number; lines: LineForm[] };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo completar la operación.");
  return payload.data;
}

const statusColor: Record<string, string> = { PENDING: "gold", APPROVED: "green", REJECTED: "red", CANCELLED: "default", DRAFT: "blue" };
const statusLabel: Record<string, string> = { PENDING: "Pendiente", APPROVED: "Aprobada", REJECTED: "Rechazada", CANCELLED: "Anulada", DRAFT: "Borrador" };

export function PurchasesWorkspace({ permissions, canCreate, canApprove, canReject }: { permissions: string[]; canCreate: boolean; canApprove: boolean; canReject: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pickerLine, setPickerLine] = useState<number | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [quickSupplierOpen, setQuickSupplierOpen] = useState(false);
  const [quickWarehouseOpen, setQuickWarehouseOpen] = useState(false);
  const [quickCurrencyOpen, setQuickCurrencyOpen] = useState(false);
  const [quickItemOpen, setQuickItemOpen] = useState(false);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [form] = Form.useForm<PurchaseForm>();
  const watchedLines = Form.useWatch("lines", form) ?? [];
  const selectedSupplierId = Form.useWatch("supplierId", form);

  const purchases = useQuery({
    queryKey: ["purchases", page, pageSize, deferredSearch],
    queryFn: () => api<{ items: Purchase[]; total: number }>(`/api/v1/purchases?page=${page}&pageSize=${pageSize}&search=${encodeURIComponent(deferredSearch)}`),
    placeholderData: keepPreviousData,
  });
  const options = useQuery({
    queryKey: ["purchase-options"], queryFn: () => api<Options>("/api/v1/purchases/options"), enabled: open && canCreate,
  });

  const create = useMutation({
    mutationFn: (values: PurchaseForm) => api<Purchase>("/api/v1/purchases", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...values, receptionDate: values.receptionDate.format("YYYY-MM-DD"),
        lines: values.lines.map((line, index) => {
          const item = options.data?.items.find((candidate) => candidate.id === line.itemId);
          const quantity = new Decimal(line.presentationQuantity ?? 0).mul(line.contentPerUnit ?? 0).toString();
          return {
            lineNumber: index + 1, itemId: line.itemId, presentationType: line.presentationType,
            presentationQuantity: String(line.presentationQuantity),
            contentPerUnit: String(line.contentPerUnit), pricePerBaseUnit: String(line.pricePerBaseUnit), taxRate: String(line.taxRate ?? 18),
            lots: line.lotCode ? [{ lineNumber: 1, lotCode: line.lotCode, supplierLot: line.supplierLot, quantity }] : item?.lotTrackingMode === "REQUIRED" ? [] : undefined,
          };
        }),
      }),
    }),
    onSuccess: async () => { toast.success("Recepción registrada como pendiente."); setOpen(false); form.resetFields(); await queryClient.invalidateQueries({ queryKey: ["purchases"] }); },
    onError: (error) => toast.error(error.message),
  });

  const approve = useMutation({
    mutationFn: (id: string) => api(`/api/v1/purchases/${id}/approve`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
    onSuccess: async () => { toast.success("Compra aprobada y kardex actualizado."); await queryClient.invalidateQueries({ queryKey: ["purchases"] }); },
    onError: (error) => toast.error(error.message),
  });

  const reject = useMutation({
    mutationFn: (id: string) => api(`/api/v1/purchases/${id}/reject`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
    onSuccess: async () => { toast.success("Compra rechazada."); await queryClient.invalidateQueries({ queryKey: ["purchases"] }); },
    onError: (error) => toast.error(error.message),
  });

  const total = watchedLines.reduce((sum, line) => {
    try { return sum.add(new Decimal(line.presentationQuantity ?? 0).mul(line.contentPerUnit ?? 0).mul(line.pricePerBaseUnit ?? 0).mul(new Decimal(1).add(new Decimal(line.taxRate ?? 18).div(100)))); }
    catch { return sum; }
  }, new Decimal(0));

  const companyIgvRate = Number(options.data?.igvRate ?? 18);
  const normalizeForSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const pickerItems = (options.data?.items ?? []).filter((item) => {
    if (!selectedSupplierId || item.supplierId !== selectedSupplierId) return false;
    const term = normalizeForSearch(pickerSearch.trim());
    if (!term) return true;
    return [item.name, item.code, item.supplierProductCode ?? ""].some((value) => normalizeForSearch(value).includes(term));
  });
  const selectedItem = (index: number) => options.data?.items.find((item) => item.id === watchedLines[index]?.itemId);
  const selectedSupplier = options.data?.suppliers.find((supplier) => supplier.id === selectedSupplierId);
  const changeSupplier = () => {
    const lines = form.getFieldValue("lines") ?? [];
    form.setFieldValue("lines", lines.map((line: LineForm) => ({
      ...line,
      itemId: undefined,
      pricePerBaseUnit: undefined,
      taxRate: companyIgvRate,
    })));
    setPickerLine(null);
    setPickerSearch("");
  };
  const selectMaterial = (index: number, item: ItemOption) => {
    form.setFieldValue(["lines", index, "itemId"], item.id);
    form.setFieldValue(["lines", index, "pricePerBaseUnit"], item.referenceNetPrice ? Number(item.referenceNetPrice) : undefined);
    form.setFieldValue(["lines", index, "taxRate"], item.referenceTaxRate != null ? Number(item.referenceTaxRate) : companyIgvRate);
    setPickerLine(null);
  };

  const contactSupplier = (purchase: Purchase) => {
    const phone = normalizeWhatsAppPhone(purchase.supplier.phone);
    if (!phone) { toast.error("El proveedor no tiene un teléfono válido para WhatsApp."); return; }
    const message = buildPurchaseRequestMessage({
      supplierName: purchase.supplier.name,
      lines: purchase.lines.map((line) => ({
        itemName: line.item.name,
        supplierProductCode: line.item.supplierProductCode,
        presentationType: line.presentationType,
        presentationQuantity: line.presentationQty,
        contentPerUnit: line.contentPerUnit,
        receivedQuantity: line.receivedQuantity,
        unitSymbol: line.item.unit.symbol,
        imageUrl: line.item.images[0]?.secureUrl ?? null,
      })),
    });
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  };

  const columns: ColumnsType<Purchase> = [
    { title: "Código", dataIndex: "code", fixed: "left", width: 130, render: (value) => <strong>{value}</strong> },
    { title: "Recepción", dataIndex: "receptionDate", width: 120, render: (value) => dayjs(value).format("DD/MM/YYYY") },
    { title: "Proveedor", width: 220, render: (_, row) => <><strong>{row.supplier.name}</strong><br /><Typography.Text type="secondary">{row.supplier.code}</Typography.Text></> },
    { title: "Documento / guía", dataIndex: "documentNumber", width: 170 },
    { title: "Líneas", width: 90, align: "center", render: (_, row) => row._count.lines },
    { title: "Total", width: 140, align: "right", render: (_, row) => `${row.currency.code} ${new Decimal(row.total).toFixed(2)}` },
    { title: "Estado", dataIndex: "status", width: 120, render: (value) => <Tag color={statusColor[value]}>{statusLabel[value] ?? value}</Tag> },
    { title: "Acciones", fixed: "right", width: 300, render: (_, row) => {
      const phone = normalizeWhatsAppPhone(row.supplier.phone);
      return <Space wrap>
        <Tooltip title={phone ? "Enviar la solicitud de compra por WhatsApp" : "El proveedor no tiene un teléfono registrado"}>
          <Button size="small" icon={<WhatsAppOutlined />} disabled={!phone} onClick={() => contactSupplier(row)}>WhatsApp</Button>
        </Tooltip>
        {row.status === "PENDING" && canApprove ? <Button size="small" icon={<CheckOutlined />} loading={approve.isPending} onClick={() => Modal.confirm({ title: `¿Aprobar ${row.code}?`, content: "La aprobación ingresará existencias al kardex y no puede editarse después.", okText: "Aprobar", cancelText: "Cancelar", onOk: () => approve.mutateAsync(row.id) })}>Aprobar</Button> : null}
        {row.status === "PENDING" && canReject ? <Button size="small" danger icon={<CloseCircleOutlined />} loading={reject.isPending} onClick={() => Modal.confirm({ title: `¿Rechazar ${row.code}?`, content: "La compra quedará rechazada y no ingresará existencias al almacén.", okText: "Rechazar", okButtonProps: { danger: true }, cancelText: "Cancelar", onOk: () => reject.mutateAsync(row.id) })}>Rechazar</Button> : null}
      </Space>;
    } },
  ];

  const lineColumns: ColumnsType<PurchaseLine> = [
    { title: "Materia prima", width: 220, render: (_, row) => <><strong>{row.item.name}</strong><br /><Typography.Text type="secondary">{row.item.code}</Typography.Text></> },
    { title: "Presentación", width: 190, render: (_, row) => `${new Decimal(row.presentationQty).toFixed(3)} ${row.presentationType.toLowerCase()} de ${new Decimal(row.contentPerUnit).toFixed(3)} ${row.item.unit.symbol}` },
    { title: "Cantidad recibida", width: 145, align: "right", render: (_, row) => `${new Decimal(row.receivedQuantity).toFixed(3)} ${row.item.unit.symbol}` },
    { title: "Lote proveedor", width: 140, render: (_, row) => row.lots.map((entry) => entry.lot.supplierLot).filter(Boolean).join(", ") || "—" },
    { title: "Precio neto", width: 120, align: "right", render: (_, row) => new Decimal(row.pricePerBaseUnit).toFixed(4) },
    { title: "IGV", width: 80, align: "right", render: (_, row) => `${new Decimal(row.taxRate).toFixed(2)}%` },
    { title: "Precio con IGV", width: 130, align: "right", render: (_, row) => new Decimal(row.pricePerBaseUnit).mul(new Decimal(1).add(new Decimal(row.taxRate).div(100))).toFixed(4) },
    { title: "Total final", width: 130, align: "right", render: (_, row) => new Decimal(row.total).toFixed(2) },
  ];

  return <>
    <div className="page-heading">
      <ModuleHeadingIntro title="Compras y recepciones" eyebrow="Operativo" description="Registra documentos de proveedor, presentaciones, lotes, moneda, IGV y aprobación de entradas al kardex." />
      <Space wrap className="module-actions"><TableSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Buscar código, documento o proveedor" /><Tooltip title="Actualizar"><Button icon={<ReloadOutlined />} aria-label="Actualizar" onClick={() => purchases.refetch()} /></Tooltip><ModuleImportButton module="purchases" permissions={permissions} /></Space>
    </div>
    <Card className="section-card" title="Recepciones registradas" extra={canCreate ? <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>Nueva recepción</Button> : null}>
      {purchases.error ? <Alert type="error" showIcon message={purchases.error.message} action={<Button onClick={() => router.refresh()}>Reintentar</Button>} /> : null}
      <Table rowKey="id" loading={purchases.isLoading} columns={columns} dataSource={purchases.data?.items ?? []} expandable={{ expandedRowRender: (row) => <Table rowKey="id" size="small" sticky={false} columns={lineColumns} dataSource={row.lines} pagination={false} scroll={{ x: 1180 }} /> }} scroll={{ x: 1230 }} pagination={{ current: page, pageSize, total: purchases.data?.total ?? 0, pageSizeOptions: [8, 16, 32], onChange: (nextPage, nextPageSize) => { setPageSize(nextPageSize); setPage(nextPageSize !== pageSize ? 1 : nextPage); }, showTotal: (total) => `${total} recepciones` }} locale={{ emptyText: <Empty description="Aún no hay recepciones registradas" /> }} />
    </Card>

    <Modal className="compact-form-modal" title="Nueva recepción de compra" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText="Registrar pendiente" cancelText="Cancelar" confirmLoading={create.isPending} width={980} destroyOnHidden>
      {options.error ? <Alert type="error" showIcon message={options.error.message} style={{ marginBottom: 16 }} /> : null}
      <Form form={form} layout="vertical" onFinish={(values) => create.mutate(values)} initialValues={{ receptionDate: dayjs(), exchangeRate: 1, lines: [{ taxRate: companyIgvRate }] }}>
        <div className="purchase-form-grid">
          <Form.Item name="receptionDate" label="Fecha de recepción" rules={[{ required: true }]}><DatePicker style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="supplierId" label="Proveedor" rules={[{ required: true }]}><CreatableSelect createLabel="Nuevo proveedor" createDisabled={!permissions.includes("catalogs.manage")} onCreate={() => setQuickSupplierOpen(true)} loading={options.isLoading} showSearch optionFilterProp="label" onChange={changeSupplier} options={options.data?.suppliers.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))} /></Form.Item>
          <Form.Item name="documentNumber" label="Documento / guía" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="warehouseId" label="Almacén" rules={[{ required: true }]}><CreatableSelect createLabel="Nuevo almacén" createDisabled={!permissions.includes("catalogs.manage")} onCreate={() => setQuickWarehouseOpen(true)} showSearch optionFilterProp="label" options={options.data?.warehouses.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))} /></Form.Item>
          <Form.Item name="currencyId" label="Moneda" rules={[{ required: true }]}><CreatableSelect createLabel="Nueva moneda" createDisabled={!permissions.includes("catalogs.manage")} onCreate={() => setQuickCurrencyOpen(true)} showSearch optionFilterProp="label" options={options.data?.currencies.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))} /></Form.Item>
          <Form.Item name="exchangeRate" label="Tipo de cambio" tooltip="Valor en soles de una unidad de la moneda de la compra. Para PEN usa 1." rules={[{ required: true }]}><InputNumber min={0.000001} precision={6} style={{ width: "100%" }} /></Form.Item>
        </div>
        <Divider>Productos recibidos</Divider>
        <Form.List name="lines">
          {(fields, { add, remove }) => <Space direction="vertical" size={14} style={{ width: "100%" }}>
            {fields.map((field, index) => <Card size="small" key={field.key} title={`Línea ${index + 1}`} extra={fields.length > 1 ? <Button type="link" danger onClick={() => remove(field.name)}>Quitar</Button> : null}>
              <div className="purchase-line-grid">
                <Form.Item name={[field.name, "itemId"]} hidden rules={[{ required: true }]}><Input /></Form.Item>
                <Form.Item label="Materia prima" required help={!selectedSupplierId ? "Selecciona primero un proveedor." : selectedItem(index) ? undefined : "Selecciona un material de la lista."}><Button block disabled={!selectedSupplierId} onClick={() => { setPickerLine(index); setPickerSearch(""); }} style={{ textAlign: "left" }}>{selectedItem(index) ? `${selectedItem(index)!.code} · ${selectedItem(index)!.name}` : selectedSupplierId ? "Seleccionar material…" : "Selecciona un proveedor"}</Button></Form.Item>
                <Form.Item name={[field.name, "presentationType"]} label="Presentación" tooltip="Tipo de empaque recibido, por ejemplo SACO, BOTELLA o CILINDRO." rules={[{ required: true }]}><Select showSearch optionFilterProp="label" placeholder="Selecciona el empaque" options={PRESENTATION_TYPES.map((type) => ({ value: type, label: type }))} /></Form.Item>
                <Form.Item name={[field.name, "presentationQuantity"]} label="Presentaciones" tooltip="Número de bultos o envases recibidos, por ejemplo 25 sacos." rules={[{ required: true }]}><InputNumber min={0.000001} style={{ width: "100%" }} placeholder="20" /></Form.Item>
                <Form.Item name={[field.name, "contentPerUnit"]} label="Contenido" tooltip="Unidades base por presentación, por ejemplo 20 kg por saco." rules={[{ required: true }]}><InputNumber min={0.000001} style={{ width: "100%" }} placeholder="10" /></Form.Item>
                <Form.Item label="Recibido" tooltip="Cantidad total en unidad base: presentaciones × contenido."><Input value={new Decimal(watchedLines[index]?.presentationQuantity ?? 0).mul(watchedLines[index]?.contentPerUnit ?? 0).toString()} disabled suffix={options.data?.items.find((item) => item.id === watchedLines[index]?.itemId)?.unit.symbol} /></Form.Item>
                <Form.Item name={[field.name, "pricePerBaseUnit"]} label={watchedLines[index]?.taxRate === 0 ? "Precio total" : "Precio neto (sin IGV)"} tooltip={watchedLines[index]?.taxRate === 0 ? "Importe final por unidad base; no se agrega IGV." : "Precio sin IGV por unidad base."} rules={[{ required: true }]}><InputNumber min={0.000001} precision={6} style={{ width: "100%" }} /></Form.Item>
                <Form.Item name={[field.name, "taxRate"]} hidden><Input /></Form.Item>
                <Form.Item label="IGV"><Segmented value={watchedLines[index]?.taxRate === 0 ? "EXCLUDED" : "INCLUDED"} onChange={(value) => form.setFieldValue(["lines", index, "taxRate"], value === "EXCLUDED" ? 0 : companyIgvRate)} options={[{ value: "INCLUDED", label: `Con IGV (${companyIgvRate} %)` }, { value: "EXCLUDED", label: "Sin IGV (0 %)" }]} /></Form.Item>
                <Form.Item name={[field.name, "lotCode"]} label="Lote interno" tooltip="Código de lote según la configuración del ítem."><Input placeholder="Según configuración del ítem" /></Form.Item>
                <Form.Item name={[field.name, "supplierLot"]} label="Lote del proveedor"><Input placeholder="Opcional" /></Form.Item>
              </div>
            </Card>)}
            <Button block onClick={() => add({ taxRate: companyIgvRate })} icon={<PlusOutlined />}>Agregar línea</Button>
          </Space>}
        </Form.List>
        <div className="purchase-total"><span>Total estimado con IGV</span><strong>{total.toFixed(2)}</strong></div>
      </Form>
    </Modal>
    <Modal title={`Seleccionar materia prima${selectedSupplier ? ` · ${selectedSupplier.name}` : ""}`} open={pickerLine !== null} onCancel={() => setPickerLine(null)} footer={null} width={960} destroyOnHidden>
      <Space.Compact block style={{ marginBottom: 12 }}>
        <Input.Search allowClear placeholder="Buscar por nombre, código o código del proveedor" value={pickerSearch} onChange={(event) => setPickerSearch(event.target.value)} style={{ flex: 1 }} />
        <Button icon={<PlusOutlined />} disabled={!selectedSupplierId || !permissions.includes("inventory.create_item")} onClick={() => setQuickItemOpen(true)}>Nuevo material</Button>
      </Space.Compact>
      <Table
        rowKey="id"
        size="small"
        dataSource={pickerItems}
        pagination={{ pageSize: 8, pageSizeOptions: [8, 16, 32] }}
        sticky={false}
        scroll={{ x: 920 }}
        locale={{ emptyText: <Empty description={selectedSupplier ? `No hay materias primas registradas para ${selectedSupplier.name}` : "Selecciona primero un proveedor"} /> }}
        onRow={(record) => ({ onClick: () => { if (pickerLine !== null) selectMaterial(pickerLine, record); }, style: { cursor: "pointer" } })}
        columns={[
          { title: "Código", dataIndex: "code", width: 110, render: (value) => <strong>{value}</strong> },
          { title: "Material", dataIndex: "name", width: 220 },
          { title: "Código del proveedor", dataIndex: "supplierProductCode", width: 160, render: (value) => value || "—" },
          { title: "Proveedor", width: 190, render: (_, row) => row.supplier?.name ?? "—" },
          { title: "Unidad", width: 80, render: (_, row) => row.unit.symbol },
          { title: "Precio neto ref.", width: 130, align: "right", render: (_, row) => row.referenceNetPrice ? new Decimal(row.referenceNetPrice).toFixed(4) : "—" },
          { title: "IGV", width: 90, align: "right", render: (_, row) => `${new Decimal(row.referenceTaxRate ?? companyIgvRate).toFixed(2)}%` },
          { title: "Costo total ref.", width: 130, align: "right", render: (_, row) => row.referenceNetPrice ? new Decimal(row.referenceNetPrice).mul(new Decimal(1).add(new Decimal(row.referenceTaxRate ?? companyIgvRate).div(100))).toFixed(4) : "—" },
        ]}
      />
    </Modal>
    <ContactQuickCreateModal kind="SUPPLIER" open={quickSupplierOpen} onCancel={() => setQuickSupplierOpen(false)} onCreated={(supplier) => { form.setFieldValue("supplierId", supplier.id); changeSupplier(); setQuickSupplierOpen(false); }} />
    <WarehouseQuickCreateModal open={quickWarehouseOpen} onCancel={() => setQuickWarehouseOpen(false)} onCreated={(warehouse) => { form.setFieldValue("warehouseId", warehouse.id); setQuickWarehouseOpen(false); }} />
    <CurrencyQuickCreateModal open={quickCurrencyOpen} onCancel={() => setQuickCurrencyOpen(false)} onCreated={(currency) => { form.setFieldValue("currencyId", currency.id); setQuickCurrencyOpen(false); }} />
    <ItemQuickCreateModal open={quickItemOpen} defaultType="RAW_MATERIAL" allowedTypes={["RAW_MATERIAL"]} defaultSupplierId={selectedSupplierId} defaultCurrencyId={options.data?.currencies.find((currency) => currency.isBase)?.id} onCancel={() => setQuickItemOpen(false)} onCreated={(item) => { if (pickerLine !== null) { form.setFieldValue(["lines", pickerLine, "itemId"], item.id); form.setFieldValue(["lines", pickerLine, "taxRate"], companyIgvRate); setPickerLine(null); } setQuickItemOpen(false); }} />
  </>;
}
