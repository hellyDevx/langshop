import { Select, InlineStack, Badge } from "@shopify/polaris";
import type { Market } from "../types/shopify";

interface MarketSelectorProps {
  markets: Market[];
  selectedMarketId: string | null;
  onChange: (marketId: string) => void;
  locale?: string | null;
}

export function MarketSelector({
  markets,
  selectedMarketId,
  onChange,
  locale,
}: MarketSelectorProps) {
  // When locale is set, filter to markets that include that locale
  const filteredMarkets = locale
    ? markets.filter(
        (m) =>
          m.enabled &&
          m.webPresence?.rootUrls.some((r) => r.locale === locale),
      )
    : markets.filter((m) => m.enabled);

  const options = [
    { label: "Global (all markets)", value: "" },
    ...filteredMarkets.map((m) => ({
      label: `${m.name}${m.primary ? " (Primary)" : ""}`,
      value: m.id,
    })),
  ];

  return (
    <Select
      label="Market scope"
      options={options}
      value={selectedMarketId || ""}
      onChange={onChange}
      helpText={
        locale && filteredMarkets.length === 0
          ? "No markets use this locale"
          : undefined
      }
    />
  );
}
