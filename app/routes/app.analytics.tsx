import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  useFetcher,
  useLoaderData,
  useNavigation,
  useRouteError,
} from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  EmptyState,
  InlineStack,
  Layout,
  Page,
  Select,
  SkeletonBodyText,
  SkeletonDisplayText,
  SkeletonPage,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  detectStale,
  getCoverageMatrix,
  recomputeExact,
  type CoverageMatrix,
  type StaleRow,
} from "../services/analytics.server";
import { createTranslationJob } from "../services/auto-translate.server";
import { Donut } from "../components/Donut";
import { RESOURCE_TYPES } from "../utils/resource-type-map";
import { getLocaleDisplayName } from "../utils/locale-utils";
import { fetchMarkets, fetchShopLocales } from "../services/markets.server";

type ActionResponse =
  | { intent: "recompute"; success: true; row: string; column: string; cell: { total: number; translated: number; percent: number } }
  | { intent: "detect-stale"; success: true; stale: StaleRow[] }
  | { intent: "retranslate-stale"; success: true; jobIds: string[] }
  | { error: string };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const view = (url.searchParams.get("view") ?? "locale") as "locale" | "market";

  const [matrix, locales, markets, providers] = await Promise.all([
    getCoverageMatrix(session.shop, view),
    fetchShopLocales(admin),
    fetchMarkets(admin),
    prisma.translationProviderConfig.findMany({
      where: { shop: session.shop, isActive: true },
      select: { provider: true },
    }),
  ]);

  return json({
    view,
    matrix,
    locales,
    markets,
    activeProviders: providers.map((p) => p.provider),
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "recompute") {
    const resourceType = String(formData.get("resourceType") || "");
    const locale = String(formData.get("locale") || "");
    const marketId = String(formData.get("marketId") || "");
    const column = String(formData.get("column") || locale);
    if (!resourceType || !locale) {
      return json<ActionResponse>(
        { error: "Missing parameters." },
        { status: 400 },
      );
    }
    const cell = await recomputeExact(
      admin,
      session.shop,
      resourceType,
      locale,
      marketId,
    );
    return json<ActionResponse>({
      intent: "recompute",
      success: true,
      row: resourceType,
      column,
      cell: {
        total: cell.total,
        translated: cell.translated,
        percent: cell.percent,
      },
    });
  }

  if (intent === "detect-stale") {
    const stale = await detectStale(admin, session.shop);
    return json<ActionResponse>({
      intent: "detect-stale",
      success: true,
      stale,
    });
  }

  if (intent === "retranslate-stale") {
    const serialized = String(formData.get("stale") || "");
    const provider = String(formData.get("provider") || "");
    const targetLocale = String(formData.get("targetLocale") || "");
    const marketId = (String(formData.get("marketId") || "") || null) as
      | string
      | null;
    const sourceLocale = String(formData.get("sourceLocale") || "");
    if (!serialized || !provider || !targetLocale || !sourceLocale) {
      return json<ActionResponse>(
        { error: "Missing parameters." },
        { status: 400 },
      );
    }
    const rows = JSON.parse(serialized) as StaleRow[];
    const resourceIds = Array.from(new Set(rows.map((r) => r.resourceId)));
    if (resourceIds.length === 0) {
      return json<ActionResponse>(
        { error: "No stale resources to re-translate." },
        { status: 400 },
      );
    }
    const job = await createTranslationJob(session.shop, {
      provider,
      resourceType: "PRODUCT",
      sourceLocale,
      targetLocale,
      marketId,
    });
    await prisma.translationJob.update({
      where: { id: job.id },
      data: { resourceIdFilter: JSON.stringify(resourceIds) },
    });
    return json<ActionResponse>({
      intent: "retranslate-stale",
      success: true,
      jobIds: [job.id],
    });
  }

  return json<ActionResponse>({ error: "Unknown action." }, { status: 400 });
};

