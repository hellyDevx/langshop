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
  DropZone,
  InlineStack,
  Button,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { fetchShopLocales } from "../services/markets.server";
import {
  getImageTranslations,
  uploadAndSetImage,
} from "../services/image-translation.server";
import { getLocaleDisplayName } from "../utils/locale-utils";

const PRODUCT_QUERY = `#graphql
  query Product($id: ID!) {
    product(id: $id) {
      id
      title
      featuredImage {
        url
        altText
      }
      images(first: 10) {
        nodes {
          id
          url
          altText
        }
      }
    }
  }
`;

export const loader = async ({ request, params }) => {
  const { admin, session } = await authenticate.admin(request);
  const resourceId = decodeURIComponent(params.resourceId);

  const [productResponse, locales, imageTranslations] = await Promise.all([
    admin.graphql(PRODUCT_QUERY, { variables: { id: resourceId } }),
    fetchShopLocales(admin),
    getImageTranslations(session.shop, resourceId),
  ]);

  const productData = await productResponse.json();

  return {
    product: productData.data.product,
    locales: locales.filter((l) => !l.primary),
    imageTranslations,
    resourceId,
  };
};

export const action = async ({ request, params }) => {
  const { admin, session } = await authenticate.admin(request);
  const resourceId = decodeURIComponent(params.resourceId);
  const formData = await request.formData();
  const locale = formData.get("locale");
  const imageFile = formData.get("image");
  const originalImageUrl = formData.get("originalImageUrl");

  if (!locale || !imageFile || !originalImageUrl) {
    return json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const result = await uploadAndSetImage(admin, session.shop, {
      resourceId,
      locale,
      marketId: null,
      imageFile,
      originalImageUrl,
    });
    return json({ success: true, ...result });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export default function ImageTranslationEditor() {
  const { product, locales, imageTranslations, resourceId } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const navigation = useNavigation();

  const isSubmitting = navigation.state === "submitting";

  const handleFileUpload = (files, locale) => {
    if (files.length === 0) return;

    const formData = new FormData();
    formData.set("locale", locale);
    formData.set("image", files[0]);
    formData.set(
      "originalImageUrl",
      product.featuredImage?.url || "",
    );
    submit(formData, { method: "POST", encType: "multipart/form-data" });
  };

  // Build a map of locale -> image translation
  const translationsByLocale = {};
  imageTranslations.forEach((t) => {
    translationsByLocale[t.locale] = t;
  });

  return (
    <Page
      backAction={{ content: "Images", url: "/app/images" }}
      title={product?.title || "Product"}
    >
      <TitleBar title={`Images: ${product?.title || "Product"}`} />
      <BlockStack gap="500">
        {actionData?.success && (
          <Banner tone="success">Image uploaded successfully!</Banner>
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
                alt={product.featuredImage.altText || product.title}
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
                      <Text as="p" variant="bodySm" tone="subdued">
                        Upload a new image to replace
                      </Text>
                    </BlockStack>
                  ) : (
                    <Text as="p" variant="bodySm" tone="subdued">
                      No image set for this language
                    </Text>
                  )}

                  <DropZone
                    accept="image/*"
                    type="image"
                    onDrop={(files) =>
                      handleFileUpload(files, locale.locale)
                    }
                    allowMultiple={false}
                    disabled={isSubmitting}
                  >
                    <DropZone.FileUpload
                      actionHint="or drop image to upload"
                    />
                  </DropZone>
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
      </BlockStack>
    </Page>
  );
}
