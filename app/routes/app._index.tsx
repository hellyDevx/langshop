import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSearchParams, Link } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  InlineGrid,
  Text,
  Badge,
  Select,
  Button,
  DataTable,
  Banner,
  Spinner,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { fetchShopLocales, fetchMarkets } from "../services/markets.server";
import { fetchAllCategoryStats } from "../services/translatable-resources.server";
import { getOnboardingState } from "../services/onboarding.server";
import { TOTAL_STEPS } from "../utils/onboarding-constants";
import { RESOURCE_CATEGORIES, getStatusBadge } from "../utils/resource-type-map";
import { formatLocaleOptions, getLocaleDisplayName } from "../utils/locale-utils";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);

  const [locales, markets, onboarding] = await Promise.all([
    fetchShopLocales(admin),
    fetchMarkets(admin),
    getOnboardingState(session.shop),
  ]);

  const selectedLocale =
    url.searchParams.get("locale") ||
    locales.find((l) => !l.primary && l.published)?.locale ||
    null;

  let categoryStats: Record<string, { totalSampled: number; translatedCount: number; hasResources: boolean }> = {};
  if (selectedLocale) {
    categoryStats = await fetchAllCategoryStats(
      admin,
      session.shop,
      selectedLocale,
    );
  }

  return {
    locales,
    markets,
    selectedLocale,
    categoryStats,
    onboarding,
  };
};

export default function Dashboard() {
  const { locales, markets, selectedLocale, categoryStats, onboarding } =
    useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();

  const primaryLocale = locales.find((l) => l.primary);
  const secondaryLocales = locales.filter((l) => !l.primary && l.published);
  const localeOptions = formatLocaleOptions(locales);

  const handleLocaleChange = (value: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("locale", value);
    setSearchParams(params);
  };

  return (
    <Page>
      <TitleBar title="LangShop - Translation Manager" />
      <BlockStack gap="500">
        {!onboarding.completedAt && (
          <Banner
            tone="info"
            title="Finish setting up LangShop"
            action={{ content: "Finish onboarding", url: "/app/onboarding" }}
          >
            <p>
              Step {Math.min(onboarding.step + 1, TOTAL_STEPS)}/{TOTAL_STEPS} —
              configure a provider and target languages to start translating.
            </p>
          </Banner>
        )}

        {secondaryLocales.length === 0 && (
          <Banner tone="warning">
            <p>
              No secondary languages enabled. Go to Settings &gt; Languages in
              Shopify Admin to add languages.
            </p>
          </Banner>
        )}

        {/* Language selector + summary */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Translation Stats
                </Text>
                <div style={{ maxWidth: "300px" }}>
                  <Select
                    label="Language"
                    options={
                      localeOptions.length > 0
                        ? localeOptions
                        : [{ label: "No languages", value: "" }]
                    }
                    value={selectedLocale || ""}
                    onChange={handleLocaleChange}
                  />
                </div>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Languages
                </Text>
                <InlineStack gap="200" align="start">
                  <Badge tone="success">Primary</Badge>
                  <Text as="span" variant="bodyMd">
                    {getLocaleDisplayName(primaryLocale?.locale ?? "")} (
                    {primaryLocale?.locale})
                  </Text>
                </InlineStack>
                {secondaryLocales.length > 0 && (
                  <InlineStack gap="100" wrap>
                    {secondaryLocales.map((l) => (
                      <Badge key={l.locale}>
                        {getLocaleDisplayName(l.locale)}
                      </Badge>
                    ))}
                  </InlineStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Categories with stats */}
        {selectedLocale &&
          RESOURCE_CATEGORIES.map((category) => (
            <Card key={category.id}>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  {category.label}
                </Text>
                <DataTable
                  columnContentTypes={[
                    "text",
                    "numeric",
                    "numeric",
                    "text",
                    "text",
                  ]}
                  headings={[
                    "Resource type",
                    "Items qty",
                    "Translated",
                    "Status",
                    "Action",
                  ]}
                  rows={category.resourceTypes.map((rt) => {
                    const stats = categoryStats[rt.type] || {
                      totalSampled: 0,
                      translatedCount: 0,
                      hasResources: false,
                    };
                    const badge = getStatusBadge(stats);

                    return [
                      rt.label,
                      stats.hasResources ? String(stats.totalSampled) : "0",
                      stats.hasResources
                        ? String(stats.translatedCount)
                        : "0",
                      badge.tone ? (
                        <Badge tone={badge.tone as "success" | "warning" | "attention" | "info" | "critical"}>{badge.label}</Badge>
                      ) : (
                        <Badge>{badge.label}</Badge>
                      ),
                      stats.hasResources ? (
                        <Link
                          to={`/app/resources/${rt.slug}?locale=${selectedLocale}`}
                          style={{
                            textDecoration: "none",
                          }}
                        >
                          <Button size="slim">Update</Button>
                        </Link>
                      ) : (
                        <Button size="slim" disabled>
                          Update
                        </Button>
                      ),
                    ];
                  })}
                />
              </BlockStack>
            </Card>
          ))}

        {/* Quick links */}
        <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">
                Auto-Translate
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Bulk translate using Google Translate or DeepL
              </Text>
              <Link to="/app/auto-translate" style={{ textDecoration: "none" }}>
                <Button>Launch auto-translate</Button>
              </Link>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">
                Image Translations
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Swap product images per language or market
              </Text>
              <Link to="/app/images" style={{ textDecoration: "none" }}>
                <Button>Manage images</Button>
              </Link>
            </BlockStack>
          </Card>
        </InlineGrid>
      </BlockStack>
    </Page>
  );
}
