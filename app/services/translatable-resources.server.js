import { TRANSLATABLE_RESOURCES_QUERY } from "../graphql/queries/translatableResources";
import {
  RESOURCE_TRANSLATIONS_QUERY,
  RESOURCE_TRANSLATIONS_WITH_MARKET_QUERY,
} from "../graphql/queries/translatableResource";

export async function fetchTranslatableResources(
  admin,
  { resourceType, first = 25, after = null },
) {
  const response = await admin.graphql(TRANSLATABLE_RESOURCES_QUERY, {
    variables: { resourceType, first, after },
  });
  const { data } = await response.json();
  return {
    nodes: data.translatableResources.nodes,
    pageInfo: data.translatableResources.pageInfo,
  };
}

export async function fetchTranslatableResource(
  admin,
  { resourceId, locale, marketId = null },
) {
  const query = marketId
    ? RESOURCE_TRANSLATIONS_WITH_MARKET_QUERY
    : RESOURCE_TRANSLATIONS_QUERY;

  const variables = { resourceId, locale };
  if (marketId) variables.marketId = marketId;

  const response = await admin.graphql(query, { variables });
  const { data } = await response.json();
  return data.translatableResource;
}
