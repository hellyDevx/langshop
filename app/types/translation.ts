// Job status union
export type JobStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "partially_failed";

// Translation input for Shopify translationsRegister mutation
export interface TranslationInput {
  key: string;
  value: string;
  locale: string;
  translatableContentDigest: string;
  marketId?: string;
}

// Provider identifiers
export type ProviderType = "google" | "deepl" | "claude" | "openai";

// Alert types
export type AlertType = "failure" | "stale" | "quota_warning" | "job_error";
export type AlertSeverity = "info" | "warning" | "critical";

// Suggestion status
export type SuggestionStatus = "pending" | "accepted" | "rejected";

// Audit log source
export type AuditSource =
  | "manual"
  | "auto_google"
  | "auto_deepl"
  | "auto_ai"
  | "import";

// Category stats (used in dashboard)
export interface CategoryStats {
  totalSampled: number;
  translatedCount: number;
  hasResources: boolean;
}

// Resource type config (from resource-type-map)
export interface ResourceTypeConfig {
  type: string;
  label: string;
  slug: string;
  hasNestedMetafields?: boolean;
  gidType?: string;
}

// Resource category (groups of resource types)
export interface ResourceCategory {
  id: string;
  label: string;
  resourceTypes: ResourceTypeConfig[];
}

// Image translation record shape (matching Prisma model)
export interface ImageTranslationRecord {
  id: string;
  shop: string;
  resourceId: string;
  imageId: string;
  imagePosition: number;
  locale: string;
  marketId: string;
  originalImageUrl: string;
  translatedImageUrl: string;
  metafieldId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
