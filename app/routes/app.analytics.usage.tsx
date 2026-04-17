import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Card,
  InlineStack,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getUsageSummary } from "../services/analytics.server";
import { getLocaleDisplayName } from "../utils/locale-utils";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const summary = await getUsageSummary(session.shop, 30);
  return json(summary);
};

function providerLabel(p: string): string {
  if (p === "google") return "Google Translate";
  if (p === "deepl") return "DeepL";
  if (p === "claude") return "Claude";
  if (p === "openai") return "OpenAI";
  return p;
}

export default function Usage() {
  const { rows, totals } = useLoaderData<typeof loader>();

  return (
    <Page
      backAction={{ content: "Analytics", url: "/app/analytics" }}
      title="Usage"
      subtitle="Character and request totals over the last 30 days."
    >
      <TitleBar title="Usage" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Totals by provider
                </Text>
                {totals.length === 0 ? (
                  <Text as="p" tone="subdued">
                    No usage recorded in the last 30 days.
                  </Text>
                ) : (
                  <InlineStack gap="400" wrap>
                    {totals.map((t) => (
                      <Card key={t.provider}>
                        <BlockStack gap="100">
                          <Text as="h3" variant="headingSm">
                            {providerLabel(t.provider)}
                          </Text>
                          <Text as="p" variant="bodyMd">
                            {t.characters.toLocaleString()} chars
                          </Text>
                          <Text as="p" variant="bodyMd">
                            {t.requests.toLocaleString()} requests
                          </Text>
                          <Text as="p" variant="bodyMd" tone="subdued">
                            {t.usd !== null
                              ? `~$${t.usd.toFixed(2)} estimated`
                              : "Cost estimate unavailable"}
                          </Text>
                        </BlockStack>
                      </Card>
                    ))}
                  </InlineStack>
                )}
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Daily breakdown
                </Text>
                {rows.length === 0 ? (
                  <Text as="p" tone="subdued">
                    No rows.
                  </Text>
                ) : (
                  <table
                    style={{ width: "100%", borderCollapse: "collapse" }}
                  >
                    <thead>
                      <tr style={{ textAlign: "left" }}>
                        <th style={{ padding: 8 }}>Date</th>
                        <th style={{ padding: 8 }}>Provider</th>
                        <th style={{ padding: 8 }}>Locale</th>
                        <th style={{ padding: 8 }}>Characters</th>
                        <th style={{ padding: 8 }}>Requests</th>
                        <th style={{ padding: 8 }}>Est. cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr
                          key={`${r.provider}-${r.locale}-${i}`}
                          style={{ borderTop: "1px solid var(--p-color-border)" }}
                        >
                          <td style={{ padding: 8 }}>
                            {new Date(r.date).toLocaleDateString()}
                          </td>
                          <td style={{ padding: 8 }}>
                            <Badge>{providerLabel(r.provider)}</Badge>
                          </td>
                          <td style={{ padding: 8 }}>
                            {getLocaleDisplayName(r.locale)}
                          </td>
                          <td style={{ padding: 8 }}>
                            {r.characterCount.toLocaleString()}
                          </td>
                          <td style={{ padding: 8 }}>
                            {r.requestCount.toLocaleString()}
                          </td>
                          <td style={{ padding: 8 }}>
                            {r.estimatedUsd !== null
                              ? `$${r.estimatedUsd.toFixed(4)}`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
