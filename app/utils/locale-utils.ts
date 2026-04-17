import type { ShopLocale } from "../types/shopify";

const LOCALE_DISPLAY_NAMES: Record<string, string> = {
  en: "English",
  fr: "French",
  es: "Spanish",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  "pt-BR": "Portuguese (Brazil)",
  "pt-PT": "Portuguese (Portugal)",
  nl: "Dutch",
  ja: "Japanese",
  ko: "Korean",
  "zh-CN": "Chinese (Simplified)",
  "zh-TW": "Chinese (Traditional)",
  ar: "Arabic",
  hi: "Hindi",
  ru: "Russian",
  tr: "Turkish",
  pl: "Polish",
  sv: "Swedish",
  da: "Danish",
  fi: "Finnish",
  nb: "Norwegian",
  th: "Thai",
  vi: "Vietnamese",
  cs: "Czech",
  el: "Greek",
  hu: "Hungarian",
  ro: "Romanian",
  uk: "Ukrainian",
  he: "Hebrew",
  id: "Indonesian",
  ms: "Malay",
};

export function getLocaleDisplayName(locale: string): string {
  return LOCALE_DISPLAY_NAMES[locale] || locale;
}

export function formatLocaleOptions(
  shopLocales: ShopLocale[],
): Array<{ label: string; value: string }> {
  return shopLocales
    .filter((l) => !l.primary && l.published)
    .map((l) => ({
      label: `${l.name || getLocaleDisplayName(l.locale)} (${l.locale})`,
      value: l.locale,
    }));
}

export function formatAllLocaleOptions(
  shopLocales: ShopLocale[],
): Array<{ label: string; value: string }> {
  return shopLocales
    .filter((l) => !l.primary)
    .map((l) => ({
      label: `${l.name || getLocaleDisplayName(l.locale)} (${l.locale})${l.published ? "" : " [unpublished]"}`,
      value: l.locale,
    }));
}

export function getPrimaryLocale(
  shopLocales: ShopLocale[],
): ShopLocale | undefined {
  return shopLocales.find((l) => l.primary);
}
