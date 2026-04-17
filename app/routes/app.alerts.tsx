import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  useFetcher,
  useLoaderData,
  useSearchParams,
} from "@remix-run/react";
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  Checkbox,
  EmptyState,
  InlineStack,
  Page,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  dismissAlert,
  dismissAll,
  listAlerts,
} from "../services/alerts.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const includeDismissed = url.searchParams.get("all") === "1";
  const cursor = url.searchParams.get("cursor") || undefined;
  const result = await listAlerts(session.shop, {
    includeDismissed,
    cursor,
    limit: 25,
  });
  return json({
    alerts: result.alerts,
    hasMore: result.hasMore,
    endCursor: result.endCursor,
    includeDismissed,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "dismiss-one") {
    const id = String(formData.get("id") || "");
    if (!id) return json({ error: "Missing id." }, { status: 400 });
    await dismissAlert(session.shop, id);
    return json({ success: true });
  }

  if (intent === "dismiss-all") {
    const count = await dismissAll(session.shop);
    return json({ success: true, count });
  }

  return json({ error: "Unknown action." }, { status: 400 });
};

function toneForSeverity(severity: string): "critical" | "warning" | "info" {
  if (severity === "critical") return "critical";
  if (severity === "warning") return "warning";
  return "info";
}

export default function Alerts() {
  const { alerts, hasMore, endCursor, includeDismissed } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ success?: boolean; count?: number; error?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showDismissed, setShowDismissed] = useState(includeDismissed);

  const isSubmitting = fetcher.state === "submitting";

  const toggleShowDismissed = (value: boolean) => {
    setShowDismissed(value);
    const next = new URLSearchParams(searchParams);
    if (value) next.set("all", "1");
    else next.delete("all");
    next.delete("cursor");
    setSearchParams(next);
  };

  const goNext = () => {
    if (!endCursor) return;
    const next = new URLSearchParams(searchParams);
    next.set("cursor", endCursor);
    setSearchParams(next);
  };

  const dismissOne = (id: string) => {
    const fd = new FormData();
    fd.set("intent", "dismiss-one");
    fd.set("id", id);
    fetcher.submit(fd, { method: "POST" });
  };

  const dismissAllAction = () => {
    const fd = new FormData();
    fd.set("intent", "dismiss-all");
    fetcher.submit(fd, { method: "POST" });
  };

  return (
    <Page
      backAction={{ content: "Dashboard", url: "/app" }}
      title="Alerts"
      subtitle="Failures, quota warnings, and other issues across your shop."
    >
      <TitleBar title="Alerts" />
      <BlockStack gap="400">
        {fetcher.data?.success && fetcher.data.count !== undefined && (
          <Banner tone="info">
            Dismissed {fetcher.data.count} alert
            {fetcher.data.count === 1 ? "" : "s"}.
          </Banner>
        )}
        {fetcher.data?.error && (
          <Banner tone="critical">{fetcher.data.error}</Banner>
        )}

        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Checkbox
                label="Show dismissed"
                checked={showDismissed}
                onChange={toggleShowDismissed}
              />
              <Button
                onClick={dismissAllAction}
                loading={isSubmitting}
                disabled={
                  alerts.filter((a) => !a.dismissed).length === 0
                }
              >
                Dismiss all
              </Button>
            </InlineStack>

            {alerts.length === 0 ? (
              <EmptyState heading="No alerts" image="">
                <p>You're all caught up. Alerts appear here when jobs fail or a provider approaches its quota.</p>
              </EmptyState>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left" }}>
                    <th style={{ padding: 8 }}>Severity</th>
                    <th style={{ padding: 8 }}>Type</th>
                    <th style={{ padding: 8 }}>Message</th>
                    <th style={{ padding: 8 }}>Created</th>
                    <th style={{ padding: 8, textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((a) => (
                    <tr
                      key={a.id}
                      style={{
                        borderTop: "1px solid var(--p-color-border)",
                        opacity: a.dismissed ? 0.55 : 1,
                      }}
                    >
                      <td style={{ padding: 8 }}>
                        <Badge tone={toneForSeverity(a.severity)}>
                          {a.severity}
                        </Badge>
                      </td>
                      <td style={{ padding: 8 }}>
                        <Badge>{a.type}</Badge>
                      </td>
                      <td style={{ padding: 8 }}>
                        <Text as="span" breakWord>
                          {a.message}
                        </Text>
                      </td>
                      <td style={{ padding: 8 }}>
                        <Text as="span" variant="bodySm" tone="subdued">
                          {new Date(a.createdAt).toLocaleString()}
                        </Text>
                      </td>
                      <td style={{ padding: 8, textAlign: "right" }}>
                        {a.dismissed ? (
                          <Text as="span" variant="bodySm" tone="subdued">
                            Dismissed
                          </Text>
                        ) : (
                          <Button
                            onClick={() => dismissOne(a.id)}
                            variant="plain"
                          >
                            Dismiss
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {hasMore && (
              <InlineStack align="end">
                <Button onClick={goNext}>Next page</Button>
              </InlineStack>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
