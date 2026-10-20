"use client";

import { Table as AntTable } from "antd";
import type { TableProps } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";

const MOBILE_TABLE_QUERY = "(max-width: 900px)";
const APP_HEADER_OFFSET = 76;

function useMobileTableLayout() {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_TABLE_QUERY);
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return mobile;
}

export function ResponsiveTable<RecordType extends object = object>({ columns, className, sticky, ...props }: TableProps<RecordType>) {
  const mobile = useMobileTableLayout();
  const responsiveColumns = useMemo<ColumnsType<RecordType> | undefined>(() => {
    if (!mobile || !columns) return columns;
    return columns.map((column) => ({ ...column, fixed: undefined })) as ColumnsType<RecordType>;
  }, [columns, mobile]);
  const stickyConfig = sticky ?? (mobile ? false : { offsetHeader: APP_HEADER_OFFSET });

  return <AntTable<RecordType> {...props} sticky={stickyConfig} columns={responsiveColumns} className={["responsive-data-table", className].filter(Boolean).join(" ")} />;
}
