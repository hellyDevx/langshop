export const NESTED_TRANSLATABLE_RESOURCES_QUERY = `#graphql
  query NestedTranslatableResources($resourceId: ID!, $locale: String!) {
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
      nestedTranslatableResources(first: 50) {
        nodes {
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
    }
  }
`;
