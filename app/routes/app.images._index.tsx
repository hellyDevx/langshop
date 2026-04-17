import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSearchParams, useNavigate } from "@remix-run/react";
import {
  Page,
  Card,
  BlockStack,
  Text,
  IndexTable,
  Pagination,
  Badge,
  Thumbnail,
  EmptyState,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

const PRODUCTS_WITH_IMAGES_QUERY = `#graphql
  query ProductsWithImages($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      nodes {
        id
        title
        featuredImage {
          url
          altText
        }
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const after = url.searchParams.get("after") || undefined;

  const response = await admin.graphql(PRODUCTS_WITH_IMAGES_QUERY, {
    variables: { first: 25, after },
  });
  const { data } = await response.json();

  return {
    products: data.products.nodes as Array<{
      id: string;
      title: string;
      featuredImage: { url: string; altText: string | null } | null;
    }>,
    pageInfo: data.products.pageInfo as {
      hasNextPage: boolean;
      hasPreviousPage: boolean;
      startCursor?: string;
      endCursor?: string;
    },
  };
};

export default function ImagesOverview() {
  const { products, pageInfo } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  return (
    <Page
      backAction={{ content: "Dashboard", url: "/app" }}
      title="Image Translations"
    >
      <TitleBar title="Image Translations" />
      <BlockStack gap="400">
        <Text as="p" variant="bodyMd" tone="subdued">
          Upload locale-specific images for your products. These are stored as
          metafields and can be used in your theme to show different images per
          language.
        </Text>

        {products.length === 0 ? (
          <Card>
            <EmptyState heading="No products found" image="">
              <p>Add products to your store to manage image translations.</p>
            </EmptyState>
          </Card>
        ) : (
          <Card padding="0">
            <IndexTable
              resourceName={{ singular: "product", plural: "products" }}
              itemCount={products.length}
              selectable={false}
              headings={[
                { title: "Image" },
                { title: "Product" },
                { title: "Action" },
              ]}
            >
              {products.map((product, index) => (
                <IndexTable.Row
                  id={product.id}
                  key={product.id}
                  position={index}
                  onClick={() =>
                    navigate(
                      `/app/images/${product.id.split("/").pop()}`,
                    )
                  }
                >
                  <IndexTable.Cell>
                    {product.featuredImage ? (
                      <Thumbnail
                        source={product.featuredImage.url}
                        alt={product.featuredImage.altText || product.title}
                        size="small"
                      />
                    ) : (
                      <Badge>No image</Badge>
                    )}
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" variant="bodyMd" fontWeight="bold">
                      {product.title}
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" variant="bodySm" tone="magic">
                      Manage images →
                    </Text>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>

            <div
              style={{
                padding: "16px",
                display: "flex",
                justifyContent: "center",
              }}
            >
              <Pagination
                hasPrevious={pageInfo.hasPreviousPage}
                hasNext={pageInfo.hasNextPage}
                onPrevious={() => {
                  const params = new URLSearchParams(searchParams);
                  params.set("before", pageInfo.startCursor || "");
                  params.delete("after");
                  setSearchParams(params);
                }}
                onNext={() => {
                  const params = new URLSearchParams(searchParams);
                  params.set("after", pageInfo.endCursor || "");
                  params.delete("before");
                  setSearchParams(params);
                }}
              />
            </div>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
