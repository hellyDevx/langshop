export const TRANSLATIONS_REMOVE_MUTATION = `#graphql
  mutation TranslationsRemove($resourceId: ID!, $translationKeys: [String!]!, $locales: [String!]!) {
    translationsRemove(resourceId: $resourceId, translationKeys: $translationKeys, locales: $locales) {
      translations {
        key
        value
        locale
      }
      userErrors {
        field
        message
      }
    }
  }
`;
