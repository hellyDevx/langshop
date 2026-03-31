import { useEffect, useState } from "react";
import {
  useLoaderData,
  useActionData,
  useSubmit,
  useNavigation,
  useSearchParams,
} from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  TextField,
  Button,
  Text,
  Select,
  Banner,
  Badge,
  InlineStack,
  Box,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import {
  fetchTranslatableResource,
  fetchTranslatableResourceWithNested,
} from "../services/translatable-resources.server";
import { registerTranslations } from "../services/translation.server";
import { fetchShopLocales, fetchMarkets } from "../services/markets.server";
import {
  RESOURCE_TYPES,
  getResourceTypeFromSlug,
  getResourceDisplayName,
  getResourceConfig,
} from "../utils/resource-type-map";
import { formatLocaleOptions, getLocaleDisplayName } from "../utils/locale-utils";

// Map slugs to Shopify GID resource names
const SLUG_TO_GID_TYPE = {
  products: "Product",
  collections: "Collection",
  pages: "OnlineStorePage",
  articles: "OnlineStoreArticle",
  blogs: "OnlineStoreBlog",
  metaobjects: "Metaobject",
  "shop-policies": "ShopPolicy",
  navigation: "Menu",
  filters: "Filter",
  "dynamic-text": "OnlineStoreTheme",
  "storefront-elements": "OnlineStoreThemeAppEmbed",
  "store-components": "OnlineStoreThemeSettingsDataSection",
  "theme-locale-content": "OnlineStoreThemeLocaleContent",
  "theme-json-templates": "OnlineStoreThemeJsonTemplate",
  "email-templates": "EmailTemplate",
  "packing-slip": "PackingSlipTemplate",
  "payment-gateways": "PaymentGateway",
  "delivery-methods": "DeliveryMethodDefinition",
};

function buildResourceGid(slug, numericId) {
  const gidType = SLUG_TO_GID_TYPE[slug];
  if (!gidType) return null;
  return `gid://shopify/${gidType}/${numericId}`;
}

export const loader = async ({ request, params }) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const locale = url.searchParams.get("locale");
  const marketId = url.searchParams.get("marketId") || null;

  const resourceId = buildResourceGid(params.type, params.id);
  if (!resourceId) {
    throw new Response("Invalid resource type", { status: 404 });
  }

  const resourceType = getResourceTypeFromSlug(params.type);
  if (!resourceType) {
    throw new Response("Invalid resource type", { status: 404 });
  }

  const [locales, markets] = await Promise.all([
    fetchShopLocales(admin),
    fetchMarkets(admin),
  ]);

  const primaryLocale = locales.find((l) => l.primary);
  // Ensure we never use the primary locale as the target
  const validLocale = locale && locale !== primaryLocale?.locale ? locale : null;
  const selectedLocale =
    validLocale || locales.find((l) => !l.primary && l.published)?.locale || null;

  const config = getResourceConfig(resourceType);
  let resource = null;
  let nestedResources = [];

  if (selectedLocale) {
    try {
      if (config?.hasNestedMetafields) {
        // Fetch with nested resources (metafields, options, etc.)
        resource = await fetchTranslatableResourceWithNested(admin, {
          resourceId,
          locale: selectedLocale,
        });
        nestedResources =
          resource?.nestedTranslatableResources?.nodes || [];
      } else {
        resource = await fetchTranslatableResource(admin, {
          resourceId,
          locale: selectedLocale,
          marketId,
        });
      }
    } catch (error) {
      console.error("Failed to fetch resource:", error);
    }
  }

  return {
    resource,
    nestedResources,
    resourceId,
    resourceType,
    slug: params.type,
    locales,
    markets,
    selectedLocale,
    selectedMarketId: marketId,
  };
};

