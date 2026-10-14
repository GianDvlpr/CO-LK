"use client";

import { PrinterOutlined } from "@ant-design/icons";
import { Button } from "antd";

export function PrintButton() {
  return <Button type="primary" icon={<PrinterOutlined />} onClick={() => window.print()}>Imprimir / guardar PDF</Button>;
}
