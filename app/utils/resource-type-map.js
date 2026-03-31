export const RESOURCE_CATEGORIES = [
  {
    id: "products",
    label: "Products",
    resourceTypes: [
      { type: "PRODUCT", label: "Products", slug: "products", hasNestedMetafields: true },
      { type: "COLLECTION", label: "Collections", slug: "collections" },
    ],
  },
  {
    id: "online-store",
    label: "Online Store",
    resourceTypes: [
      { type: "ARTICLE", label: "Blog posts", slug: "articles" },
      { type: "BLOG", label: "Blogs", slug: "blogs" },
      { type: "FILTER", label: "Filters", slug: "filters" },
      { type: "METAOBJECT", label: "Metaobjects", slug: "metaobjects" },
      { type: "PAGE", label: "Pages", slug: "pages" },
      { type: "SHOP_POLICY", label: "Policies", slug: "shop-policies" },
    ],
  },
  {
    id: "content",
    label: "Content",
    resourceTypes: [
      { type: "MENU", label: "Navigation", slug: "navigation" },
    ],
  },
  {
    id: "theme",
    label: "Theme",
    resourceTypes: [
      { type: "ONLINE_STORE_THEME", label: "Dynamic text", slug: "dynamic-text" },
      { type: "ONLINE_STORE_THEME_APP_EMBED", label: "Storefront elements", slug: "storefront-elements" },
      { type: "ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS", label: "Store components", slug: "store-components" },
      { type: "ONLINE_STORE_THEME_LOCALE_CONTENT", label: "Theme Locale Content", slug: "theme-locale-content" },
      { type: "ONLINE_STORE_THEME_JSON_TEMPLATE", label: "Theme JSON Templates", slug: "theme-json-templates" },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    resourceTypes: [
      { type: "EMAIL_TEMPLATE", label: "Notification templates", slug: "email-templates" },
      { type: "PACKING_SLIP_TEMPLATE", label: "Packing slip", slug: "packing-slip" },
      { type: "PAYMENT_GATEWAY", label: "Payment gateways", slug: "payment-gateways" },
      { type: "DELIVERY_METHOD_DEFINITION", label: "Delivery methods", slug: "delivery-methods" },
    ],
  },
];

// Build flat lookups from categories
const _allTypes = {};
const _slugToType = {};
const _typeToSlug = {};

RESOURCE_CATEGORIES.forEach((cat) => {
  cat.resourceTypes.forEach((rt) => {
    _allTypes[rt.type] = rt;
    _slugToType[rt.slug] = rt.type;
    _typeToSlug[rt.type] = rt.slug;
  });
});

// Backward-compatible flat object
export const RESOURCE_TYPES = _allTypes;

export function getResourceTypeFromSlug(slug) {
  return _slugToType[slug] || null;
}

export function getSlugFromResourceType(resourceType) {
  return _typeToSlug[resourceType] || null;
}

export function getResourceConfig(resourceType) {
  return _allTypes[resourceType] || null;
}

export function getResourceDisplayName(translatableContent) {
  const titleField = translatableContent.find(
    (c) => c.key === "title" || c.key === "name",
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

export function getStatusBadge(stats) {
  if (!stats || !stats.hasResources) return { label: "No items", tone: undefined };
  if (stats.translatedCount === 0) return { label: "Not translated", tone: "warning" };
  if (stats.translatedCount >= stats.totalSampled) return { label: "Translated", tone: "success" };
  return { label: "Partially", tone: "attention" };
}
