export const TRANSLATABLE_RESOURCES_WITH_TRANSLATIONS_QUERY = `#graphql
  query TranslatableResourcesWithTranslations(
    $resourceType: TranslatableResourceType!
    $first: Int!
    $locale: String!
    $after: String
  ) {
    translatableResources(resourceType: $resourceType, first: $first, after: $after) {
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
          outdated
        }
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
`;
