"use client";

import { SearchOutlined } from "@ant-design/icons";
import { Input } from "antd";

export function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function matchesSearch(search: string, ...fields: (string | null | undefined)[]) {
  const term = normalizeSearch(search);
  if (!term) return true;
  return fields.some((field) => normalizeSearch(field ?? "").includes(term));
}

export function TableSearch({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <Input allowClear prefix={<SearchOutlined />} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} style={{ width: 260 }} />;
}
