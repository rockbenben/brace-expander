"use client";

import React from "react";
import { PartitionOutlined } from "@ant-design/icons";
import { useTranslations, useLocale } from "next-intl";
import { getDocUrl } from "@/app/utils";
import ToolPage from "@/app/components/styled/ToolPage";
import BraceExpander from "./BraceExpander";

const ClientPage = () => {
  const t = useTranslations("BraceExpander");
  const locale = useLocale();
  const userGuideUrl = getDocUrl("guide/text/brace-expander.html", locale);

  return (
    <ToolPage icon={<PartitionOutlined />} toolKey="braceExpander" description={t("clientDescription")} guideUrl={userGuideUrl}>
      <BraceExpander />
    </ToolPage>
  );
};

export default ClientPage;
