export const TRANSLATABLE_RESOURCE_QUERY = `#graphql
  query TranslatableResource($resourceId: ID!) {
    translatableResource(resourceId: $resourceId) {
      resourceId
      translatableContent {
        key
        value
        digest
        locale
      }
    }
  }
`;

export const RESOURCE_TRANSLATIONS_QUERY = `#graphql
  query ResourceTranslations($resourceId: ID!, $locale: String!) {
    translatableResource(resourceId: $resourceId) {
      resourceId
      translatableContent {
        key
        value
        digest
        locale
      }
      translations(locale: $locale) {
        key
        value
        locale
        outdated
      }
    }
  }
`;

export const RESOURCE_TRANSLATIONS_WITH_MARKET_QUERY = `#graphql
  query ResourceTranslationsWithMarket($resourceId: ID!, $locale: String!, $marketId: ID!) {
    translatableResource(resourceId: $resourceId) {
      resourceId
      translatableContent {
        key
        value
        digest
        locale
      }
      translations(locale: $locale, marketId: $marketId) {
        key
        value
        locale
        outdated
      }
    }
  }
`;
