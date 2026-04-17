import type {
  ResourceTypeConfig,
  ResourceCategory,
  CategoryStats,
} from "../types/translation";
import type { TranslatableContent } from "../types/shopify";

export const RESOURCE_CATEGORIES: ResourceCategory[] = [
  {
    id: "products",
    label: "Products",
    resourceTypes: [
      { type: "PRODUCT", label: "Products", slug: "products", hasNestedMetafields: true, gidType: "Product" },
      { type: "PRODUCT_OPTION", label: "Product options", slug: "product-options", gidType: "ProductOption" },
      { type: "PRODUCT_OPTION_VALUE", label: "Product option values", slug: "product-option-values", gidType: "ProductOptionValue" },
      { type: "COLLECTION", label: "Collections", slug: "collections", gidType: "Collection" },
    ],
  },
  {
    id: "online-store",
    label: "Online Store",
    resourceTypes: [
      { type: "ARTICLE", label: "Blog posts", slug: "articles", gidType: "OnlineStoreArticle" },
      { type: "BLOG", label: "Blogs", slug: "blogs", gidType: "OnlineStoreBlog" },
      { type: "FILTER", label: "Filters", slug: "filters", gidType: "Filter" },
      { type: "METAOBJECT", label: "Metaobjects", slug: "metaobjects", gidType: "Metaobject" },
      { type: "PAGE", label: "Pages", slug: "pages", gidType: "OnlineStorePage" },
      { type: "SHOP_POLICY", label: "Policies", slug: "shop-policies", gidType: "ShopPolicy" },
    ],
  },
  {
    id: "images",
    label: "Images",
    resourceTypes: [
      { type: "COLLECTION_IMAGE", label: "Collection images", slug: "collection-images", gidType: "CollectionImage" },
      { type: "ARTICLE_IMAGE", label: "Article images", slug: "article-images", gidType: "ArticleImage" },
      { type: "MEDIA_IMAGE", label: "Media images", slug: "media-images", gidType: "MediaImage" },
    ],
  },
  {
    id: "content",
    label: "Content",
    resourceTypes: [
      { type: "MENU", label: "Navigation", slug: "navigation", gidType: "Menu" },
    ],
  },
  {
    id: "theme",
    label: "Theme",
    resourceTypes: [
      { type: "ONLINE_STORE_THEME", label: "Dynamic text", slug: "dynamic-text", gidType: "OnlineStoreTheme" },
      { type: "ONLINE_STORE_THEME_APP_EMBED", label: "Storefront elements", slug: "storefront-elements", gidType: "OnlineStoreThemeAppEmbed" },
      { type: "ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS", label: "Store components", slug: "store-components", gidType: "OnlineStoreThemeSettingsDataSection" },
      { type: "ONLINE_STORE_THEME_SETTINGS_CATEGORY", label: "Theme settings", slug: "theme-settings", gidType: "OnlineStoreThemeSettingsCategory" },
      { type: "ONLINE_STORE_THEME_LOCALE_CONTENT", label: "Theme Locale Content", slug: "theme-locale-content", gidType: "OnlineStoreThemeLocaleContent" },
      { type: "ONLINE_STORE_THEME_JSON_TEMPLATE", label: "Theme JSON Templates", slug: "theme-json-templates", gidType: "OnlineStoreThemeJsonTemplate" },
      { type: "ONLINE_STORE_THEME_SECTION_GROUP", label: "Theme section groups", slug: "theme-section-groups", gidType: "OnlineStoreThemeSectionGroup" },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    resourceTypes: [
      { type: "EMAIL_TEMPLATE", label: "Notification templates", slug: "email-templates", gidType: "EmailTemplate" },
      { type: "PACKING_SLIP_TEMPLATE", label: "Packing slip", slug: "packing-slip", gidType: "PackingSlipTemplate" },
      { type: "PAYMENT_GATEWAY", label: "Payment gateways", slug: "payment-gateways", gidType: "PaymentGateway" },
      { type: "DELIVERY_METHOD_DEFINITION", label: "Delivery methods", slug: "delivery-methods", gidType: "DeliveryMethodDefinition" },
    ],
  },
];

// Build flat lookups from categories
const _allTypes: Record<string, ResourceTypeConfig> = {};
const _slugToType: Record<string, string> = {};
const _typeToSlug: Record<string, string> = {};

RESOURCE_CATEGORIES.forEach((cat) => {
  cat.resourceTypes.forEach((rt) => {
    _allTypes[rt.type] = rt;
    _slugToType[rt.slug] = rt.type;
    _typeToSlug[rt.type] = rt.slug;
  });
});

// Backward-compatible flat object
export const RESOURCE_TYPES: Record<string, ResourceTypeConfig> = _allTypes;

export function getResourceTypeFromSlug(slug: string): string | null {
  return _slugToType[slug] || null;
}

export function getSlugFromResourceType(resourceType: string): string | null {
  return _typeToSlug[resourceType] || null;
}

export function getResourceConfig(
  resourceType: string,
): ResourceTypeConfig | null {
  return _allTypes[resourceType] || null;
}

export function getGidTypeFromSlug(slug: string): string | null {
  const resourceType = _slugToType[slug];
  if (!resourceType) return null;
  return _allTypes[resourceType]?.gidType ?? null;
}

export function getResourceDisplayName(
  translatableContent: TranslatableContent[],
): string {
  const titleField = translatableContent.find(
    (c) => c.key === "title" || c.key === "name" || c.key === "alt" || c.key === "filename",
  );
  if (titleField?.value) return titleField.value;

  const firstField = translatableContent.find((c) => c.value);
  if (firstField?.value) {
    return firstField.value.length > 60
      ? firstField.value.substring(0, 60) + "..."
      : firstField.value;
  }

  return "Untitled";
}

export function getStatusBadge(
  stats: CategoryStats | null,
): { label: string; tone?: string } {
  if (!stats || !stats.hasResources) return { label: "No items", tone: undefined };
  if (stats.translatedCount === 0) return { label: "Not translated", tone: "warning" };
  if (stats.translatedCount >= stats.totalSampled) return { label: "Translated", tone: "success" };
  return { label: "Partially", tone: "attention" };
}
