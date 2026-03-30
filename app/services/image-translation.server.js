import prisma from "../db.server";

const STAGED_UPLOADS_CREATE = `#graphql
  mutation StagedUploadsCreate($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters {
          name
          value
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const FILE_CREATE = `#graphql
  mutation FileCreate($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files {
        id
        alt
        ... on MediaImage {
          image {
            url
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const METAFIELD_SET = `#graphql
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

export async function getImageTranslations(shop, resourceId) {
  return prisma.imageTranslation.findMany({
    where: { shop, resourceId },
    orderBy: { locale: "asc" },
  });
}

export async function uploadAndSetImage(
  admin,
  shop,
  { resourceId, locale, marketId, imageFile, originalImageUrl },
) {
  // Step 1: Create staged upload target
  const stagedResponse = await admin.graphql(STAGED_UPLOADS_CREATE, {
    variables: {
      input: [
        {
          resource: "IMAGE",
          filename: `translated_${locale}_${Date.now()}.png`,
          mimeType: imageFile.type || "image/png",
          httpMethod: "POST",
        },
      ],
    },
  });

  const stagedData = await stagedResponse.json();
  const target = stagedData.data.stagedUploadsCreate.stagedTargets[0];

  // Step 2: Upload file to staged target
  const formData = new FormData();
  for (const param of target.parameters) {
    formData.append(param.name, param.value);
  }
  formData.append("file", imageFile);
  await fetch(target.url, { method: "POST", body: formData });

  // Step 3: Create file in Shopify
  const fileResponse = await admin.graphql(FILE_CREATE, {
    variables: {
      files: [
        {
          originalSource: target.resourceUrl,
          contentType: "IMAGE",
        },
      ],
    },
  });

  const fileData = await fileResponse.json();
  const file = fileData.data.fileCreate.files[0];

  // Step 4: Set metafield on the resource with the file reference
  const ownerType = getOwnerType(resourceId);
  const metafieldResponse = await admin.graphql(METAFIELD_SET, {
    variables: {
      metafields: [
        {
          ownerId: resourceId,
          namespace: "langshop_images",
          key: `translated_image_${locale}`,
          type: "file_reference",
          value: file.id,
        },
      ],
    },
  });

  const metafieldData = await metafieldResponse.json();
  const metafield = metafieldData.data.metafieldsSet.metafields[0];

  // Step 5: Track in our database
  await prisma.imageTranslation.upsert({
    where: {
      shop_resourceId_locale_marketId: {
        shop,
        resourceId,
        locale,
        marketId: marketId || "",
      },
    },
    create: {
      shop,
      resourceId,
      locale,
      marketId: marketId || "",
      originalImageUrl,
      translatedImageUrl: file.image?.url || target.resourceUrl,
      metafieldId: metafield.id,
    },
    update: {
      translatedImageUrl: file.image?.url || target.resourceUrl,
      metafieldId: metafield.id,
    },
  });

  return { fileId: file.id, metafieldId: metafield.id };
}

function getOwnerType(resourceId) {
  if (resourceId.includes("Product/")) return "PRODUCT";
  if (resourceId.includes("Collection/")) return "COLLECTION";
  if (resourceId.includes("Article/")) return "ARTICLE";
  return "PRODUCT";
}

export async function deleteImageTranslation(shop, id) {
  return prisma.imageTranslation.delete({ where: { id, shop } });
}
