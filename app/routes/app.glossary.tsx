import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Link as RemixLink,
  useFetcher,
  useLoaderData,
  useSearchParams,
} from "@remix-run/react";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  EmptyState,
  InlineStack,
  Modal,
  Page,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import type { GlossaryTerm } from "@prisma/client";
import { authenticate } from "../shopify.server";
import { fetchShopLocales } from "../services/markets.server";
import {
  createGlossaryTerm,
  deleteGlossaryTerm,
  exportGlossaryCsv,
  getGlossaryTerms,
  GlossaryDuplicateError,
  quickAddBrandProtection,
  updateGlossaryTerm,
} from "../services/glossary.server";
import type { ShopLocale } from "../types/shopify";
import { formatAllLocaleOptions, getLocaleDisplayName } from "../utils/locale-utils";

interface LoaderData {
  shop: string;
  locales: ShopLocale[];
  terms: GlossaryTerm[];
  hasMore: boolean;
  endCursor: string | null;
  protectedCount: number;
  sourceLocaleFilter: string;
  targetLocaleFilter: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);

  if (url.searchParams.get("export") === "csv") {
    const sourceLocale = url.searchParams.get("sourceLocale") || undefined;
    const targetLocale = url.searchParams.get("targetLocale") || undefined;
    const csv = await exportGlossaryCsv(session.shop, {
      sourceLocale,
      targetLocale,
    });
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="glossary.csv"',
      },
    });
  }

  const sourceLocale = url.searchParams.get("sourceLocale") || undefined;
  const targetLocale = url.searchParams.get("targetLocale") || undefined;
  const cursor = url.searchParams.get("cursor") || undefined;

  const [locales, result, protectedCount] = await Promise.all([
    fetchShopLocales(admin),
    getGlossaryTerms(session.shop, {
      sourceLocale,
      targetLocale,
      cursor,
      limit: 25,
    }),
    // Use a separate count so protected-terms total is accurate across pages.
    (async () => {
      const all = await getGlossaryTerms(session.shop, { limit: 1000 });
      return all.terms.filter((t) => t.neverTranslate).length;
    })(),
  ]);

  return json({
    shop: session.shop,
    locales,
    terms: result.terms,
    hasMore: result.hasMore,
    endCursor: result.endCursor,
    protectedCount,
    sourceLocaleFilter: sourceLocale || "",
    targetLocaleFilter: targetLocale || "",
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    if (intent === "create") {
      await createGlossaryTerm(session.shop, {
        sourceLocale: String(formData.get("sourceLocale") || ""),
        targetLocale: String(formData.get("targetLocale") || ""),
        sourceTerm: String(formData.get("sourceTerm") || "").trim(),
        targetTerm: String(formData.get("targetTerm") || "").trim(),
        caseSensitive: formData.get("caseSensitive") === "on",
        neverTranslate: formData.get("neverTranslate") === "on",
      });
      return json({ success: true, message: "Term added." });
    }

    if (intent === "update") {
      const id = String(formData.get("id") || "");
      await updateGlossaryTerm(session.shop, id, {
        sourceTerm: String(formData.get("sourceTerm") || "").trim(),
        targetTerm: String(formData.get("targetTerm") || "").trim(),
        caseSensitive: formData.get("caseSensitive") === "on",
        neverTranslate: formData.get("neverTranslate") === "on",
      });
      return json({ success: true, message: "Term updated." });
    }

    if (intent === "delete") {
      const id = String(formData.get("id") || "");
      await deleteGlossaryTerm(session.shop, id);
      return json({ success: true, message: "Term deleted." });
    }

    if (intent === "quick-add-brand") {
      const brandName = String(formData.get("brandName") || "").trim();
      if (!brandName) {
        return json({ error: "Brand name is required." }, { status: 400 });
      }
      const locales = await fetchShopLocales(admin);
      const primary = locales.find((l) => l.primary);
      if (!primary) {
        return json(
          { error: "No primary locale configured for this shop." },
          { status: 400 },
        );
      }
      const targets = locales
        .filter((l) => !l.primary && l.published)
        .map((l) => l.locale);
      if (targets.length === 0) {
        return json(
          { error: "No published non-primary locales to protect against." },
          { status: 400 },
        );
      }
      const result = await quickAddBrandProtection(
        session.shop,
        brandName,
        primary.locale,
        targets,
      );
      return json({
        success: true,
        message: `Added ${result.created} protection${result.created === 1 ? "" : "s"} (${result.skipped} already existed).`,
      });
    }

    return json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    if (err instanceof GlossaryDuplicateError) {
      return json({ error: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, { status: 500 });
  }
};

interface EditingState {
  id: string;
  sourceTerm: string;
  targetTerm: string;
  caseSensitive: boolean;
  neverTranslate: boolean;
}

export default function GlossaryPage() {
  const data = useLoaderData<LoaderData>();
  const fetcher = useFetcher<{
    success?: boolean;
    message?: string;
    error?: string;
  }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const isSubmitting = fetcher.state === "submitting";

  const localeOptions = [
    { label: "Any locale", value: "" },
    ...formatAllLocaleOptions(data.locales),
  ];
  const addLocaleOptions = formatAllLocaleOptions(data.locales);

  const [addForm, setAddForm] = useState({
    sourceLocale: addLocaleOptions[0]?.value || "",
    targetLocale: addLocaleOptions[1]?.value || addLocaleOptions[0]?.value || "",
    sourceTerm: "",
    targetTerm: "",
    caseSensitive: false,
    neverTranslate: false,
  });
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [brandName, setBrandName] = useState("");

  const updateFilter = (key: "sourceLocale" | "targetLocale", value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("cursor");
    setSearchParams(next);
  };

  const submitCreate = () => {
    const fd = new FormData();
    fd.set("intent", "create");
    fd.set("sourceLocale", addForm.sourceLocale);
    fd.set("targetLocale", addForm.targetLocale);
    fd.set("sourceTerm", addForm.sourceTerm);
    fd.set("targetTerm", addForm.targetTerm);
    if (addForm.caseSensitive) fd.set("caseSensitive", "on");
    if (addForm.neverTranslate) fd.set("neverTranslate", "on");
    fetcher.submit(fd, { method: "POST" });
    setAddForm({
      ...addForm,
      sourceTerm: "",
      targetTerm: "",
    });
  };

  const submitUpdate = () => {
    if (!editing) return;
    const fd = new FormData();
    fd.set("intent", "update");
    fd.set("id", editing.id);
    fd.set("sourceTerm", editing.sourceTerm);
    fd.set("targetTerm", editing.targetTerm);
    if (editing.caseSensitive) fd.set("caseSensitive", "on");
    if (editing.neverTranslate) fd.set("neverTranslate", "on");
    fetcher.submit(fd, { method: "POST" });
    setEditing(null);
  };

  const submitDelete = () => {
    if (!confirmDelete) return;
    const fd = new FormData();
    fd.set("intent", "delete");
    fd.set("id", confirmDelete);
    fetcher.submit(fd, { method: "POST" });
    setConfirmDelete(null);
  };

  const submitBrandQuickAdd = () => {
    if (!brandName.trim()) return;
    const fd = new FormData();
    fd.set("intent", "quick-add-brand");
    fd.set("brandName", brandName.trim());
    fetcher.submit(fd, { method: "POST" });
    setBrandName("");
  };

  const nextCursor = data.hasMore ? data.endCursor : null;
  const goNextPage = () => {
    if (!nextCursor) return;
    const next = new URLSearchParams(searchParams);
    next.set("cursor", nextCursor);
    setSearchParams(next);
  };
  const goFirstPage = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("cursor");
    setSearchParams(next);
  };

  const buildExportUrl = () => {
    const params = new URLSearchParams();
    params.set("export", "csv");
    if (data.sourceLocaleFilter) params.set("sourceLocale", data.sourceLocaleFilter);
    if (data.targetLocaleFilter) params.set("targetLocale", data.targetLocaleFilter);
    return `/app/glossary?${params.toString()}`;
  };

  return (
    <Page
      title="Glossary"
      subtitle="Control how specific terms are translated across your store."
      primaryAction={
        <Button url="/app/glossary/import" variant="primary">
          Import CSV
        </Button>
      }
      secondaryActions={[
        {
          content: "Export CSV",
          url: buildExportUrl(),
          external: false,
        },
      ]}
    >
      <TitleBar title="Glossary" />
      <BlockStack gap="500">
        {fetcher.data?.success && fetcher.data.message && (
          <Banner tone="success">{fetcher.data.message}</Banner>
        )}
        {fetcher.data?.error && (
          <Banner tone="critical">{fetcher.data.error}</Banner>
        )}

        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">
                Brand protection
              </Text>
              <Badge tone={data.protectedCount > 0 ? "success" : undefined}>
                {`${data.protectedCount} protected term${data.protectedCount === 1 ? "" : "s"}`}
              </Badge>
            </InlineStack>
            <Text as="p" variant="bodyMd" tone="subdued">
              Add a brand or product name that should stay the same in every
              language. We'll create a "never translate" rule paired with every
              published target locale.
            </Text>
            <InlineStack gap="200" blockAlign="end">
              <div style={{ flex: 1 }}>
                <TextField
                  label="Brand name"
                  labelHidden
                  value={brandName}
                  onChange={setBrandName}
                  autoComplete="off"
                  placeholder="e.g. Acme"
                />
              </div>
              <Button
                onClick={submitBrandQuickAdd}
                disabled={!brandName.trim() || isSubmitting}
                loading={isSubmitting}
              >
                Protect brand
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Add term
            </Text>
            <InlineStack gap="300" wrap>
              <div style={{ minWidth: 160 }}>
                <Select
                  label="Source locale"
                  options={addLocaleOptions}
                  value={addForm.sourceLocale}
                  onChange={(v) =>
                    setAddForm({ ...addForm, sourceLocale: v })
                  }
                />
              </div>
              <div style={{ minWidth: 160 }}>
                <Select
                  label="Target locale"
                  options={addLocaleOptions}
                  value={addForm.targetLocale}
                  onChange={(v) =>
                    setAddForm({ ...addForm, targetLocale: v })
                  }
                />
              </div>
              <div style={{ minWidth: 180, flex: 1 }}>
                <TextField
                  label="Source term"
                  value={addForm.sourceTerm}
                  onChange={(v) =>
                    setAddForm({ ...addForm, sourceTerm: v })
                  }
                  autoComplete="off"
                />
              </div>
              <div style={{ minWidth: 180, flex: 1 }}>
                <TextField
                  label="Target term"
                  value={addForm.targetTerm}
                  onChange={(v) =>
                    setAddForm({ ...addForm, targetTerm: v })
                  }
                  autoComplete="off"
                  disabled={addForm.neverTranslate}
                  helpText={
                    addForm.neverTranslate
                      ? "Not used when Never translate is on."
                      : undefined
                  }
                />
              </div>
            </InlineStack>
            <InlineStack gap="400" blockAlign="center">
              <Checkbox
                label="Case sensitive"
                checked={addForm.caseSensitive}
                onChange={(v) =>
                  setAddForm({ ...addForm, caseSensitive: v })
                }
              />
              <Checkbox
                label="Never translate"
                checked={addForm.neverTranslate}
                onChange={(v) =>
                  setAddForm({ ...addForm, neverTranslate: v })
                }
              />
              <Button
                onClick={submitCreate}
                variant="primary"
                loading={isSubmitting}
                disabled={
                  !addForm.sourceLocale ||
                  !addForm.targetLocale ||
                  !addForm.sourceTerm ||
                  (!addForm.neverTranslate && !addForm.targetTerm)
                }
              >
                Add term
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="end" gap="300">
              <Text as="h2" variant="headingMd">
                Terms
              </Text>
              <InlineStack gap="200">
                <div style={{ minWidth: 180 }}>
                  <Select
                    label="Source locale"
                    labelHidden
                    options={localeOptions}
                    value={data.sourceLocaleFilter}
                    onChange={(v) => updateFilter("sourceLocale", v)}
                  />
                </div>
                <div style={{ minWidth: 180 }}>
                  <Select
                    label="Target locale"
                    labelHidden
                    options={localeOptions}
                    value={data.targetLocaleFilter}
                    onChange={(v) => updateFilter("targetLocale", v)}
                  />
                </div>
              </InlineStack>
            </InlineStack>

            {data.terms.length === 0 ? (
              <EmptyState
                heading="No glossary terms yet"
                image=""
                action={{ content: "Import CSV", url: "/app/glossary/import" }}
              >
                <p>
                  Add terms above or import a CSV to start enforcing consistent
                  translations.
                </p>
              </EmptyState>
            ) : (
              <Box>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left" }}>
                      <th style={{ padding: 8 }}>Source term</th>
                      <th style={{ padding: 8 }}>Target term</th>
                      <th style={{ padding: 8 }}>Locale pair</th>
                      <th style={{ padding: 8 }}>Flags</th>
                      <th style={{ padding: 8, textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.terms.map((t) => {
                      const rowEditing = editing?.id === t.id ? editing : null;
                      const isEditing = rowEditing !== null;
                      return (
                        <tr
                          key={t.id}
                          style={{ borderTop: "1px solid var(--p-color-border)" }}
                        >
                          <td style={{ padding: 8 }}>
                            {rowEditing ? (
                              <TextField
                                label=""
                                labelHidden
                                value={rowEditing.sourceTerm}
                                onChange={(v) =>
                                  setEditing({ ...rowEditing, sourceTerm: v })
                                }
                                autoComplete="off"
                              />
                            ) : (
                              <Text as="span">{t.sourceTerm}</Text>
                            )}
                          </td>
                          <td style={{ padding: 8 }}>
                            {rowEditing ? (
                              <TextField
                                label=""
                                labelHidden
                                value={rowEditing.targetTerm}
                                onChange={(v) =>
                                  setEditing({ ...rowEditing, targetTerm: v })
                                }
                                disabled={rowEditing.neverTranslate}
                                autoComplete="off"
                              />
                            ) : t.neverTranslate ? (
                              <Text as="span" tone="subdued">
                                —
                              </Text>
                            ) : (
                              <Text as="span">{t.targetTerm}</Text>
                            )}
                          </td>
                          <td style={{ padding: 8 }}>
                            <Text as="span" variant="bodySm" tone="subdued">
                              {getLocaleDisplayName(t.sourceLocale)} →{" "}
                              {getLocaleDisplayName(t.targetLocale)}
                            </Text>
                          </td>
                          <td style={{ padding: 8 }}>
                            <InlineStack gap="100">
                              {rowEditing ? (
                                <>
                                  <Checkbox
                                    label="Case"
                                    checked={rowEditing.caseSensitive}
                                    onChange={(v) =>
                                      setEditing({ ...rowEditing, caseSensitive: v })
                                    }
                                  />
                                  <Checkbox
                                    label="Never"
                                    checked={rowEditing.neverTranslate}
                                    onChange={(v) =>
                                      setEditing({ ...rowEditing, neverTranslate: v })
                                    }
                                  />
                                </>
                              ) : (
                                <>
                                  {t.caseSensitive && (
                                    <Badge>Case-sensitive</Badge>
                                  )}
                                  {t.neverTranslate && (
                                    <Badge tone="warning">Never translate</Badge>
                                  )}
                                </>
                              )}
                            </InlineStack>
                          </td>
                          <td style={{ padding: 8, textAlign: "right" }}>
                            <InlineStack gap="100" align="end">
                              {isEditing ? (
                                <>
                                  <Button onClick={submitUpdate} variant="primary">
                                    Save
                                  </Button>
                                  <Button onClick={() => setEditing(null)}>
                                    Cancel
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    onClick={() =>
                                      setEditing({
                                        id: t.id,
                                        sourceTerm: t.sourceTerm,
                                        targetTerm: t.targetTerm,
                                        caseSensitive: t.caseSensitive,
                                        neverTranslate: t.neverTranslate,
                                      })
                                    }
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    tone="critical"
                                    onClick={() => setConfirmDelete(t.id)}
                                  >
                                    Delete
                                  </Button>
                                </>
                              )}
                            </InlineStack>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Box>
            )}

            <InlineStack align="end" gap="200">
              {searchParams.get("cursor") && (
                <Button onClick={goFirstPage}>First page</Button>
              )}
              {nextCursor && <Button onClick={goNextPage}>Next</Button>}
            </InlineStack>
          </BlockStack>
        </Card>

        <Box>
          <Text as="p" variant="bodySm" tone="subdued">
            <RemixLink to="/app/settings/brand-voice">
              Configure brand voice →
            </RemixLink>
          </Text>
        </Box>
      </BlockStack>

      {confirmDelete && (
        <Modal
          open
          onClose={() => setConfirmDelete(null)}
          title="Delete glossary term?"
          primaryAction={{
            content: "Delete",
            destructive: true,
            onAction: submitDelete,
          }}
          secondaryActions={[
            { content: "Cancel", onAction: () => setConfirmDelete(null) },
          ]}
        >
          <Modal.Section>
            <Text as="p">This cannot be undone.</Text>
          </Modal.Section>
        </Modal>
      )}
    </Page>
  );
}
