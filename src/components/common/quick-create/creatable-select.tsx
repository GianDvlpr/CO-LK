"use client";

import { PlusOutlined } from "@ant-design/icons";
import { Button, Divider, Select, type SelectProps } from "antd";

export type CreatableSelectProps = SelectProps & { createLabel: string; onCreate: () => void; createDisabled?: boolean };

export function CreatableSelect({ createLabel, onCreate, createDisabled, ...selectProps }: CreatableSelectProps) {
  return <Select
    {...selectProps}
    popupRender={(menu) => <>
      {menu}
      {createDisabled ? null : <>
        <Divider style={{ margin: "4px 0" }} />
        <Button type="text" block icon={<PlusOutlined />} onMouseDown={(event) => event.preventDefault()} onClick={onCreate}>{createLabel}</Button>
      </>}
    </>}
  />;
}
