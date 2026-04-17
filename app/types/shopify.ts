import type { authenticate } from "../shopify.server";

// Admin API context from authenticate.admin(request)
export type AdminApiContext = Awaited<ReturnType<typeof authenticate.admin>>;
export type AdminClient = AdminApiContext["admin"];

// Shop Locales
export interface ShopLocale {
  locale: string;
  name: string;
  primary: boolean;
  published: boolean;
}

// Markets
export interface Market {
  id: string;
  name: string;
  handle: string;
  enabled: boolean;
  primary: boolean;
  webPresence: MarketWebPresence | null;
  regions: { nodes: MarketRegion[] };
}

export interface MarketWebPresence {
  id: string;
  rootUrls: Array<{ locale: string; url: string }>;
}

export interface MarketRegion {
  id: string;
  name: string;
  code?: string;
}

// Translatable Resources
export interface TranslatableResource {
  resourceId: string;
  translatableContent: TranslatableContent[];
}

export interface TranslatableContent {
  key: string;
  value: string;
  digest: string;
  locale: string;
}

export interface Translation {
  key: string;
  value: string;
  locale: string;
  outdated?: boolean;
}

export interface TranslatableResourceWithTranslations
  extends TranslatableResource {
  translations: Translation[];
}

export interface TranslatableResourceWithNested
  extends TranslatableResourceWithTranslations {
  nestedTranslatableResources?: {
    nodes: TranslatableResourceWithTranslations[];
  };
}

// Pagination (standard Shopify connection pattern)
export interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor?: string;
  endCursor?: string;
}

// Mutation errors (standard Shopify pattern)
export interface UserError {
  field?: string[];
  message: string;
}
