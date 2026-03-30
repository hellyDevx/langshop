export const RESOURCE_TYPES = {
  PRODUCT: { label: "Products", slug: "products" },
  COLLECTION: { label: "Collections", slug: "collections" },
  PAGE: { label: "Pages", slug: "pages" },
  ARTICLE: { label: "Articles", slug: "articles" },
  BLOG: { label: "Blogs", slug: "blogs" },
  METAFIELD: { label: "Metafields", slug: "metafields" },
  SHOP_POLICY: { label: "Shop Policies", slug: "shop-policies" },
  PRODUCT_OPTION: { label: "Product Options", slug: "product-options" },
  PRODUCT_OPTION_VALUE: { label: "Product Option Values", slug: "product-option-values" },
  ONLINE_STORE_THEME: { label: "Theme Content", slug: "theme-content" },
};

export function getResourceTypeFromSlug(slug) {
  const entry = Object.entries(RESOURCE_TYPES).find(
    ([, config]) => config.slug === slug,
  );
  return entry ? entry[0] : null;
}

export function getSlugFromResourceType(resourceType) {
  return RESOURCE_TYPES[resourceType]?.slug || null;
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
