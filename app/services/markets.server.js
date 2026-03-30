import { SHOP_LOCALES_QUERY } from "../graphql/queries/shopLocales";
import { MARKETS_QUERY } from "../graphql/queries/markets";

export async function fetchShopLocales(admin) {
  const response = await admin.graphql(SHOP_LOCALES_QUERY);
  const { data } = await response.json();
  return data.shopLocales;
}

export async function fetchMarkets(admin) {
  const response = await admin.graphql(MARKETS_QUERY);
  const { data } = await response.json();
  return data.markets.nodes;
}

export async function getMarketLocaleMapping(admin) {
  const markets = await fetchMarkets(admin);
  const mapping = {};

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
