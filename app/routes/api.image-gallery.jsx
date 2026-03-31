import { json } from "@remix-run/node";
import prisma from "../db.server";

/**
 * Public API endpoint for the storefront JS to fetch translated image gallery.
 * Called by the theme app extension JS via: /apps/langshop/api/image-gallery?shop=xxx&productId=xxx&locale=xxx
 *
 * Also works as an app proxy endpoint.
 */
export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const productId = url.searchParams.get("productId");
  const locale = url.searchParams.get("locale");
  const marketId = url.searchParams.get("marketId") || "";

  if (!shop || !productId || !locale) {
    return json({ gallery: [] }, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  // Build the full GID if only numeric ID is provided
  const resourceId = productId.startsWith("gid://")
    ? productId
    : `gid://shopify/Product/${productId}`;

  try {
    // Try market-specific first, then fall back to global
    let translations = [];

    if (marketId) {
      translations = await prisma.imageTranslation.findMany({
        where: { shop, resourceId, locale, marketId },
        orderBy: { imagePosition: "asc" },
      });
    }

    // Fallback to global if no market-specific translations
    if (translations.length === 0) {
      translations = await prisma.imageTranslation.findMany({
        where: { shop, resourceId, locale, marketId: "" },
        orderBy: { imagePosition: "asc" },
      });
    }

    const gallery = translations.map((t) => ({
      position: t.imagePosition,
      originalUrl: t.originalImageUrl,
      translatedUrl: t.translatedImageUrl,
    }));

    return json({ gallery }, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    console.error("Image gallery API error:", error);
    return json({ gallery: [] }, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
};
