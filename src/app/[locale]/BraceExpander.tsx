"use client";

import React, { useMemo } from "react";
import { Button, Input, Typography, Form, Space, Flex, Row, Col, Select, Segmented, Tooltip, theme, App, Card, Popconfirm, Collapse } from "antd";
import { PartitionOutlined, SaveOutlined, DeleteOutlined } from "@ant-design/icons";
import { useTranslations } from "next-intl";
import ResultCard from "@/app/components/ResultCard";
import { useLocalStorage } from "@/app/hooks/useLocalStorage";
import { useCopyToClipboard } from "@/app/hooks/useCopyToClipboard";
import { useTextStats } from "@/app/hooks/useTextStats";
import { usePresetCollection } from "@/app/hooks/usePresetCollection";
import { downloadFile, parseEscapeChars } from "@/app/utils";
import { expand, MAX_EXPANSIONS, type ExpandOrder } from "./expand";

const { TextArea } = Input;
const { Text } = Typography;

/** 语言中立的示例：一眼看出「模板 → 展开」，不必按语种翻译 */
const EXAMPLE = "f{1..4}pd_ever_od30_{tag,bal}";
const BraceExpander = () => {
  const t = useTranslations("BraceExpander");
  const tCommon = useTranslations("common");
  const { token } = theme.useToken();
  const { copyToClipboard } = useCopyToClipboard();
  const { message } = App.useApp();

  const [template, setTemplate] = useLocalStorage("brace-expander-template", "");
  const [order, setOrder] = useLocalStorage<ExpandOrder>("brace-expander-order", "interleave");
  const [lineSeparator, setLineSeparator] = useLocalStorage("brace-expander-lineSeparator", "\\n");
  const [prefix, setPrefix] = useLocalStorage("brace-expander-prefix", "");
  const [suffix, setSuffix] = useLocalStorage("brace-expander-suffix", "");
  const [advancedOpen, setAdvancedOpen] = useLocalStorage("brace-expander-advancedOpen", false);

  // 历史 = 命名预设集合，「名字」就是模板本身。usePresetCollection 带坏行清洗，
  // localStorage 被手改过也不会让整页崩（用它是因为那条崩溃先例，见 hooks/usePresetCollection 注释）。
  const history = usePresetCollection<{ id: string; name: string }>("brace-expander-history", "brace-expander-activeHistoryId");

  const matchedHistoryItem = useMemo(
    () => history.items.find((h) => h.name === template),
    [history.items, template],
  );
  const currentHistoryId = matchedHistoryItem?.id || (history.activeId && history.items.some((h) => h.id === history.activeId && h.name === template) ? history.activeId : "");

  // 实时展开。命中上限时返回 { ok:false } —— 明确不生成，而不是静默截断。
  const result = useMemo(() => (template.trim() ? expand(template, { order }) : null), [template, order]);

  const text = useMemo(() => {
    if (!result || !result.ok || result.lines.length === 0) return "";
    return parseEscapeChars(prefix) + result.lines.join(parseEscapeChars(lineSeparator)) + parseEscapeChars(suffix);
  }, [result, prefix, lineSeparator, suffix]);

  const stats = useTextStats(text);

  const saveCurrent = () => {
    if (!template.trim()) {
      message.warning(t("emptyTemplate"));
      return;
    }
    // 同一个模板不重复入列 —— 历史是去重后的配方表，不是流水
    if (history.items.some((h) => h.name === template)) {
      message.info(t("alreadyInHistory"));
      return;
    }
    history.add({ id: String(Date.now()), name: template });
    message.success(t("historySaved"));
  };

  const loadFromHistory = (id: string) => {
    const hit = history.items.find((h) => h.id === id);
    if (hit) {
      setTemplate(hit.name);
      history.setActiveId(id);
    }
  };

  const deleteHistoryItem = () => {
    if (currentHistoryId) {
      history.remove(currentHistoryId);
    }
  };

  const overLimit = result !== null && !result.ok;

  // 示例的展开结果 —— 空状态直接展示「输入 → 输出」对照。
  // 原来示例只以 placeholder / 灰字出现过四次，输出一次都没有：新用户要理解 {1..4}，
  // 唯一的办法是先把它敲进去看结果，而那正是他还没看懂的东西（先要鸡还是先有蛋）。
  // 把这一步的产物摆在眼前，示例就自解释了。随 order 变，所见即所得。
  const exampleOut = useMemo(() => {
    const r = expand(EXAMPLE, { order });
    return r.ok ? r.lines : null;
  }, [order]);

  return (
    <div>
      <Card
        title={
          <Space>
            <PartitionOutlined /> {t("templateTitle")}
          </Space>
        }
        extra={
          <Space size={4}>
            <Tooltip title={t("saveCurrent")}>
              <Button
                type="text"
                size="small"
                icon={<SaveOutlined />}
                onClick={saveCurrent}
                disabled={!template.trim()}
                aria-label={t("saveCurrent")}
              >
                {t("saveCurrent")}
              </Button>
            </Tooltip>
            <Button type="text" size="small" onClick={() => setTemplate("")} disabled={!template} aria-label={tCommon("clearAll")}>
              {tCommon("clearAll")}
            </Button>
          </Space>
        }
      >
        <Form layout="vertical">
          <Form.Item label={t("template")} tooltip={t("templateTooltip")}>
            <TextArea
              autoSize={{ minRows: 3, maxRows: 10 }}
              className="!font-mono !text-base"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              dir="auto"
              aria-label={t("template")}
            />
          </Form.Item>

          <Text type="secondary" className="!block !text-xs !mb-4">
            {t("templateHint")}
          </Text>

          {/* 历史：零历史时不占首屏 —— 存第一条之后它自己回来。 */}
          {history.items.length > 0 && (
            <Form.Item label={t("history")} tooltip={t("historyTooltip")}>
              <Flex gap={8} align="flex-start">
                <Select
                  style={{ flex: 1, minWidth: 0 }}
                  value={currentHistoryId || undefined}
                  onChange={loadFromHistory}
                  onClear={() => history.setActiveId("")}
                  placeholder={t("historyPlaceholder")}
                  options={history.items.map((h) => ({ value: h.id, label: h.name }))}
                  notFoundContent={t("historyEmpty")}
                  allowClear
                  popupMatchSelectWidth={false}
                  aria-label={t("history")}
                />
                <Tooltip title={t("saveCurrent")}>
                  <Button icon={<SaveOutlined />} onClick={saveCurrent} disabled={!template.trim()} aria-label={t("saveCurrent")} />
                </Tooltip>
                <Popconfirm
                  title={t("deleteHistoryConfirm")}
                  onConfirm={deleteHistoryItem}
                  disabled={!currentHistoryId}
                >
                  <Button danger icon={<DeleteOutlined />} disabled={!currentHistoryId} aria-label={t("deleteHistory")} />
                </Popconfirm>
              </Flex>
            </Form.Item>
          )}

          <Collapse
            ghost
            activeKey={advancedOpen ? ["adv"] : []}
            onChange={(keys) => setAdvancedOpen(keys.length > 0)}
            items={[{
              key: "adv",
              label: <span className="!text-xs !font-medium !tracking-wide">{tCommon("advancedSettings")}</span>,
              children: (
                <>
                  {/* 输出顺序：多个花括号时「谁最慢」。放在模板正下方 —— 改的是**展开**本身、
                      不是输出装配，所以别塞进下面的「输出装配」分组里。 */}
                  <Form.Item label={<Tooltip title={t("orderTooltip")}><span>{t("order")}</span></Tooltip>}>
                    <Segmented
                      block
                      value={order}
                      onChange={(v) => setOrder(v as ExpandOrder)}
                      options={[
                        { label: t("orderInterleave"), value: "interleave" },
                        { label: t("orderGrouped"), value: "grouped" },
                      ]}
                    />
                  </Form.Item>

                  <Text type="secondary" className="!block !text-xs !font-medium !tracking-wide">
                    {t("sectionAssembly")}
                  </Text>

                  <Form.Item label={t("lineSeparator")} tooltip={tCommon("supportEscapeChars")}>
                    <Input value={lineSeparator} onChange={(e) => setLineSeparator(e.target.value)} aria-label={t("lineSeparator")} />
                  </Form.Item>

                  <Row gutter={8}>
                    <Col span={12}>
                      <Form.Item label={t("prefix")} tooltip={tCommon("supportEscapeChars")}>
                        <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} aria-label={t("prefix")} allowClear />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item label={t("suffix")} tooltip={tCommon("supportEscapeChars")}>
                        <Input value={suffix} onChange={(e) => setSuffix(e.target.value)} aria-label={t("suffix")} allowClear />
                      </Form.Item>
                    </Col>
                  </Row>
                </>
              ),
            }]}
          />
        </Form>
      </Card>

      <div className="!mt-4">
        {overLimit ? (
          // 超上限是一种**结论**而不是异常：明说原因、给出可照抄的模板，不静默截断
          <Card style={{ borderTop: "2px solid var(--accent)" }}>
            <Flex vertical align="center" justify="center" gap={12} className="!py-10 !text-center">
              <Text className="!block !text-base">{t("limitTitle")}</Text>
              <Text type="secondary" className="!text-sm">
                {t("limitHint", { max: MAX_EXPANSIONS })}
              </Text>
              <Text type="secondary" className="!font-mono !text-xs">
                {EXAMPLE}
              </Text>
            </Flex>
          </Card>
        ) : text ? (
          <div className="editorial-rise">
            <ResultCard content={text} stats={stats} onCopy={() => copyToClipboard(text)} onExport={() => downloadFile(text, "expanded.txt")} />
          </div>
        ) : (
          <Card title={tCommon("result")} style={{ borderTop: "2px solid var(--accent)" }}>
            <Flex vertical align="center" justify="center" gap={12} className="!py-8 !text-center">
              <PartitionOutlined style={{ fontSize: 32, color: token.colorTextQuaternary }} />
              <div>
                <Text className="!block !text-base">{t("emptyTitle")}</Text>
                <Text type="secondary" className="!text-sm">
                  {t("emptyHint")}
                </Text>
              </div>
              {/* 示例自带它的展开结果，点一下就填进去 —— 不用新文案：箭头的意思
                  已经说完了，屏幕阅读器读到的是「示例 + 结果」本身，也够。 */}
              {exampleOut && (
                <button
                  type="button"
                  onClick={() => setTemplate(EXAMPLE)}
                  style={{
                    background: token.colorFillQuaternary,
                    border: `1px solid ${token.colorBorderSecondary}`,
                  }}
                  className="!mt-1 !cursor-pointer !rounded-lg !px-4 !py-3 !text-left hover:!opacity-80"
                >
                  <div className="!font-mono !text-xs">{EXAMPLE}</div>
                  <div className="!py-1 !text-center !text-xs" aria-hidden>↓</div>
                  <pre className="!m-0 !whitespace-pre !font-mono !text-xs">{exampleOut.join("\n")}</pre>
                </button>
              )}
            </Flex>
          </Card>
        )}
      </div>
    </div>
  );
};

export default BraceExpander;
