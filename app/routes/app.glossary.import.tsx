import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useFetcher } from "@remix-run/react";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  DropZone,
  InlineStack,
  Page,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  GLOSSARY_CSV_TEMPLATE,
  importGlossaryCsv,
  parseGlossaryCsv,
  type ParsedCsvRow,
} from "../services/glossary.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  if (url.searchParams.get("template") === "csv") {
    return new Response(GLOSSARY_CSV_TEMPLATE, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="glossary-template.csv"',
      },
    });
  }
  return json({ shop: session.shop });
};

interface PreviewResponse {
  intent: "preview";
  rows: ParsedCsvRow[];
  validCount: number;
  invalidCount: number;
  willCreate: number;
  willUpdate: number;
}

interface ConfirmResponse {
  intent: "confirm";
  success: true;
  created: number;
  updated: number;
  skipped: number;
}

interface ErrorResponse {
  error: string;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "preview") {
    const csv = String(formData.get("csv") || "");
    if (!csv.trim()) {
      return json<ErrorResponse>(
        { error: "CSV content is empty." },
        { status: 400 },
      );
    }
    const rows = parseGlossaryCsv(csv);
    if (rows.length === 0) {
      return json<ErrorResponse>(
        {
          error:
            "No rows found. Ensure the CSV has a header and at least one data row.",
        },
        { status: 400 },
      );
    }
    // Determine new vs update by checking existence.
    const validRows = rows.filter((r) => !r.error);
    let willCreate = 0;
    let willUpdate = 0;
    for (const r of validRows) {
      const existing = await prisma.glossaryTerm.findUnique({
        where: {
          shop_sourceLocale_targetLocale_sourceTerm: {
            shop: session.shop,
            sourceLocale: r.sourceLocale,
            targetLocale: r.targetLocale,
            sourceTerm: r.sourceTerm,
          },
        },
        select: { id: true },
      });
      if (existing) willUpdate++;
      else willCreate++;
    }
    return json<PreviewResponse>({
      intent: "preview",
      rows,
      validCount: validRows.length,
      invalidCount: rows.length - validRows.length,
      willCreate,
      willUpdate,
    });
  }

  if (intent === "confirm") {
    const serialized = String(formData.get("rows") || "");
    let rows: ParsedCsvRow[];
    try {
      rows = JSON.parse(serialized) as ParsedCsvRow[];
    } catch {
      return json<ErrorResponse>(
        { error: "Invalid preview payload." },
        { status: 400 },
      );
    }
    const result = await importGlossaryCsv(session.shop, rows);
    return json<ConfirmResponse>({
      intent: "confirm",
      success: true,
      ...result,
    });
  }

  return json<ErrorResponse>({ error: "Unknown action." }, { status: 400 });
};

type FetcherData = PreviewResponse | ConfirmResponse | ErrorResponse | undefined;

function isPreview(data: FetcherData): data is PreviewResponse {
  return !!data && (data as PreviewResponse).intent === "preview";
}

function isConfirm(data: FetcherData): data is ConfirmResponse {
  return !!data && (data as ConfirmResponse).intent === "confirm";
}

function isError(data: FetcherData): data is ErrorResponse {
  return !!data && "error" in data;
}

