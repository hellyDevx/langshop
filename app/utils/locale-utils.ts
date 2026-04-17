import type { ShopLocale } from "../types/shopify";

// Curated overrides — preserved so existing UI labels don't churn when
// Intl.DisplayNames returns a slightly different name (e.g. "Chinese, Simplified"
// vs "Chinese (Simplified)") across Node/ICU versions.
const LOCALE_OVERRIDES: Record<string, string> = {
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

let intlDisplayNames: Intl.DisplayNames | null = null;
function getIntlDisplayNames(): Intl.DisplayNames | null {
  if (intlDisplayNames) return intlDisplayNames;
  try {
    intlDisplayNames = new Intl.DisplayNames(["en"], {
      type: "language",
      fallback: "code",
    });
    return intlDisplayNames;
  } catch {
    return null;
  }
}

export function getLocaleDisplayName(locale: string): string {
  if (!locale) return locale;
  const override = LOCALE_OVERRIDES[locale];
  if (override) return override;
  const dn = getIntlDisplayNames();
  if (!dn) return locale;
  try {
    const name = dn.of(locale);
    return name && name !== locale ? name : locale;
  } catch {
    return locale;
  }
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
