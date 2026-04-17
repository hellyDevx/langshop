import prisma from "../db.server";
import type { AdminClient } from "../types/shopify";
import type { ImageTranslation } from "@prisma/client";

const METAFIELDS_SET = `#graphql
  mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
        namespace
        key
        value
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const METAFIELD_DEFINITION_CREATE = `#graphql
  mutation MetafieldDefinitionCreate($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export async function getImageTranslations(
  shop: string,
  resourceId: string,
  marketId = "",
): Promise<ImageTranslation[]> {
  return prisma.imageTranslation.findMany({
    where: { shop, resourceId, marketId },
    orderBy: [{ imagePosition: "asc" }, { locale: "asc" }],
  });
}

export async function saveImageTranslation(
  shop: string,
  {
    resourceId,
    imageId,
    imagePosition,
    locale,
    marketId,
    fileUrl,
    originalImageUrl,
  }: {
    resourceId: string;
    imageId: string;
    imagePosition: number;
    locale: string;
    marketId?: string;
    fileUrl: string;
    originalImageUrl: string;
  },
) {
  return prisma.imageTranslation.upsert({
    where: {
      shop_resourceId_imageId_locale_marketId: {
        shop,
        resourceId,
        imageId,
        locale,
        marketId: marketId || "",
      },
    },
    create: {
      shop,
      resourceId,
      imageId,
      imagePosition,
      locale,
      marketId: marketId || "",
      originalImageUrl,
      translatedImageUrl: fileUrl,
    },
    update: {
      translatedImageUrl: fileUrl,
      imagePosition,
    },
  });
}

export async function removeImageTranslation(
  shop: string,
  {
    resourceId,
    imageId,
    locale,
    marketId,
  }: {
    resourceId: string;
    imageId: string;
    locale: string;
    marketId?: string;
  },
) {
  return prisma.imageTranslation.deleteMany({
    where: {
      shop,
      resourceId,
      imageId,
      locale,
      marketId: marketId || "",
    },
  });
}

export async function syncGalleryMetafield(
  admin: AdminClient,
  shop: string,
  resourceId: string,
  locale: string,
  marketId = "",
) {
  const translations = await prisma.imageTranslation.findMany({
    where: { shop, resourceId, locale, marketId },
    orderBy: { imagePosition: "asc" },
  });

  const gallery = translations.map((t) => ({
    position: t.imagePosition,
    imageId: t.imageId,
    originalUrl: t.originalImageUrl,
    translatedUrl: t.translatedImageUrl,
  }));

  const marketSuffix = marketId ? `_${marketId.split("/").pop()}` : "";
  const key = `translated_gallery_${locale}${marketSuffix}`;

  // Ensure metafield definition exists for storefront access
  await ensureMetafieldDefinition(admin, key);

  const response = await admin.graphql(METAFIELDS_SET, {
    variables: {
      metafields: [
        {
          ownerId: resourceId,
          namespace: "langshop_images",
          key,
          type: "json",
          value: JSON.stringify(gallery),
        },
      ],
    },
  });

  const data = await response.json();
  if (data.data.metafieldsSet.userErrors.length > 0) {
    throw new Error(
      data.data.metafieldsSet.userErrors
        .map((e: { message: string }) => e.message)
        .join(", "),
    );
  }

  const metafield = data.data.metafieldsSet.metafields[0];

  // Update metafieldId on all translation records
  await prisma.imageTranslation.updateMany({
    where: { shop, resourceId, locale, marketId },
    data: { metafieldId: metafield.id },
  });

  return metafield;
}

// Cache to avoid re-creating definitions within a session
const definitionCache = new Set<string>();

async function ensureMetafieldDefinition(admin: AdminClient, key: string) {
  if (definitionCache.has(key)) return;

  try {
    const response = await admin.graphql(METAFIELD_DEFINITION_CREATE, {
      variables: {
        definition: {
          name: `LangShop Gallery: ${key}`,
          namespace: "langshop_images",
          key,
          type: "json",
          ownerType: "PRODUCT",
          access: {
            storefront: "PUBLIC_READ",
          },
        },
      },
    });

    const data = await response.json();
    // Ignore "already exists" errors
    const errors = data.data.metafieldDefinitionCreate.userErrors.filter(
      (e: { message: string }) =>
        !e.message.includes("already exists") && !e.message.includes("taken"),
    );
    if (errors.length > 0) {
      console.error("Metafield definition error:", errors);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed to create metafield definition:", message);
  }

  definitionCache.add(key);
}

export async function deleteImageTranslation(shop: string, id: string) {
  return prisma.imageTranslation.delete({ where: { id, shop } });
}
