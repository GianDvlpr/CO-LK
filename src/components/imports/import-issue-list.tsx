"use client";

import { List, Space, Tag, Typography } from "antd";

export type ImportIssue = {
  id?: string;
  rowNumber: number;
  sheet?: string;
  field?: string;
  column?: string;
  value?: string;
  code: string;
  message: string;
  suggestion?: string;
  rawData?: Record<string, unknown> | null;
};

const codeLabels: Record<string, string> = {
  MISSING_SHEET: "Hoja faltante",
  UNKNOWN_HEADER: "Columna desconocida",
  DUPLICATE_HEADER: "Columna repetida",
  MISSING_HEADER: "Columna faltante",
  REQUIRED_FIELD: "Dato obligatorio",
  INVALID_NUMBER: "Número inválido",
  INVALID_DATE: "Fecha inválida",
  INVALID_BOOLEAN: "Valor inválido",
  INVALID_REFERENCE: "Referencia inexistente",
  DUPLICATE_CONFLICT: "Registro duplicado",
  DUPLICATE_IDENTICAL_SKIPPED: "Fila repetida",
  EXISTING_RECORD_SKIPPED: "Registro existente",
  EMPTY_FILE: "Archivo vacío",
  ROW_LIMIT_EXCEEDED: "Límite excedido",
  INVALID_WORKBOOK: "Archivo inválido",
};

function humanizeField(field?: string) {
  if (!field) return undefined;
  return field.split(",").map((part) => part.trim().replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase())).join(" + ");
}

function issueValue(issue: ImportIssue) {
  if (issue.value !== undefined) return issue.value;
  if (!issue.rawData || !issue.field) return undefined;
  const fields = issue.field.split(",").map((field) => field.trim()).filter(Boolean);
  return fields.map((field) => String(issue.rawData?.[field] ?? "")).join(" | ");
}

export function ImportIssueList({ issues, title, tone = "error" }: { issues: ImportIssue[]; title?: string; tone?: "error" | "warning" }) {
  return <List
    size="small"
    bordered
    header={title}
    dataSource={issues}
    renderItem={(issue) => {
      const value = issueValue(issue);
      const column = issue.column ?? humanizeField(issue.field);
      return <List.Item style={{ alignItems: "flex-start" }}>
        <Space direction="vertical" size={3} style={{ width: "100%", minWidth: 0 }}>
          <Space wrap size={[6, 4]}>
            <Tag color={tone === "error" ? "red" : "orange"}>{codeLabels[issue.code] ?? issue.code}</Tag>
            {issue.sheet ? <Typography.Text strong>Hoja: {issue.sheet}</Typography.Text> : null}
            <Typography.Text strong>Fila: {issue.rowNumber}</Typography.Text>
            {column ? <Typography.Text strong>Columna: {column}</Typography.Text> : null}
          </Space>
          <Typography.Text type={tone === "error" ? "danger" : undefined} style={{ overflowWrap: "anywhere" }}>{issue.message}</Typography.Text>
          {value !== undefined ? <Typography.Text style={{ overflowWrap: "anywhere" }}><Typography.Text type="secondary">Valor recibido: </Typography.Text>{value === "" ? <Tag>Celda vacía</Tag> : <Typography.Text code>{value}</Typography.Text>}</Typography.Text> : null}
          {issue.suggestion ? <Typography.Text type="secondary" style={{ overflowWrap: "anywhere" }}>Cómo corregirlo: {issue.suggestion}</Typography.Text> : null}
        </Space>
      </List.Item>;
    }}
  />;
}
