"use client";

import { SearchOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, Empty, Input, Select, Space, Table, Typography } from "antd";
import { useState } from "react";

type Location = { id: string; nombre: string; region_id?: string; provincia_id?: string };
type ProductCode = { codigo: string; descripcion: string; clase?: string };
async function api<T>(url: string): Promise<T> { const response = await fetch(url); const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo consultar el catálogo."); return payload.data; }

export function FiscalReferenceCatalogs() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState<string>();
  const [province, setProvince] = useState<string>();
  const [ubigeo, setUbigeo] = useState("");
  const [productCode, setProductCode] = useState("");
  const products = useQuery({ queryKey: ["sunat-products", search], queryFn: () => api<ProductCode[]>(`/api/v1/electronic-billing/reference?type=products&q=${encodeURIComponent(search)}`), enabled: search.length >= 2 });
  const regions = useQuery({ queryKey: ["sunat-regions"], queryFn: () => api<Location[]>("/api/v1/electronic-billing/reference?type=regions") });
  const provinces = useQuery({ queryKey: ["sunat-provinces", region], queryFn: () => api<Location[]>(`/api/v1/electronic-billing/reference?type=provinces&region=${region}`), enabled: Boolean(region) });
  const districts = useQuery({ queryKey: ["sunat-districts", province], queryFn: () => api<Location[]>(`/api/v1/electronic-billing/reference?type=districts&province=${province}`), enabled: Boolean(province) });
  return <Space direction="vertical" size="middle" style={{ width: "100%" }}>
    <Alert type="info" showIcon message="Estos catálogos ayudan a completar documentos electrónicos antes de emitir." />
    <Card title="Código de producto SUNAT (UNSPSC)">
      <Space.Compact style={{ width: "100%", marginBottom: 14 }}><Input value={query} onChange={(event) => setQuery(event.target.value)} onPressEnter={() => query.trim().length >= 2 && setSearch(query.trim())} placeholder="Buscar por descripción o código" /><Button type="primary" icon={<SearchOutlined />} disabled={query.trim().length < 2} onClick={() => setSearch(query.trim())}>Buscar</Button></Space.Compact>
      {products.error ? <Alert type="error" showIcon message={products.error.message} /> : null}
      <Table<ProductCode> size="small" rowKey="codigo" loading={products.isFetching} pagination={{ pageSize: 8 }} dataSource={products.data ?? []} locale={{ emptyText: <Empty description="Busca un producto del catálogo SUNAT" /> }} columns={[{ title: "Código", dataIndex: "codigo" }, { title: "Descripción", dataIndex: "descripcion" }, { title: "", render: (_, item) => <Button size="small" onClick={() => setProductCode(item.codigo)}>Usar</Button> }]} />
      <Typography.Text strong>Código seleccionado</Typography.Text><Input value={productCode} onChange={(event) => setProductCode(event.target.value.replace(/\D/g, "").slice(0, 8))} maxLength={8} placeholder="00000000" style={{ marginTop: 6, maxWidth: 260 }} />
    </Card>
    <Card title="Ubigeo SUNAT/INEI">
      <div className="purchase-form-grid">
        <Select value={region} placeholder="Región" loading={regions.isLoading} showSearch optionFilterProp="label" onChange={(value) => { setRegion(value); setProvince(undefined); setUbigeo(""); }} options={regions.data?.map((item) => ({ value: item.id, label: item.nombre }))} />
        <Select value={province} placeholder="Provincia" disabled={!region} loading={provinces.isLoading} showSearch optionFilterProp="label" onChange={(value) => { setProvince(value); setUbigeo(""); }} options={provinces.data?.map((item) => ({ value: item.id, label: item.nombre }))} />
        <Select value={ubigeo || undefined} placeholder="Distrito" disabled={!province} loading={districts.isLoading} showSearch optionFilterProp="label" onChange={setUbigeo} options={districts.data?.map((item) => ({ value: item.id, label: `${item.id} · ${item.nombre}` }))} />
        <Input value={ubigeo} onChange={(event) => setUbigeo(event.target.value.replace(/\D/g, "").slice(0, 6))} maxLength={6} placeholder="Código de ubigeo" />
      </div>
    </Card>
  </Space>;
}
