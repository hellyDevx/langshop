export const TRANSLATABLE_RESOURCES_QUERY = `#graphql
  query TranslatableResources($resourceType: TranslatableResourceType!, $first: Int!, $after: String) {
    translatableResources(resourceType: $resourceType, first: $first, after: $after) {
      nodes {
        resourceId
        translatableContent {
          key
          value
          digest
          locale
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
