import { useState } from "react";
import {
  useLoaderData,
  useActionData,
  useSubmit,
  useNavigation,
  useSearchParams,
} from "@remix-run/react";
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
  Select,
  DropZone,
  Box,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { fetchShopLocales, fetchMarkets } from "../services/markets.server";
import {
  getImageTranslations,
  saveImageTranslation,
  removeImageTranslation,
  syncGalleryMetafield,
} from "../services/image-translation.server";
import { formatLocaleOptions, getLocaleDisplayName } from "../utils/locale-utils";

const PRODUCT_QUERY = `#graphql
  query Product($id: ID!) {
    product(id: $id) {
      id
      title
      images(first: 50) {
        nodes {
          id
          url
          altText
        }
      }
    }
  }
`;

const FILES_QUERY = `#graphql
  query Files($first: Int!) {
    files(first: $first, sortKey: CREATED_AT, reverse: true, query: "media_type:IMAGE") {
      nodes {
        id
        alt
        ... on MediaImage {
          image {
            url
          }
        }
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
        parameters { name value }
      }
      userErrors { field message }
    }
  }
`;

const FILE_CREATE = `#graphql
  mutation FileCreate($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files {
        id
        ... on MediaImage { image { url } }
      }
      userErrors { field message }
    }
  }
`;

export const loader = async ({ request, params }) => {
  const { admin, session } = await authenticate.admin(request);
  const resourceId = `gid://shopify/Product/${params.resourceId}`;
  const url = new URL(request.url);
  const selectedLocale = url.searchParams.get("locale") || null;
  const selectedMarketId = url.searchParams.get("marketId") || "";

  const [locales, markets] = await Promise.all([
    fetchShopLocales(admin),
    fetchMarkets(admin),
  ]);

  const locale =
    selectedLocale ||
    locales.find((l) => !l.primary && l.published)?.locale ||
    null;

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

  // Fetch existing translations for this product + market
  const imageTranslations = await getImageTranslations(
    session.shop,
    resourceId,
    selectedMarketId,
  );

  // Fetch store files for the picker
  let files = [];
  try {
    const filesResponse = await admin.graphql(FILES_QUERY, {
      variables: { first: 50 },
    });
    const filesData = await filesResponse.json();
    files = (filesData.data?.files?.nodes || []).filter((f) => f.image?.url);
  } catch (error) {
    console.error("Failed to fetch files:", error.message);
  }

  return {
    product,
    locales,
    markets,
    imageTranslations,
    files,
    resourceId,
    selectedLocale: locale,
    selectedMarketId,
  };
};