function columnLabel(
  view: "locale" | "market",
  value: string,
  locales: Array<{ locale: string }>,
  markets: Array<{ id: string; name: string }>,
): string {
  if (view === "locale") return getLocaleDisplayName(value);
  if (value === "global") return "Global";
  const m = markets.find((mm) => mm.id === value);
  return m ? m.name : value;
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export default function Analytics() {
  const data = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const fetcher = useFetcher<ActionResponse>();
  const staleFetcher = useFetcher<ActionResponse>();
  const retranslateFetcher = useFetcher<ActionResponse>();

  if (navigation.state === "loading" && !navigation.formMethod) {
    return (
      <SkeletonPage primaryAction>
        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              <SkeletonDisplayText size="small" />
              <SkeletonBodyText lines={8} />
            </BlockStack>
          </Layout.Section>
        </Layout>
      </SkeletonPage>
    );
  }

  const [view, setView] = useState<"locale" | "market">(data.view);
  const [overrides, setOverrides] = useState<
    Record<string, { total: number; translated: number; percent: number }>
  >({});
  const [retranslateProvider, setRetranslateProvider] = useState(
    data.activeProviders[0] ?? "",
  );

  const matrix: CoverageMatrix = data.matrix;

  const handleViewChange = (v: string) => {
    setView(v as "locale" | "market");
    const url = new URL(window.location.href);
    url.searchParams.set("view", v);
    window.location.href = url.toString();
  };

  const recompute = (row: string, column: string, locale: string, marketId: string) => {
    const fd = new FormData();
    fd.set("intent", "recompute");
    fd.set("resourceType", row);
    fd.set("locale", locale);
    fd.set("marketId", marketId);
    fd.set("column", column);
    fetcher.submit(fd, { method: "POST" });
  };

  const detectStaleNow = () => {
    const fd = new FormData();
    fd.set("intent", "detect-stale");
    staleFetcher.submit(fd, { method: "POST" });
  };

  const reTranslateStale = () => {
    if (staleFetcher.data && "stale" in staleFetcher.data) {
      const primary = data.locales.find((l) => l.primary)?.locale ?? "en";
      const target = data.locales.find((l) => !l.primary && l.published)?.locale;
      if (!target) return;
      const fd = new FormData();
      fd.set("intent", "retranslate-stale");
      fd.set("stale", JSON.stringify(staleFetcher.data.stale));
      fd.set("provider", retranslateProvider);
      fd.set("sourceLocale", primary);
      fd.set("targetLocale", target);
      retranslateFetcher.submit(fd, { method: "POST" });
    }
  };

  const recomputeResponse =
    fetcher.data && "intent" in fetcher.data && fetcher.data.intent === "recompute"
      ? fetcher.data
      : null;

  if (recomputeResponse) {
    const key = `${recomputeResponse.row}::${recomputeResponse.column}`;
    if (!overrides[key]) {
      setOverrides((prev) => ({ ...prev, [key]: recomputeResponse.cell }));
    }
  }

  const staleList =
    staleFetcher.data && "stale" in staleFetcher.data
      ? staleFetcher.data.stale
      : null;
  const retranslateSuccess =
    retranslateFetcher.data &&
    "intent" in retranslateFetcher.data &&
    retranslateFetcher.data.intent === "retranslate-stale";

  return (
    <Page
      backAction={{ content: "Dashboard", url: "/app" }}
      title="Analytics"
      primaryAction={{
        content: "Usage",
        url: "/app/analytics/usage",
      }}
    >
      <TitleBar title="Analytics" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Translation coverage
                  </Text>
                  <div style={{ minWidth: 180 }}>
                    <Select
                      label="View"
                      labelHidden
                      options={[
                        { label: "By locale", value: "locale" },
                        { label: "By market", value: "market" },
                      ]}
                      value={view}
                      onChange={handleViewChange}
                    />
                  </div>
                </InlineStack>

                {matrix.rows.length === 0 ? (
                  <EmptyState
                    heading="No coverage data yet"
                    image=""
                  >
                    <p>
                      Run an auto-translate job or open a product in the editor
                      to populate coverage stats.
                    </p>
                  </EmptyState>
                ) : (
                  <Box>
                    <table
                      style={{ width: "100%", borderCollapse: "collapse" }}
                    >
                      <thead>
                        <tr style={{ textAlign: "left" }}>
                          <th style={{ padding: 8 }}>Resource type</th>
                          {matrix.columns.map((col) => (
                            <th key={col} style={{ padding: 8 }}>
                              {columnLabel(
                                view,
                                col,
                                data.locales,
                                data.markets,
                              )}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {matrix.rows.map((row) => (
                          <tr
                            key={row}
                            style={{ borderTop: "1px solid var(--p-color-border)" }}
                          >
                            <td style={{ padding: 8 }}>
                              {RESOURCE_TYPES[row]?.label || row}
                            </td>
                            {matrix.columns.map((col) => {
                              const key = `${row}::${col}`;
                              const override = overrides[key];
                              const cell =
                                override ||
                                matrix.cells[row]?.[col] || {
                                  total: 0,
                                  translated: 0,
                                  percent: 0,
                                };
                              const locale =
                                view === "locale" ? col : data.locales.find((l) => !l.primary)?.locale ?? "";
                              const marketId = view === "market" ? (col === "global" ? "" : col) : "";
                              return (
                                <td
                                  key={col}
                                  style={{ padding: 8, verticalAlign: "top" }}
                                >
                                  <InlineStack gap="200" blockAlign="center">
                                    <Donut percent={cell.percent} size={48} />
                                    <BlockStack gap="050">
                                      <Text as="span" variant="bodySm">
                                        {cell.translated}/{cell.total}
                                      </Text>
                                      <Button
                                        variant="plain"
                                        onClick={() =>
                                          recompute(row, col, locale, marketId)
                                        }
                                      >
                                        Recompute
                                      </Button>
                                    </BlockStack>
                                  </InlineStack>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Box>
                )}
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Stale translations
                  </Text>
                  <Button
                    onClick={detectStaleNow}
                    loading={staleFetcher.state === "submitting"}
                  >
                    Detect stale
                  </Button>
                </InlineStack>

                {staleList && staleList.length === 0 && (
                  <Banner tone="success">
                    No stale translations detected.
                  </Banner>
                )}

                {staleList && staleList.length > 0 && (
                  <BlockStack gap="300">
                    <Banner tone="warning">
                      {staleList.length} translation
                      {staleList.length === 1 ? "" : "s"} may be out of sync with
                      the current source content.
                    </Banner>
                    <InlineStack gap="200" blockAlign="end">
                      {data.activeProviders.length > 0 && (
                        <div style={{ minWidth: 180 }}>
                          <Select
                            label="Re-translate using"
                            options={data.activeProviders.map((p) => ({
                              label: p,
                              value: p,
                            }))}
                            value={retranslateProvider}
                            onChange={setRetranslateProvider}
                          />
                        </div>
                      )}
                      <Button
                        variant="primary"
                        onClick={reTranslateStale}
                        disabled={!retranslateProvider}
                        loading={retranslateFetcher.state === "submitting"}
                      >
                        Re-translate stale
                      </Button>
                    </InlineStack>
                    {retranslateSuccess && (
                      <Banner tone="success">
                        Re-translation job queued — watch progress on{" "}
                        <a href="/app/auto-translate">Auto-Translate</a>.
                      </Banner>
                    )}
                    <Box>
                      <table
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                        }}
                      >
                        <thead>
                          <tr style={{ textAlign: "left" }}>
                            <th style={{ padding: 8 }}>Resource</th>
                            <th style={{ padding: 8 }}>Field</th>
                            <th style={{ padding: 8 }}>Current source</th>
                          </tr>
                        </thead>
                        <tbody>
                          {staleList.slice(0, 50).map((row, i) => (
                            <tr
                              key={`${row.resourceId}-${row.fieldKey}-${i}`}
                              style={{
                                borderTop:
                                  "1px solid var(--p-color-border)",
                              }}
                            >
                              <td style={{ padding: 8 }}>
                                <Text as="span" variant="bodySm" breakWord>
                                  {row.resourceId.split("/").pop()}
                                </Text>
                              </td>
                              <td style={{ padding: 8 }}>{row.fieldKey}</td>
                              <td style={{ padding: 8 }}>
                                <Text
                                  as="span"
                                  variant="bodySm"
                                  tone="subdued"
                                  breakWord
                                >
                                  {row.currentSource.length > 120
                                    ? row.currentSource.substring(0, 120) +
                                      "..."
                                    : row.currentSource}
                                </Text>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </Box>
                    {staleList.length > 50 && (
                      <Text as="p" variant="bodySm" tone="subdued">
                        Showing 50 of {staleList.length} rows.
                      </Text>
                    )}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
