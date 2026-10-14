"use client";

import { InfoCircleOutlined } from "@ant-design/icons";
import { Button, Tag, Tooltip } from "antd";

type ModuleHeadingIntroProps = {
  title: string;
  eyebrow: string;
  description: string;
  color?: string;
};

export function ModuleHeadingIntro({ title, eyebrow, description, color = "green" }: ModuleHeadingIntroProps) {
  return (
    <div className="module-heading-intro">
      <div className="module-title-row">
        <h1>{title}</h1>
        <Tag color={color}>{eyebrow}</Tag>
        <Tooltip title={description} placement="bottom" trigger={["hover", "focus", "click"]}>
          <Button
            type="text"
            size="small"
            shape="circle"
            className="module-description-trigger"
            icon={<InfoCircleOutlined />}
            aria-label={`Información sobre ${title}`}
          />
        </Tooltip>
      </div>
    </div>
  );
}
