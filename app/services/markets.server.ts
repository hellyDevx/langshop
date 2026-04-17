import { SHOP_LOCALES_QUERY } from "../graphql/queries/shopLocales";
import { MARKETS_QUERY } from "../graphql/queries/markets";
import type { AdminClient, ShopLocale, Market, MarketRegion } from "../types/shopify";

export async function fetchShopLocales(admin: AdminClient): Promise<ShopLocale[]> {
  const response = await admin.graphql(SHOP_LOCALES_QUERY);
  const { data } = await response.json();
  return data.shopLocales;
}

export async function fetchMarkets(admin: AdminClient): Promise<Market[]> {
  const response = await admin.graphql(MARKETS_QUERY);
  const { data } = await response.json();
  return data.markets.nodes;
}

interface MarketLocaleMappingEntry {
  name: string;
  handle: string;
  primary: boolean;
  enabled: boolean;
  locales: string[];
  regions: MarketRegion[];
}

export async function getMarketLocaleMapping(
  admin: AdminClient,
): Promise<Record<string, MarketLocaleMappingEntry>> {
  const markets = await fetchMarkets(admin);
  const mapping: Record<string, MarketLocaleMappingEntry> = {};

  for (const market of markets) {
    if (market.webPresence) {
      mapping[market.id] = {
        name: market.name,
        handle: market.handle,
        primary: market.primary,
        enabled: market.enabled,
        locales: market.webPresence.rootUrls.map((r) => r.locale),
        regions: market.regions.nodes,
      };
    }
  }

  return mapping;
}
