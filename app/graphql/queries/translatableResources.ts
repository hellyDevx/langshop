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

export const TRANSLATABLE_RESOURCES_BACKWARD_QUERY = `#graphql
  query TranslatableResourcesBackward($resourceType: TranslatableResourceType!, $last: Int!, $before: String) {
    translatableResources(resourceType: $resourceType, last: $last, before: $before) {
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
