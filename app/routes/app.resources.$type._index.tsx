import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate, useSearchParams } from "@remix-run/react";
import {
  Page,
  Card,
  IndexTable,
  Text,
  Pagination,
  Select,
  InlineStack,
  BlockStack,
  Badge,
  EmptyState,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { fetchTranslatableResources } from "../services/translatable-resources.server";
import { fetchShopLocales } from "../services/markets.server";
import {
  RESOURCE_TYPES,
  getResourceTypeFromSlug,
  getResourceDisplayName,
} from "../utils/resource-type-map";
import { formatLocaleOptions, getLocaleDisplayName } from "../utils/locale-utils";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const after = url.searchParams.get("after") || undefined;
  const before = url.searchParams.get("before") || undefined;
  const locale = url.searchParams.get("locale") || null;

  const resourceType = getResourceTypeFromSlug(params.type!);
  if (!resourceType) {
    throw new Response("Invalid resource type", { status: 404 });
  }

  const [resources, locales] = await Promise.all([
    fetchTranslatableResources(admin, {
      resourceType,
      first: 25,
      after: before ? null : (after ?? null),
      before: before ?? null,
    }),
    fetchShopLocales(admin),
  ]);

  return {
    resources: resources.nodes,
    pageInfo: resources.pageInfo,
    locales,
    resourceType,
    slug: params.type!,
    selectedLocale: locale || locales.find((l) => !l.primary && l.published)?.locale || null,
  };
};

export default function ResourceList() {
  const { resources, pageInfo, locales, resourceType, slug, selectedLocale } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const config = RESOURCE_TYPES[resourceType];
  const localeOptions = formatLocaleOptions(locales);

  const handleLocaleChange = (value: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("locale", value);
    params.delete("after");
    setSearchParams(params);
  };

  const handleRowClick = (resourceId: string) => {
    // Extract numeric ID from GID (e.g., "gid://shopify/Product/123" -> "123")
    const numericId = resourceId.split("/").pop();
    const localeParam = selectedLocale ? `?locale=${selectedLocale}` : "";
    navigate(`/app/resources/${slug}/${numericId}${localeParam}`);
  };

  return (
    <Page
      backAction={{ content: "Dashboard", url: "/app" }}
      title={config?.label || slug}
    >
      <TitleBar title={config?.label || slug} />
      <BlockStack gap="400">
        <Card>
          <InlineStack align="space-between">
            <Text as="h2" variant="headingMd">
              {config?.label}
            </Text>
            {localeOptions.length > 0 && (
              <div style={{ width: "250px" }}>
                <Select
                  label="Target language"
                  labelHidden
                  options={[
                    { label: "Select language...", value: "" },
                    ...localeOptions,
                  ]}
                  value={selectedLocale || ""}
                  onChange={handleLocaleChange}
                />
              </div>
            )}
          </InlineStack>
        </Card>

        {resources.length === 0 ? (
          <Card>
            <EmptyState
              heading={`No ${config?.label?.toLowerCase() || "resources"} found`}
              image=""
            >
              <p>
                There are no translatable{" "}
                {config?.label?.toLowerCase() || "resources"} in your store.
              </p>
            </EmptyState>
          </Card>
        ) : (
          <Card padding="0">
            <IndexTable
              resourceName={{
                singular: config?.label?.slice(0, -1) || "resource",
                plural: config?.label || "resources",
              }}
              itemCount={resources.length}
              selectable={false}
              headings={[
                { title: "Name" },
                { title: "Fields" },
                { title: "Action" },
              ]}
            >
              {resources.map((resource, index) => {
                const name = getResourceDisplayName(
                  resource.translatableContent,
                );
                const fieldCount = resource.translatableContent.filter(
                  (c) => c.value,
                ).length;

                return (
                  <IndexTable.Row
                    id={resource.resourceId}
                    key={resource.resourceId}
                    position={index}
                    onClick={() => handleRowClick(resource.resourceId)}
                  >
                    <IndexTable.Cell>
                      <Text as="span" variant="bodyMd" fontWeight="bold">
                        {name}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Badge>{`${fieldCount} fields`}</Badge>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text
                        as="span"
                        variant="bodySm"
                        tone="magic"
                      >
                        Edit translations →
                      </Text>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                );
              })}
            </IndexTable>

            <div style={{ padding: "16px", display: "flex", justifyContent: "center" }}>
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