export const action = async ({ request, params }) => {
  const { admin, session } = await authenticate.admin(request);
  const resourceId = `gid://shopify/Product/${params.resourceId}`;
  const formData = await request.formData();
  const intent = formData.get("intent");
  const locale = formData.get("locale");
  const marketId = formData.get("marketId") || "";
  const imageId = formData.get("imageId");
  const imagePosition = parseInt(formData.get("imagePosition") || "0", 10);
  const originalImageUrl = formData.get("originalImageUrl") || "";

  if (intent === "select-file") {
    const fileUrl = formData.get("fileUrl");
    if (!locale || !imageId || !fileUrl) {
      return json({ error: "Missing required fields" }, { status: 400 });
    }

    try {
      await saveImageTranslation(session.shop, {
        resourceId,
        imageId,
        imagePosition,
        locale,
        marketId,
        fileUrl,
        originalImageUrl,
      });
      await syncGalleryMetafield(admin, session.shop, resourceId, locale, marketId);
      return json({ success: true });
    } catch (error) {
      return json({ error: error.message }, { status: 500 });
    }
  }

  if (intent === "upload") {
    const imageFile = formData.get("image");
    if (!locale || !imageId || !imageFile) {
      return json({ error: "Missing required fields" }, { status: 400 });
    }

    try {
      // Staged upload
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
      const target = stagedData.data.stagedUploadsCreate.stagedTargets[0];

      // Upload
      const uploadForm = new FormData();
      for (const param of target.parameters) {
        uploadForm.append(param.name, param.value);
      }
      uploadForm.append("file", imageFile);
      await fetch(target.url, { method: "POST", body: uploadForm });

      // Create file
      const fileResponse = await admin.graphql(FILE_CREATE, {
        variables: {
          files: [{ originalSource: target.resourceUrl, contentType: "IMAGE" }],
        },
      });
      const fileData = await fileResponse.json();
      const file = fileData.data.fileCreate.files[0];
      const fileUrl = file.image?.url || target.resourceUrl;

      await saveImageTranslation(session.shop, {
        resourceId,
        imageId,
        imagePosition,
        locale,
        marketId,
        fileUrl,
        originalImageUrl,
      });
      await syncGalleryMetafield(admin, session.shop, resourceId, locale, marketId);
      return json({ success: true });
    } catch (error) {
      return json({ error: error.message }, { status: 500 });
    }
  }

  if (intent === "remove") {
    if (!locale || !imageId) {
      return json({ error: "Missing required fields" }, { status: 400 });
    }

    try {
      await removeImageTranslation(session.shop, {
        resourceId,
        imageId,
        locale,
        marketId,
      });
      await syncGalleryMetafield(admin, session.shop, resourceId, locale, marketId);
      return json({ success: true, removed: true });
    } catch (error) {
      return json({ error: error.message }, { status: 500 });
    }
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

export default function ImageTranslationEditor() {
  const {
    product,
    locales,
    markets,
    imageTranslations,
    files,
    resourceId,
    selectedLocale,
    selectedMarketId,
  } = useLoaderData();

  const actionData = useActionData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [searchParams, setSearchParams] = useSearchParams();

  const isSubmitting = navigation.state === "submitting";
  const [pickerImageId, setPickerImageId] = useState(null);
  const [pickerImagePosition, setPickerImagePosition] = useState(0);
  const [pickerOriginalUrl, setPickerOriginalUrl] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const localeOptions = formatLocaleOptions(locales);
  const marketOptions = [
    { label: "All Markets (Global)", value: "" },
    ...markets
      .filter((m) => m.enabled)
      .map((m) => ({ label: m.name, value: m.id })),
  ];

  // Build translation lookup: imageId -> translation record
  const translationMap = {};
  imageTranslations
    .filter((t) => t.locale === selectedLocale)
    .forEach((t) => {
      translationMap[t.imageId] = t;
    });

  const productImages = product?.images?.nodes || [];

  const handleLocaleChange = (value) => {
    const params = new URLSearchParams(searchParams);
    params.set("locale", value);
    setSearchParams(params);
  };

  const handleMarketChange = (value) => {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set("marketId", value);
    } else {
      params.delete("marketId");
    }
    setSearchParams(params);
  };

  const openPicker = (imageId, position, originalUrl) => {
    setPickerImageId(imageId);
    setPickerImagePosition(position);
    setPickerOriginalUrl(originalUrl);
    setSearchQuery("");
  };

  const handleSelectFile = (file) => {
    const formData = new FormData();
    formData.set("intent", "select-file");
    formData.set("locale", selectedLocale);
    formData.set("marketId", selectedMarketId);
    formData.set("imageId", pickerImageId);
    formData.set("imagePosition", pickerImagePosition.toString());
    formData.set("originalImageUrl", pickerOriginalUrl);
    formData.set("fileUrl", file.image.url);
    submit(formData, { method: "POST" });
    setPickerImageId(null);
  };

  const handleUpload = (droppedFiles, imageId, position, originalUrl) => {
    if (droppedFiles.length === 0) return;
    const formData = new FormData();
    formData.set("intent", "upload");
    formData.set("locale", selectedLocale);
    formData.set("marketId", selectedMarketId);
    formData.set("imageId", imageId);
    formData.set("imagePosition", position.toString());
    formData.set("originalImageUrl", originalUrl);
    formData.set("image", droppedFiles[0]);
    submit(formData, { method: "POST", encType: "multipart/form-data" });
  };

  const handleRemove = (imageId) => {
    const formData = new FormData();
    formData.set("intent", "remove");
    formData.set("locale", selectedLocale);
    formData.set("marketId", selectedMarketId);
    formData.set("imageId", imageId);
    submit(formData, { method: "POST" });
  };

  const filteredFiles = files.filter((f) =>
    searchQuery
      ? (f.alt || "").toLowerCase().includes(searchQuery.toLowerCase())
      : true,
  );

  const primaryLocaleName = getLocaleDisplayName(
    locales.find((l) => l.primary)?.locale || "en",
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
            {actionData.removed ? "Image removed." : "Image saved!"}
          </Banner>
        )}
        {actionData?.error && (
          <Banner tone="critical">Error: {actionData.error}</Banner>
        )}

        {/* Selectors */}
        <Card>
          <InlineStack gap="400">
            <div style={{ width: "250px" }}>
              <Select
                label="Market"
                options={marketOptions}
                value={selectedMarketId}
                onChange={handleMarketChange}
              />
            </div>
            <div style={{ width: "250px" }}>
              <Select
                label="Language"
                options={localeOptions.length > 0 ? localeOptions : [{ label: "No languages", value: "" }]}
                value={selectedLocale || ""}
                onChange={handleLocaleChange}
              />
            </div>
          </InlineStack>
        </Card>

        {!selectedLocale ? (
          <Banner>Please select a target language.</Banner>
        ) : productImages.length === 0 ? (
          <Card>
            <Text as="p" tone="subdued">
              This product has no images.
            </Text>
          </Card>
        ) : (
          <Card>
            <BlockStack gap="0">
              {/* Header */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "50px 1fr 1fr",
                  gap: "16px",
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--p-color-border)",
                  background: "var(--p-color-bg-surface-secondary)",
                }}
              >
                <Text as="span" variant="headingSm">
                  #
                </Text>
                <Text as="span" variant="headingSm">
                  Original ({primaryLocaleName})
                </Text>
                <Text as="span" variant="headingSm">
                  {getLocaleDisplayName(selectedLocale)} Translation
                </Text>
              </div>

              {/* Image rows */}
              {productImages.map((image, index) => {
                const translation = translationMap[image.id];

                return (
                  <div
                    key={image.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "50px 1fr 1fr",
                      gap: "16px",
                      padding: "16px",
                      borderBottom:
                        index < productImages.length - 1
                          ? "1px solid var(--p-color-border)"
                          : "none",
                      alignItems: "center",
                    }}
                  >
                    {/* Position */}
                    <Text as="span" variant="bodyMd" tone="subdued">
                      {index + 1}
                    </Text>

                    {/* Original image */}
                    <div>
                      <img
                        src={image.url}
                        alt={image.altText || `Image ${index + 1}`}
                        style={{
                          width: "120px",
                          height: "120px",
                          objectFit: "cover",
                          borderRadius: "8px",
                          border: "1px solid var(--p-color-border)",
                        }}
                      />
                    </div>

                    {/* Translated image or actions */}
                    <div>
                      {translation ? (
                        <InlineStack gap="300" align="start" blockAlign="center">
                          <img
                            src={translation.translatedImageUrl}
                            alt={`${selectedLocale} image ${index + 1}`}
                            style={{
                              width: "120px",
                              height: "120px",
                              objectFit: "cover",
                              borderRadius: "8px",
                              border: "2px solid var(--p-color-border-success)",
                            }}
                          />
                          <BlockStack gap="200">
                            <Button
                              size="slim"
                              onClick={() =>
                                openPicker(image.id, index, image.url)
                              }
                            >
                              Replace
                            </Button>
                            <Button
                              size="slim"
                              tone="critical"
                              onClick={() => handleRemove(image.id)}
                              loading={isSubmitting}
                            >
                              Remove
                            </Button>
                          </BlockStack>
                        </InlineStack>
                      ) : (
                        <InlineStack gap="200" align="start" blockAlign="center">
                          <Button
                            onClick={() =>
                              openPicker(image.id, index, image.url)
                            }
                            disabled={isSubmitting}
                          >
                            Select from Files
                          </Button>
                          <div style={{ width: "150px" }}>
                            <DropZone
                              accept="image/*"
                              type="image"
                              onDrop={(files) =>
                                handleUpload(files, image.id, index, image.url)
                              }
                              allowMultiple={false}
                              disabled={isSubmitting}
                            >
                              <DropZone.FileUpload actionHint="Upload" />
                            </DropZone>
                          </div>
                        </InlineStack>
                      )}
                    </div>
                  </div>
                );
              })}
            </BlockStack>
          </Card>
        )}

        {selectedMarketId && (
          <Banner tone="info">
            Market-specific translations override global ones for customers in
            this market.
          </Banner>
        )}

        {/* File picker modal */}
        {pickerImageId && (
          <Modal
            open={true}
            onClose={() => setPickerImageId(null)}
            title={`Select ${getLocaleDisplayName(selectedLocale)} image`}
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
                    No image files found. Upload images in Content &gt; Files.
                  </Text>
                ) : (
                  <InlineGrid columns={{ xs: 2, sm: 3, md: 4 }} gap="300">
                    {filteredFiles.map((file) => (
                      <div
                        key={file.id}
                        onClick={() => handleSelectFile(file)}
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
                      </div>
                    ))}
                  </InlineGrid>
                )}
              </BlockStack>
            </Modal.Section>
          </Modal>
        )}
      </BlockStack>
    </Page>
  );
}
