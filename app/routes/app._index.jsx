import { useLoaderData, Link } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineGrid,
  Text,
  Badge,
  InlineStack,
  Banner,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { fetchShopLocales, fetchMarkets } from "../services/markets.server";
import { RESOURCE_TYPES } from "../utils/resource-type-map";
import { getLocaleDisplayName } from "../utils/locale-utils";
import { TRANSLATABLE_RESOURCES_QUERY } from "../graphql/queries/translatableResources";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const [locales, markets] = await Promise.all([
    fetchShopLocales(admin),
    fetchMarkets(admin),
  ]);

  // Fetch counts for key resource types (just first page to get a sense)
  const resourceCounts = {};
  const keyTypes = ["PRODUCT", "COLLECTION", "PAGE", "ARTICLE", "METAFIELD"];

  await Promise.all(
    keyTypes.map(async (type) => {
      try {
        const response = await admin.graphql(TRANSLATABLE_RESOURCES_QUERY, {
          variables: { resourceType: type, first: 1 },
        });
        const { data } = await response.json();
        resourceCounts[type] = {
          hasResources: data.translatableResources.nodes.length > 0,
        };
      } catch {
        resourceCounts[type] = { hasResources: false };
      }
    }),
  );

  return {
    locales,
    markets,
    resourceCounts,
  };
};

export default function Dashboard() {
  const { locales, markets, resourceCounts } = useLoaderData();

  const primaryLocale = locales.find((l) => l.primary);
  const secondaryLocales = locales.filter((l) => !l.primary && l.published);

  return (
    <Page>
      <TitleBar title="LangShop - Translation Manager" />
      <BlockStack gap="500">
        {secondaryLocales.length === 0 && (
          <Banner tone="warning">
            <p>
              No secondary languages are enabled on your store. Go to{" "}
              <strong>Settings &gt; Languages</strong> in Shopify Admin to add
              languages before translating.
            </p>
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Languages
                </Text>
                <BlockStack gap="300">
                  <InlineStack gap="200" align="start">
                    <Badge tone="success">Primary</Badge>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                      {getLocaleDisplayName(primaryLocale?.locale)}{" "}
                      ({primaryLocale?.locale})
                    </Text>
                  </InlineStack>

                  {secondaryLocales.length > 0 && (
                    <BlockStack gap="200">
                      <Text as="p" variant="bodySm" tone="subdued">
                        {secondaryLocales.length} translation{" "}
                        {secondaryLocales.length === 1
                          ? "language"
                          : "languages"}{" "}
                        enabled
                      </Text>
                      <InlineStack gap="200" wrap>
                        {secondaryLocales.map((locale) => (
                          <Badge key={locale.locale}>
                            {getLocaleDisplayName(locale.locale)} (
                            {locale.locale})
                          </Badge>
                        ))}
                      </InlineStack>
                    </BlockStack>
                  )}
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Markets
                </Text>
                <BlockStack gap="200">
                  {markets.map((market) => (
                    <InlineStack
                      key={market.id}
                      gap="200"
                      align="start"
                    >
                      <Badge
                        tone={market.primary ? "success" : "info"}
                      >
                        {market.primary ? "Primary" : "Active"}
                      </Badge>
                      <Text as="span" variant="bodyMd">
                        {market.name}
                      </Text>
                    </InlineStack>
                  ))}
                  {markets.length === 0 && (
                    <Text as="p" variant="bodySm" tone="subdued">
                      No markets configured
                    </Text>
                  )}
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        <Text as="h2" variant="headingLg">
          Resources
        </Text>

        <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="400">
          {Object.entries(RESOURCE_TYPES).map(([type, config]) => (
            <Card key={type}>
              <BlockStack gap="300">
                <InlineStack align="space-between">
                  <Text as="h3" variant="headingMd">
                    {config.label}
                  </Text>
                  {resourceCounts[type]?.hasResources && (
                    <Badge tone="success">Available</Badge>
                  )}
                </InlineStack>
                <Link
                  to={`/app/resources/${config.slug}`}
                  style={{
                    textDecoration: "none",
                    color: "var(--p-color-text-emphasis)",
                  }}
                >
                  <Text as="span" variant="bodyMd">
                    Manage translations →
                  </Text>
                </Link>
              </BlockStack>
            </Card>
          ))}
        </InlineGrid>

        <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">
                Auto-Translate
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Bulk translate using Google Translate or DeepL
              </Text>
              <Link
                to="/app/auto-translate"
                style={{
                  textDecoration: "none",
                  color: "var(--p-color-text-emphasis)",
                }}
              >
                <Text as="span" variant="bodyMd">
                  Launch auto-translate →
                </Text>
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
              <Link
                to="/app/images"
                style={{
                  textDecoration: "none",
                  color: "var(--p-color-text-emphasis)",
                }}
              >
                <Text as="span" variant="bodyMd">
                  Manage images →
                </Text>
              </Link>
            </BlockStack>
          </Card>
        </InlineGrid>
      </BlockStack>
    </Page>
  );
}
