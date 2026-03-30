export const TRANSLATIONS_REGISTER_MUTATION = `#graphql
  mutation TranslationsRegister($resourceId: ID!, $translations: [TranslationInput!]!) {
    translationsRegister(resourceId: $resourceId, translations: $translations) {
      translations {
        key
        value
        locale
        outdated
      }
      userErrors {
        field
        message
      }
    }
  }
`;