export const action = async ({ request, params }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const resourceId = buildResourceGid(params.type, params.id);
  const locale = formData.get("locale");
  const marketId = formData.get("marketId") || null;

  // Validate locale is not the primary locale
  const shopLocales = await fetchShopLocales(admin);
  const primaryLocale = shopLocales.find((l) => l.primary);
  if (primaryLocale && locale === primaryLocale.locale) {
    return json(
      { error: `Cannot translate into the primary locale (${locale}). Select a different target language.` },
      { status: 400 },
    );
  }

  if (!locale) {
    return json({ error: "Please select a target language" }, { status: 400 });
  }

  // Group translations by resourceId (main resource + nested resources)
  const translationsByResource = {};
  for (const [key, value] of formData.entries()) {
    // Format: field_{resourceId}_{fieldKey}
    if (key.startsWith("field_")) {
      const rest = key.substring(6); // remove "field_"
      const digestKey = `digest_${rest}`;
      const resIdKey = `resId_${rest}`;
      const digest = formData.get(digestKey);
      const resId = formData.get(resIdKey) || resourceId;

      if (value && digest) {
        // Extract field key from the rest (after resourceId prefix if present)
        const fieldKey = formData.get(`fkey_${rest}`) || rest;

        if (!translationsByResource[resId]) {
          translationsByResource[resId] = [];
        }
        const input = {
          key: fieldKey,
          value: value.toString(),
          locale,
          translatableContentDigest: digest,
        };
        if (marketId) input.marketId = marketId;
        translationsByResource[resId].push(input);
      }
    }
  }

  // Flatten for backward compatibility (main resource only if no grouped data)
  const translations = translationsByResource[resourceId] || [];
  const nestedResourceIds = Object.keys(translationsByResource).filter(
    (id) => id !== resourceId,
  );

  const allTranslations = [
    ...translations.map((t) => ({ ...t, _resourceId: resourceId })),
    ...nestedResourceIds.flatMap((nId) =>
      (translationsByResource[nId] || []).map((t) => ({ ...t, _resourceId: nId })),
    ),
  ];

  if (allTranslations.length === 0) {
    return json({ error: "No translations to save. Enter at least one translation value." }, { status: 400 });
  }

  try {
    // Save main resource translations
    if (translations.length > 0) {
      await registerTranslations(admin, { resourceId, translations });
    }
    // Save nested resource translations
    for (const nId of nestedResourceIds) {
      const nested = translationsByResource[nId];
      if (nested && nested.length > 0) {
        await registerTranslations(admin, { resourceId: nId, translations: nested });
      }
    }
    return json({ success: true });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export default function TranslationEditor() {
  const {
    resource,
    nestedResources,
    resourceId,
    resourceType,
    slug,
    locales,
    markets,
    selectedLocale,
    selectedMarketId,
  } = useLoaderData();

  const actionData = useActionData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [searchParams, setSearchParams] = useSearchParams();

  const isSubmitting = navigation.state === "submitting";
  const config = RESOURCE_TYPES[resourceType];
  const localeOptions = formatLocaleOptions(locales);
  const marketOptions = [
    { label: "Global (all markets)", value: "" },
    ...markets
      .filter((m) => m.enabled)
      .map((m) => ({ label: m.name, value: m.id })),
  ];

  // Build translation map from existing translations
  const translationMap = {};
  if (resource?.translations) {
    resource.translations.forEach((t) => {
      translationMap[t.key] = t;
    });
  }

  // Reset field values when resource/locale changes
  const [fieldValues, setFieldValues] = useState({});

  // Build nested translation maps
  const nestedTranslationMaps = {};
  const nestedFieldValues = {};
  (nestedResources || []).forEach((nr) => {
    const nMap = {};
    (nr.translations || []).forEach((t) => { nMap[t.key] = t; });
    nestedTranslationMaps[nr.resourceId] = nMap;
  });

  const [nestedValues, setNestedValues] = useState({});

  useEffect(() => {
    if (resource?.translatableContent) {
      const newValues = {};
      resource.translatableContent.forEach((field) => {
        newValues[field.key] = translationMap[field.key]?.value || "";
      });
      setFieldValues(newValues);
    }
    // Initialize nested values
    const nv = {};
    (nestedResources || []).forEach((nr) => {
      const nMap = nestedTranslationMaps[nr.resourceId] || {};
      nv[nr.resourceId] = {};
      nr.translatableContent.forEach((field) => {
        nv[nr.resourceId][field.key] = nMap[field.key]?.value || "";
      });
    });
    setNestedValues(nv);
  }, [resourceId, selectedLocale, selectedMarketId]);

  const handleLocaleChange = (value) => {
    const params = new URLSearchParams(searchParams);
    params.set("locale", value);
    setSearchParams(params);
  };

  const handleMarketChange = (value) => {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set("marketId", value);
    } else {
      params.delete("marketId");
    }
    setSearchParams(params);
  };

  const handleSave = () => {
    const formData = new FormData();
    formData.set("locale", selectedLocale);
    if (selectedMarketId) formData.set("marketId", selectedMarketId);

    // Main resource fields
    resource.translatableContent.forEach((field) => {
      if (fieldValues[field.key]) {
        const uid = `main_${field.key}`;
        formData.set(`field_${uid}`, fieldValues[field.key]);
        formData.set(`digest_${uid}`, field.digest);
        formData.set(`resId_${uid}`, resourceId);
        formData.set(`fkey_${uid}`, field.key);
      }
    });

    // Nested resource fields
    (nestedResources || []).forEach((nr) => {
      const nrValues = nestedValues[nr.resourceId] || {};
      nr.translatableContent.forEach((field) => {
        if (nrValues[field.key]) {
          const uid = `nested_${nr.resourceId}_${field.key}`;
          formData.set(`field_${uid}`, nrValues[field.key]);
          formData.set(`digest_${uid}`, field.digest);
          formData.set(`resId_${uid}`, nr.resourceId);
          formData.set(`fkey_${uid}`, field.key);
        }
      });
    });

    submit(formData, { method: "POST" });
  };

  const resourceName = resource
    ? getResourceDisplayName(resource.translatableContent)
    : "Resource";

  return (
    <Page
      backAction={{
        content: config?.label,
        url: `/app/resources/${slug}?locale=${selectedLocale || ""}`,
      }}
      title={resourceName}
    >
      <TitleBar title={`Translate: ${resourceName}`} />
      <BlockStack gap="400">
        {actionData?.success && (
          <Banner tone="success" onDismiss={() => {}}>
            Translations saved successfully!
          </Banner>
        )}
        {actionData?.error && (
          <Banner tone="critical" onDismiss={() => {}}>
            Error: {actionData.error}
          </Banner>
        )}

        <Card>
          <InlineStack gap="400" align="start">
            <div style={{ width: "250px" }}>
              <Select
                label="Target language"
                options={localeOptions}
                value={selectedLocale || ""}
                onChange={handleLocaleChange}
              />
            </div>
            <div style={{ width: "250px" }}>
              <Select
                label="Market scope"
                options={marketOptions}
                value={selectedMarketId || ""}
                onChange={handleMarketChange}
              />
            </div>
          </InlineStack>
        </Card>

        {!selectedLocale ? (
          <Banner>Please select a target language to start translating.</Banner>
        ) : !resource ? (
          <Banner tone="warning">Could not load resource data.</Banner>
        ) : (
          <>
          <Layout>
            <Layout.Section variant="oneHalf">
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <Text as="h2" variant="headingMd">
                      Original (
                      {getLocaleDisplayName(
                        locales.find((l) => l.primary)?.locale || "en",
                      )}
                      )
                    </Text>
                  </InlineStack>
                  {resource.translatableContent
                    .filter((field) => field.value)
                    .map((field) => (
                      <Box key={field.key}>
                        <BlockStack gap="100">
                          <Text as="label" variant="bodySm" tone="subdued">
                            {field.key}
                          </Text>
                          <Box
                            padding="300"
                            background="bg-surface-secondary"
                            borderRadius="200"
                          >
                            <Text as="p" variant="bodyMd" breakWord>
                              {field.value.length > 500
                                ? field.value.substring(0, 500) + "..."
                                : field.value}
                            </Text>
                          </Box>
                        </BlockStack>
                      </Box>
                    ))}
                </BlockStack>
              </Card>
            </Layout.Section>

            <Layout.Section variant="oneHalf">
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <Text as="h2" variant="headingMd">
                      Translation ({getLocaleDisplayName(selectedLocale)})
                    </Text>
                    {selectedMarketId && (
                      <Badge tone="info">Market-specific</Badge>
                    )}
                  </InlineStack>
                  {resource.translatableContent
                    .filter((field) => field.value)
                    .map((field) => {
                      const existing = translationMap[field.key];
                      const isMultiline =
                        field.value.length > 100 ||
                        field.value.includes("\n") ||
                        field.key === "body" ||
                        field.key === "body_html";

                      return (
                        <Box key={field.key}>
                          <BlockStack gap="100">
                            <InlineStack gap="200" align="start">
                              <Text
                                as="label"
                                variant="bodySm"
                                tone="subdued"
                              >
                                {field.key}
                              </Text>
                              {existing?.outdated && (
                                <Badge tone="warning">Outdated</Badge>
                              )}
                            </InlineStack>
                            <TextField
                              label=""
                              labelHidden
                              value={fieldValues[field.key] || ""}
                              onChange={(val) =>
                                setFieldValues((prev) => ({
                                  ...prev,
                                  [field.key]: val,
                                }))
                              }
                              multiline={isMultiline ? 4 : false}
                              autoComplete="off"
                              placeholder={`Enter ${selectedLocale} translation...`}
                            />
                          </BlockStack>
                        </Box>
                      );
                    })}

                  <InlineStack align="end">
                    <Button
                      variant="primary"
                      onClick={handleSave}
                      loading={isSubmitting}
                    >
                      Save Translations
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>

          {/* Nested resources (metafields, options, etc.) */}
          {nestedResources && nestedResources.length > 0 && (
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Metafields & Related Content
                </Text>
                {nestedResources
                  .filter((nr) =>
                    nr.translatableContent.some((c) => c.value),
                  )
                  .map((nr) => {
                    const nMap = nestedTranslationMaps[nr.resourceId] || {};
                    const nrVals = nestedValues[nr.resourceId] || {};
                    const nestedName =
                      nr.translatableContent.find((c) => c.key === "name" || c.key === "title")?.value ||
                      nr.resourceId.split("/").pop();

                    return (
                      <Box
                        key={nr.resourceId}
                        padding="400"
                        background="bg-surface-secondary"
                        borderRadius="200"
                      >
                        <BlockStack gap="300">
                          <Text as="h3" variant="headingSm">
                            {nestedName}
                          </Text>
                          {nr.translatableContent
                            .filter((field) => field.value)
                            .map((field) => {
                              const existing = nMap[field.key];
                              return (
                                <InlineStack
                                  key={field.key}
                                  gap="400"
                                  align="start"
                                >
                                  <div style={{ flex: 1 }}>
                                    <BlockStack gap="100">
                                      <Text
                                        as="label"
                                        variant="bodySm"
                                        tone="subdued"
                                      >
                                        {field.key} (original)
                                      </Text>
                                      <Text as="p" variant="bodyMd" breakWord>
                                        {field.value.length > 200
                                          ? field.value.substring(0, 200) + "..."
                                          : field.value}
                                      </Text>
                                    </BlockStack>
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <BlockStack gap="100">
                                      <InlineStack gap="200">
                                        <Text
                                          as="label"
                                          variant="bodySm"
                                          tone="subdued"
                                        >
                                          {field.key} (translation)
                                        </Text>
                                        {existing?.outdated && (
                                          <Badge tone="warning">
                                            Outdated
                                          </Badge>
                                        )}
                                      </InlineStack>
                                      <TextField
                                        label=""
                                        labelHidden
                                        value={nrVals[field.key] || ""}
                                        onChange={(val) =>
                                          setNestedValues((prev) => ({
                                            ...prev,
                                            [nr.resourceId]: {
                                              ...prev[nr.resourceId],
                                              [field.key]: val,
                                            },
                                          }))
                                        }
                                        multiline={
                                          field.value.length > 100 ? 3 : false
                                        }
                                        autoComplete="off"
                                        placeholder={`${selectedLocale} translation...`}
                                      />
                                    </BlockStack>
                                  </div>
                                </InlineStack>
                              );
                            })}
                        </BlockStack>
                      </Box>
                    );
                  })}
              </BlockStack>
            </Card>
          )}
        </>
        )}
      </BlockStack>
    </Page>
  );
}
