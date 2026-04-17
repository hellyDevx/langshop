import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import {
  Page,
  Card,
  BlockStack,
  Text,
  Badge,
  InlineStack,
  InlineGrid,
  DataTable,
  Banner,
  Button,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { fetchMarkets, fetchShopLocales, getMarketLocales } from "../services/markets.server";
import { fetchAllCategoryStats } from "../services/translatable-resources.server";
import { getLocaleDisplayName } from "../utils/locale-utils";
import { RESOURCE_CATEGORIES } from "../utils/resource-type-map";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const marketIdParam = params.marketId!;
  const marketGid = `gid://shopify/Market/${marketIdParam}`;

  const [markets, locales] = await Promise.all([
    fetchMarkets(admin),
    fetchShopLocales(admin),
  ]);

  const market = markets.find((m) => m.id === marketGid);
  if (!market) {
    throw new Response("Market not found", { status: 404 });
  }

  const marketLocales = getMarketLocales(market);
  const primaryLocale = locales.find((l) => l.primary);

  // Fetch stats per locale for this market
  const statsByLocale: Record<
    string,
    Record<string, { totalSampled: number; translatedCount: number; hasResources: boolean }>
  > = {};

  // Fetch for each non-primary locale in this market
  const targetLocales = marketLocales.filter(
    (l) => l !== primaryLocale?.locale,
  );

  for (const locale of targetLocales) {
    statsByLocale[locale] = await fetchAllCategoryStats(
      admin,
      session.shop,
      locale,
    );
  }

  return {
    market,
    marketLocales: targetLocales,
    statsByLocale,
    primaryLocale: primaryLocale?.locale || "en",
  };
};

export default function MarketDetail() {
  const { market, marketLocales, statsByLocale, primaryLocale } =
    useLoaderData<typeof loader>();

  // Compute per-locale overall coverage
  const localeCoverage = marketLocales.map((locale) => {
    const stats = statsByLocale[locale] || {};
    let totalResources = 0;
    let translatedResources = 0;
    Object.values(stats).forEach((s) => {
      if (s.hasResources) {
        totalResources += s.totalSampled;
        translatedResources += s.translatedCount;
      }
    });
    const percentage =
      totalResources > 0
        ? Math.round((translatedResources / totalResources) * 100)
        : 0;
    return { locale, totalResources, translatedResources, percentage };
  });

  return (
    <Page
      backAction={{ content: "Markets", url: "/app/markets" }}
      title={market.name}
    >
      <TitleBar title={`Market: ${market.name}`} />
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="300">
            <InlineStack gap="200">
              <Text as="h2" variant="headingMd">
                Market Info
              </Text>
              {market.primary && <Badge tone="success">Primary</Badge>}
              {!market.enabled && <Badge tone="warning">Disabled</Badge>}
            </InlineStack>

            {market.regions?.nodes?.length > 0 && (
              <InlineStack gap="100" wrap>
                {market.regions.nodes.map((region) => (
                  <Badge key={region.id}>{region.name}</Badge>
                ))}
              </InlineStack>
            )}
          </BlockStack>
        </Card>

        {marketLocales.length === 0 ? (
          <Banner tone="info">
            This market has no secondary languages configured.
          </Banner>
        ) : (
          <>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Translation Coverage by Language
                </Text>
                <DataTable
                  columnContentTypes={["text", "numeric", "numeric", "text", "text"]}
                  headings={[
                    "Language",
                    "Resources",
                    "Translated",
                    "Coverage",
                    "Action",
                  ]}
                  rows={localeCoverage.map((lc) => {
                    const tone =
                      lc.percentage >= 90
                        ? "success"
                        : lc.percentage >= 50
                          ? "attention"
                          : lc.percentage > 0
                            ? "warning"
                            : undefined;
                    return [
                      getLocaleDisplayName(lc.locale),
                      String(lc.totalResources),
                      String(lc.translatedResources),
                      tone ? (
                        <Badge tone={tone as "success" | "attention" | "warning"}>
                          {`${lc.percentage}%`}
                        </Badge>
                      ) : (
                        <Badge>{`${lc.percentage}%`}</Badge>
                      ),
                      <Link
                        to={`/app/auto-translate?locale=${lc.locale}&marketId=${encodeURIComponent(market.id)}`}
                        style={{ textDecoration: "none" }}
                      >
                        <Button size="slim">Auto-translate</Button>
                      </Link>,
                    ];
                  })}
                />
              </BlockStack>
            </Card>

            {/* Per-category breakdown for each locale */}
            {marketLocales.map((locale) => {
              const stats = statsByLocale[locale] || {};
              return (
                <Card key={locale}>
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd">
                      {getLocaleDisplayName(locale)} — Resource Breakdown
                    </Text>
                    <DataTable
                      columnContentTypes={["text", "numeric", "numeric", "text"]}
                      headings={["Category", "Resources", "Translated", "Status"]}
                      rows={RESOURCE_CATEGORIES.flatMap((cat) =>
                        cat.resourceTypes.map((rt) => {
                          const s = stats[rt.type] || {
                            totalSampled: 0,
                            translatedCount: 0,
                            hasResources: false,
                          };
                          const pct =
                            s.totalSampled > 0
                              ? Math.round(
                                  (s.translatedCount / s.totalSampled) * 100,
                                )
                              : 0;
                          return [
                            rt.label,
                            String(s.totalSampled),
                            String(s.translatedCount),
                            s.hasResources ? `${pct}%` : "No items",
                          ];
                        }),
                      )}
                    />
                  </BlockStack>
                </Card>
              );
            })}
          </>
        )}
      </BlockStack>
    </Page>
  );
}
