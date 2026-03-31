import { useState } from "react";
import { useLoaderData, useActionData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Card,
  BlockStack,
  Text,
  InlineGrid,
  Banner,
  Badge,
  Thumbnail,
  InlineStack,
  Button,
  Modal,
  TextField,
  DropZone,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { fetchShopLocales } from "../services/markets.server";
import { getImageTranslations } from "../services/image-translation.server";
import { getLocaleDisplayName } from "../utils/locale-utils";
import prisma from "../db.server";

const PRODUCT_QUERY = `#graphql
  query Product($id: ID!) {
    product(id: $id) {
      id
      title
      featuredImage {
        url
        altText
      }
    }
  }
`;

const FILES_QUERY = `#graphql
  query Files($first: Int!, $after: String, $query: String) {
    files(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
      nodes {
        id
        alt
        ... on MediaImage {
          image {
            url
            width
            height
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

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

export const loader = async ({ request, params }) => {
  const { admin, session } = await authenticate.admin(request);
  const resourceId = `gid://shopify/Product/${params.resourceId}`;

  const [locales, imageTranslations] = await Promise.all([
    fetchShopLocales(admin),
    getImageTranslations(session.shop, resourceId),
  ]);

  let product = null;
  try {
    const productResponse = await admin.graphql(PRODUCT_QUERY, {
      variables: { id: resourceId },
    });
    const productData = await productResponse.json();
    product = productData.data?.product || null;
  } catch (error) {
    console.error("Failed to fetch product:", error.message);
  }

  // Fetch image files from Content > Files
  let files = [];
  try {
    const filesResponse = await admin.graphql(FILES_QUERY, {
      variables: { first: 50, query: "media_type:IMAGE" },
    });
    const filesData = await filesResponse.json();
    files = (filesData.data?.files?.nodes || []).filter((f) => f.image?.url);
  } catch (error) {
    console.error("Failed to fetch files:", error.message);
  }

  return {
    product,
    locales: locales.filter((l) => !l.primary),
    imageTranslations,
    resourceId,
    files,
  };
};

async function setMetafieldAndTrack(admin, session, resourceId, locale, fileId, fileUrl, originalImageUrl) {
  const metafieldResponse = await admin.graphql(METAFIELDS_SET, {
    variables: {
      metafields: [
        {
          ownerId: resourceId,
          namespace: "langshop_images",
          key: `translated_image_${locale}`,
          type: "file_reference",
          value: fileId,
        },
      ],
    },
  });

  const metafieldData = await metafieldResponse.json();
  if (metafieldData.data.metafieldsSet.userErrors.length > 0) {
    throw new Error(
      metafieldData.data.metafieldsSet.userErrors.map((e) => e.message).join(", "),
    );
  }

  const metafield = metafieldData.data.metafieldsSet.metafields[0];

  await prisma.imageTranslation.upsert({
    where: {
      shop_resourceId_locale_marketId: {
        shop: session.shop,
        resourceId,
        locale,
        marketId: "",
      },
    },
    create: {
      shop: session.shop,
      resourceId,
      locale,
      marketId: "",
      originalImageUrl: originalImageUrl || "",
      translatedImageUrl: fileUrl,
      metafieldId: metafield.id,
    },
    update: {
      translatedImageUrl: fileUrl,
      metafieldId: metafield.id,
    },
  });

  return metafield;
}

