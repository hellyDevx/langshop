export const MARKETS_QUERY = `#graphql
  query Markets {
    markets(first: 50) {
      nodes {
        id
        name
        handle
        enabled
        primary
        webPresence {
          id
          rootUrls {
            locale
            url
          }
        }
        regions(first: 50) {
          nodes {
            id
            name
            ... on MarketRegionCountry {
              code
            }
          }
        }
      }
    }
  }
`;