export default function GlossaryImport() {
  const fetcher = useFetcher<FetcherData>();
  const [filename, setFilename] = useState<string | null>(null);

  const handleDrop = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setFilename(file.name);
    const text = await file.text();
    const fd = new FormData();
    fd.set("intent", "preview");
    fd.set("csv", text);
    fetcher.submit(fd, { method: "POST" });
  };

  const handleConfirm = () => {
    if (!isPreview(fetcher.data)) return;
    const valid = fetcher.data.rows.filter((r) => !r.error);
    const fd = new FormData();
    fd.set("intent", "confirm");
    fd.set("rows", JSON.stringify(valid));
    fetcher.submit(fd, { method: "POST" });
  };

  const reset = () => {
    setFilename(null);
    // Clear fetcher state by submitting an empty GET won't work — just hide UI with state.
  };

  const confirmed = isConfirm(fetcher.data) ? fetcher.data : null;
  const preview = isPreview(fetcher.data) ? fetcher.data : null;

  return (
    <Page
      backAction={{ content: "Glossary", url: "/app/glossary" }}
      title="Import glossary CSV"
    >
      <TitleBar title="Import glossary CSV" />
      <BlockStack gap="500">
        {isError(fetcher.data) && (
          <Banner tone="critical">{fetcher.data.error}</Banner>
        )}

        {confirmed && (
          <Banner
            tone="success"
            action={{ content: "Back to glossary", url: "/app/glossary" }}
          >
            Imported {confirmed.created} new, updated {confirmed.updated}
            {confirmed.skipped > 0 && `, skipped ${confirmed.skipped}`}.
          </Banner>
        )}

        {!confirmed && (
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  Upload CSV
                </Text>
                <Button url="/app/glossary/import?template=csv" variant="plain">
                  Download template
                </Button>
              </InlineStack>
              <Text as="p" variant="bodyMd" tone="subdued">
                Columns: source_term, target_term, source_locale, target_locale,
                case_sensitive, never_translate.
              </Text>
              <DropZone
                accept=".csv,text/csv"
                type="file"
                allowMultiple={false}
                onDrop={(_, accepted) => handleDrop(accepted)}
              >
                <DropZone.FileUpload
                  actionTitle={filename || "Add CSV file"}
                  actionHint="Drop a CSV or click to browse"
                />
              </DropZone>
            </BlockStack>
          </Card>
        )}

        {preview && (
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  Preview
                </Text>
                <InlineStack gap="200">
                  <Badge tone="success">{`${preview.willCreate} new`}</Badge>
                  <Badge tone="attention">{`${preview.willUpdate} will update`}</Badge>
                  {preview.invalidCount > 0 && (
                    <Badge tone="critical">{`${preview.invalidCount} invalid`}</Badge>
                  )}
                </InlineStack>
              </InlineStack>

              <Box>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left" }}>
                      <th style={{ padding: 8 }}>Line</th>
                      <th style={{ padding: 8 }}>Source</th>
                      <th style={{ padding: 8 }}>Target</th>
                      <th style={{ padding: 8 }}>Locales</th>
                      <th style={{ padding: 8 }}>Flags</th>
                      <th style={{ padding: 8 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r) => (
                      <tr
                        key={r.lineNumber}
                        style={{
                          borderTop: "1px solid var(--p-color-border)",
                          background: r.error
                            ? "var(--p-color-bg-surface-critical-subdued)"
                            : undefined,
                        }}
                      >
                        <td style={{ padding: 8 }}>{r.lineNumber}</td>
                        <td style={{ padding: 8 }}>{r.sourceTerm}</td>
                        <td style={{ padding: 8 }}>
                          {r.neverTranslate ? (
                            <Text as="span" tone="subdued">
                              —
                            </Text>
                          ) : (
                            r.targetTerm
                          )}
                        </td>
                        <td style={{ padding: 8 }}>
                          <Text as="span" variant="bodySm" tone="subdued">
                            {r.sourceLocale} → {r.targetLocale}
                          </Text>
                        </td>
                        <td style={{ padding: 8 }}>
                          <InlineStack gap="100">
                            {r.caseSensitive && <Badge>Case</Badge>}
                            {r.neverTranslate && (
                              <Badge tone="warning">Never</Badge>
                            )}
                          </InlineStack>
                        </td>
                        <td style={{ padding: 8 }}>
                          {r.error ? (
                            <Text as="span" tone="critical" variant="bodySm">
                              {r.error}
                            </Text>
                          ) : (
                            <Badge tone="success">Ready</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Box>

              <InlineStack align="end" gap="200">
                <Button onClick={reset}>Start over</Button>
                <Button
                  variant="primary"
                  onClick={handleConfirm}
                  disabled={preview.validCount === 0}
                  loading={fetcher.state === "submitting"}
                >
                  {`Import ${preview.validCount} term${preview.validCount === 1 ? "" : "s"}`}
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