export const action = async ({ request, params }) => {
  const { admin, session } = await authenticate.admin(request);
  const resourceId = `gid://shopify/Product/${params.resourceId}`;
  const formData = await request.formData();
  const intent = formData.get("intent");

  // Select an existing file from Content > Files
  if (intent === "select-file") {
    const locale = formData.get("locale");
    const fileId = formData.get("fileId");
    const fileUrl = formData.get("fileUrl");
    const originalImageUrl = formData.get("originalImageUrl");

    if (!locale || !fileId || !fileUrl) {
      return json({ error: "Missing required fields" }, { status: 400 });
    }

    try {
      await setMetafieldAndTrack(admin, session, resourceId, locale, fileId, fileUrl, originalImageUrl);
      return json({ success: true, locale });
    } catch (error) {
      return json({ error: error.message }, { status: 500 });
    }
  }

  // Upload a new image file
  if (intent === "upload") {
    const locale = formData.get("locale");
    const imageFile = formData.get("image");
    const originalImageUrl = formData.get("originalImageUrl");

    if (!locale || !imageFile) {
      return json({ error: "Missing required fields" }, { status: 400 });
    }

    try {
      // Step 1: Create staged upload
      const stagedResponse = await admin.graphql(STAGED_UPLOADS_CREATE, {
        variables: {
          input: [
            {
              resource: "IMAGE",
              filename: `langshop_${locale}_${Date.now()}.${imageFile.name?.split(".").pop() || "png"}`,
              mimeType: imageFile.type || "image/png",
              httpMethod: "POST",
            },
          ],
        },
      });

      const stagedData = await stagedResponse.json();
      if (stagedData.data.stagedUploadsCreate.userErrors.length > 0) {
        return json(
          { error: stagedData.data.stagedUploadsCreate.userErrors.map((e) => e.message).join(", ") },
          { status: 400 },
        );
      }

      const target = stagedData.data.stagedUploadsCreate.stagedTargets[0];

      // Step 2: Upload to staged target
      const uploadForm = new FormData();
      for (const param of target.parameters) {
        uploadForm.append(param.name, param.value);
      }
      uploadForm.append("file", imageFile);
      await fetch(target.url, { method: "POST", body: uploadForm });

      // Step 3: Create file in Shopify
      const fileResponse = await admin.graphql(FILE_CREATE, {
        variables: {
          files: [{ originalSource: target.resourceUrl, contentType: "IMAGE" }],
        },
      });

      const fileData = await fileResponse.json();
      if (fileData.data.fileCreate.userErrors.length > 0) {
        return json(
          { error: fileData.data.fileCreate.userErrors.map((e) => e.message).join(", ") },
          { status: 400 },
        );
      }

      const file = fileData.data.fileCreate.files[0];
      const fileUrl = file.image?.url || target.resourceUrl;

      // Step 4: Set metafield and track
      await setMetafieldAndTrack(admin, session, resourceId, locale, file.id, fileUrl, originalImageUrl);
      return json({ success: true, locale });
    } catch (error) {
      return json({ error: error.message }, { status: 500 });
    }
  }

  // Remove image translation
  if (intent === "remove") {
    const locale = formData.get("locale");
    try {
      await prisma.imageTranslation.deleteMany({
        where: { shop: session.shop, resourceId, locale },
      });
      return json({ success: true, removed: locale });
    } catch (error) {
      return json({ error: error.message }, { status: 500 });
    }
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

export default function ImageTranslationEditor() {
  const { product, locales, imageTranslations, files } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const navigation = useNavigation();

  const isSubmitting = navigation.state === "submitting";
  const [activeLocale, setActiveLocale] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const translationsByLocale = {};
  imageTranslations.forEach((t) => {
    translationsByLocale[t.locale] = t;
  });

  const handleSelectFile = (file, locale) => {
    const formData = new FormData();
    formData.set("intent", "select-file");
    formData.set("locale", locale);
    formData.set("fileId", file.id);
    formData.set("fileUrl", file.image.url);
    formData.set("originalImageUrl", product?.featuredImage?.url || "");
    submit(formData, { method: "POST" });
    setActiveLocale(null);
  };

  const handleFileUpload = (droppedFiles, locale) => {
    if (droppedFiles.length === 0) return;
    const formData = new FormData();
    formData.set("intent", "upload");
    formData.set("locale", locale);
    formData.set("image", droppedFiles[0]);
    formData.set("originalImageUrl", product?.featuredImage?.url || "");
    submit(formData, { method: "POST", encType: "multipart/form-data" });
  };

  const handleRemove = (locale) => {
    const formData = new FormData();
    formData.set("intent", "remove");
    formData.set("locale", locale);
    submit(formData, { method: "POST" });
  };

  const filteredFiles = files.filter((f) =>
    searchQuery
      ? (f.alt || "").toLowerCase().includes(searchQuery.toLowerCase())
      : true,
  );

  return (
    <Page
      backAction={{ content: "Images", url: "/app/images" }}
      title={product?.title || "Product"}
    >
      <TitleBar title={`Images: ${product?.title || "Product"}`} />
      <BlockStack gap="500">
        {actionData?.success && (
          <Banner tone="success">
            {actionData.removed
              ? "Image removed."
              : `Image set for ${getLocaleDisplayName(actionData.locale)}!`}
          </Banner>
        )}
        {actionData?.error && (
          <Banner tone="critical">Error: {actionData.error}</Banner>
        )}

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Original Image
            </Text>
            {product?.featuredImage ? (
              <Thumbnail
                source={product.featuredImage.url}
                alt={product.featuredImage.altText || product?.title}
                size="large"
              />
            ) : (
              <Text as="p" tone="subdued">
                No featured image
              </Text>
            )}
          </BlockStack>
        </Card>

        <Text as="h2" variant="headingLg">
          Per-Language Images
        </Text>

        <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="400">
          {locales.map((locale) => {
            const existing = translationsByLocale[locale.locale];

            return (
              <Card key={locale.locale}>
                <BlockStack gap="300">
                  <InlineStack align="space-between">
                    <Text as="h3" variant="headingMd">
                      {getLocaleDisplayName(locale.locale)}
                    </Text>
                    {existing && <Badge tone="success">Set</Badge>}
                  </InlineStack>

                  {existing ? (
                    <BlockStack gap="200">
                      <Thumbnail
                        source={existing.translatedImageUrl}
                        alt={`${locale.locale} image`}
                        size="large"
                      />
                      <InlineStack gap="200">
                        <Button
                          size="slim"
                          onClick={() => setActiveLocale(locale.locale)}
                        >
                          Replace
                        </Button>
                        <Button
                          size="slim"
                          tone="critical"
                          onClick={() => handleRemove(locale.locale)}
                          loading={isSubmitting}
                        >
                          Remove
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  ) : (
                    <BlockStack gap="300">
                      <Text as="p" variant="bodySm" tone="subdued">
                        No image set for this language
                      </Text>
                      <Button
                        onClick={() => setActiveLocale(locale.locale)}
                        disabled={isSubmitting}
                      >
                        Select from Files
                      </Button>
                      <DropZone
                        accept="image/*"
                        type="image"
                        onDrop={(files) => handleFileUpload(files, locale.locale)}
                        allowMultiple={false}
                        disabled={isSubmitting}
                      >
                        <DropZone.FileUpload actionHint="or drop to upload" />
                      </DropZone>
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>
            );
          })}
        </InlineGrid>

        {locales.length === 0 && (
          <Card>
            <Text as="p" tone="subdued">
              No secondary languages configured. Add languages in Shopify Admin.
            </Text>
          </Card>
        )}

        {activeLocale && (
          <Modal
            open={true}
            onClose={() => {
              setActiveLocale(null);
              setSearchQuery("");
            }}
            title={`Select image for ${getLocaleDisplayName(activeLocale)}`}
            large
          >
            <Modal.Section>
              <BlockStack gap="400">
                <TextField
                  label="Search files"
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="Search by alt text..."
                  autoComplete="off"
                  clearButton
                  onClearButtonClick={() => setSearchQuery("")}
                />

                {filteredFiles.length === 0 ? (
                  <Text as="p" tone="subdued">
                    No image files found. Upload images in Content &gt; Files first.
                  </Text>
                ) : (
                  <InlineGrid columns={{ xs: 2, sm: 3, md: 4 }} gap="300">
                    {filteredFiles.map((file) => (
                      <div
                        key={file.id}
                        onClick={() => handleSelectFile(file, activeLocale)}
                        style={{
                          cursor: "pointer",
                          border: "2px solid transparent",
                          borderRadius: "8px",
                          padding: "4px",
                          transition: "border-color 0.15s",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.borderColor =
                            "var(--p-color-border-emphasis)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.borderColor = "transparent")
                        }
                      >
                        <BlockStack gap="100" inlineAlign="center">
                          <img
                            src={file.image.url}
                            alt={file.alt || ""}
                            style={{
                              width: "100%",
                              height: "120px",
                              objectFit: "cover",
                              borderRadius: "6px",
                            }}
                          />
                          {file.alt && (
                            <Text as="p" variant="bodySm" truncate>
                              {file.alt}
                            </Text>
                          )}
                        </BlockStack>
                      </div>
                    ))}
                  </InlineGrid>
                )}

                <Text as="p" variant="bodySm" tone="subdued">
                  Or upload a new image using the drop zone on the main page.
                </Text>
              </BlockStack>
            </Modal.Section>
          </Modal>
        )}
      </BlockStack>
    </Page>
  );
}
