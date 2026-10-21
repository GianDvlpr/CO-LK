"use client";

import { PrinterOutlined } from "@ant-design/icons";
import { Button, Space, Typography } from "antd";

export function PrintButton() {
  return <Space><Typography.Text type="secondary">Papel A5 horizontal · escala 100 %</Typography.Text><Button type="primary" icon={<PrinterOutlined />} onClick={() => window.print()}>Imprimir / guardar PDF</Button></Space>;
}
