import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Card,
  BlockStack,
  Text,
  Badge,
  InlineStack,
  InlineGrid,
  Button,
  EmptyState,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { fetchMarkets, fetchShopLocales } from "../services/markets.server";
import { getLocaleDisplayName } from "../utils/locale-utils";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const [markets, locales] = await Promise.all([
    fetchMarkets(admin),
    fetchShopLocales(admin),
  ]);

  return { markets, locales };
};

export default function MarketsOverview() {
  const { markets, locales } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <Page
      backAction={{ content: "Dashboard", url: "/app" }}
      title="Markets"
      subtitle="Manage market-scoped translations across your storefronts."
    >
      <TitleBar title="Markets" />
      <BlockStack gap="500">
        <Text as="p" variant="bodyMd" tone="subdued">
          Manage translations per market. Market-specific translations override
          global translations for customers in that market.
        </Text>

        {markets.length === 0 && (
          <Card>
            <EmptyState
              heading="No markets configured"
              image=""
              action={{
                content: "Open Shopify admin",
                url: "https://admin.shopify.com/",
                external: true,
              }}
            >
              <p>
                Configure Shopify Markets in your admin first. Each market can
                have its own locales and translations.
              </p>
            </EmptyState>
          </Card>
        )}

        <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
          {markets.map((market) => {
            const marketLocales = market.webPresence?.rootUrls || [];

            return (
              <Card key={market.id}>
                <BlockStack gap="300">
                  <InlineStack gap="200" align="start">
                    <Text as="h2" variant="headingMd">
                      {market.name}
                    </Text>
                    {market.primary && <Badge tone="success">Primary</Badge>}
                    {!market.enabled && <Badge tone="warning">Disabled</Badge>}
                  </InlineStack>

                  {market.regions?.nodes?.length > 0 && (
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" tone="subdued">
                        Regions
                      </Text>
                      <InlineStack gap="100" wrap>
                        {market.regions.nodes.map((region) => (
                          <Badge key={region.id}>{region.name}</Badge>
                        ))}
                      </InlineStack>
                    </BlockStack>
                  )}

                  {marketLocales.length > 0 && (
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" tone="subdued">
                        Languages
                      </Text>
                      <InlineStack gap="100" wrap>
                        {marketLocales.map((rootUrl) => (
                          <Badge key={rootUrl.locale} tone="info">
                            {getLocaleDisplayName(rootUrl.locale)}
                          </Badge>
                        ))}
                      </InlineStack>
                    </BlockStack>
                  )}

                  <Button
                    size="slim"
                    onClick={() =>
                      navigate(`/app/markets/${market.id.split("/").pop()}`)
                    }
                  >
                    View details
                  </Button>
                </BlockStack>
              </Card>
            );
          })}
        </InlineGrid>

        {markets.length === 0 && (
          <Card>
            <Text as="p" variant="bodyMd" tone="subdued">
              No markets configured. Set up markets in your Shopify Admin under
              Settings → Markets.
            </Text>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
