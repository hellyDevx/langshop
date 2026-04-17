import { useState, useMemo } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useActionData, useSubmit, useNavigation, useRevalidator } from "@remix-run/react";
import { useJobProgress } from "../hooks/useJobProgress";
import {
  Page,
  Card,
  BlockStack,
  Text,
  Select,
  Button,
  Banner,
  ProgressBar,
  Badge,
  InlineStack,
  IndexTable,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { fetchShopLocales, fetchMarkets } from "../services/markets.server";
import {
  createTranslationJob,
  getJobsForShop,
} from "../services/auto-translate.server";
import prisma from "../db.server";
import { RESOURCE_TYPES } from "../utils/resource-type-map";
import { formatLocaleOptions, getLocaleDisplayName } from "../utils/locale-utils";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const [locales, markets, jobsResult, providerConfigs] = await Promise.all([
    fetchShopLocales(admin),
    fetchMarkets(admin),
    getJobsForShop(session.shop),
    prisma.translationProviderConfig.findMany({
      where: { shop: session.shop, isActive: true },
    }),
  ]);

  return {
    locales,
    markets,
    jobs: jobsResult.jobs,
    hasProviders: providerConfigs.length > 0,
    providers: providerConfigs.map((p) => ({
      provider: p.provider,
      label: p.provider === "google" ? "Google Translate" : "DeepL",
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "create") {
    const provider = formData.get("provider") as string;
    const resourceType = formData.get("resourceType") as string;
    const targetLocale = formData.get("targetLocale") as string;
    const marketId = (formData.get("marketId") as string) || null;
    const primaryLocale = formData.get("sourceLocale") as string;

    if (!provider || !resourceType || !targetLocale || !primaryLocale) {
      return json({ error: "All fields are required" }, { status: 400 });
    }

    const providerConfig = await prisma.translationProviderConfig.findUnique({
      where: { shop_provider: { shop: session.shop, provider } },
    });

    if (!providerConfig) {
      return json(
        { error: "Provider not configured. Go to Settings first." },
        { status: 400 },
      );
    }

    try {
      const job = await createTranslationJob(session.shop, {
        provider,
        resourceType,
        sourceLocale: primaryLocale,
        targetLocale,
        marketId,
      });

      // Job is queued as `pending`. The scheduler picks it up within one tick
      // (~15s) using an offline admin client, so the action returns immediately
      // and the work survives process restarts.
      return json({ success: true, jobId: job.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return json({ error: message }, { status: 500 });
    }
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

export default function AutoTranslate() {
  const { locales, markets, jobs, hasProviders, providers } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as
    | { success?: boolean; jobId?: string; error?: string }
    | undefined;
  const submit = useSubmit();
  const navigation = useNavigation();
  const revalidator = useRevalidator();

  const [provider, setProvider] = useState(providers[0]?.provider || "");
  const [resourceType, setResourceType] = useState("PRODUCT");
  const [targetLocale, setTargetLocale] = useState("");
  const [marketId, setMarketId] = useState("");

  const isSubmitting = navigation.state === "submitting";
  const primaryLocale = locales.find((l) => l.primary);
  const localeOptions = formatLocaleOptions(locales);

  // Track running jobs and stream progress via SSE
  const runningJobIds = useMemo(
    () =>
      jobs
        .filter((j) => j.status === "running" || j.status === "pending")
        .map((j) => j.id),
    [jobs],
  );

  const { progressMap } = useJobProgress(runningJobIds, {
    onComplete: () => revalidator.revalidate(),
    onError: () => revalidator.revalidate(),
  });

  const resourceTypeOptions = Object.entries(RESOURCE_TYPES).map(
    ([key, config]) => ({
      label: config.label,
      value: key,
    }),
  );

  const marketOptions = [
    { label: "Global (all markets)", value: "" },
    ...markets
      .filter((m) => m.enabled)
      .map((m) => ({ label: m.name, value: m.id })),
  ];

  // Filter locale options to market-specific locales when a market is selected
  const selectedMarket = marketId
    ? markets.find((m) => m.id === marketId)
    : null;
  const selectedMarketLocales = selectedMarket?.webPresence?.rootUrls.map(
    (r) => r.locale,
  );
  const filteredLocaleOptions = selectedMarketLocales
    ? localeOptions.filter((opt) => selectedMarketLocales.includes(opt.value))
    : localeOptions;

  const handleSubmit = () => {
    const formData = new FormData();
    formData.set("intent", "create");
    formData.set("provider", provider);
    formData.set("resourceType", resourceType);
    formData.set("targetLocale", targetLocale);
    formData.set("sourceLocale", primaryLocale?.locale || "en");
    if (marketId) formData.set("marketId", marketId);
    submit(formData, { method: "POST" });
  };

  return (
    <Page
      backAction={{ content: "Dashboard", url: "/app" }}
      title="Auto-Translate"
    >
      <TitleBar title="Auto-Translate" />
      <BlockStack gap="500">
        {!hasProviders && (
          <Banner tone="warning" action={{ content: "Go to Settings", url: "/app/settings" }}>
            <p>
              No translation providers configured. Add your Google Translate or
              DeepL API key in Settings before auto-translating.
            </p>
          </Banner>
        )}

        {actionData?.success && (
          <Banner tone="success">
            Translation job started! Progress will update below.
          </Banner>
        )}
        {actionData?.error && (
          <Banner tone="critical">Error: {actionData.error}</Banner>
        )}

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              New Translation Job
            </Text>

            <Select
              label="Translation provider"
              options={
                providers.length > 0
                  ? providers.map((p) => ({
                      label: p.label,
                      value: p.provider,
                    }))
                  : [{ label: "No providers configured", value: "" }]
              }
              value={provider}
              onChange={setProvider}
              disabled={!hasProviders}
            />

            <Select
              label="Resource type"
              options={resourceTypeOptions}
              value={resourceType}
              onChange={setResourceType}
            />

            <Select
              label="Target language"
              options={[
                { label: "Select language...", value: "" },
                ...filteredLocaleOptions,
              ]}
              value={targetLocale}
              onChange={setTargetLocale}
            />

            <Select
              label="Market scope"
              options={marketOptions}
              value={marketId}
              onChange={setMarketId}
              helpText="Leave as Global to translate for all markets"
            />

            <Button
              variant="primary"
              onClick={handleSubmit}
              loading={isSubmitting}
              disabled={!hasProviders || !targetLocale || !provider}
            >
              Start Auto-Translate
            </Button>
          </BlockStack>
        </Card>

        {jobs.length > 0 && (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Recent Jobs
              </Text>
              <IndexTable
                resourceName={{ singular: "job", plural: "jobs" }}
                itemCount={jobs.length}
                selectable={false}
                headings={[
                  { title: "Resource Type" },
                  { title: "Language" },
                  { title: "Provider" },
                  { title: "Status" },
                  { title: "Progress" },
                ]}
              >
                {jobs.map((job, index) => {
                  // Use real-time SSE data if available, otherwise loader data
                  const live = progressMap[job.id];
                  const completedItems = live?.completedItems ?? job.completedItems;
                  const totalItems = live?.totalItems ?? job.totalItems;
                  const failedItems = live?.failedItems ?? job.failedItems;
                  const status = live?.status ?? job.status;
                  const progress =
                    totalItems > 0
                      ? Math.round(
                          ((completedItems + failedItems) /
                            totalItems) *
                            100,
                        )
                      : 0;

                  return (
                    <IndexTable.Row
                      id={job.id}
                      key={job.id}
                      position={index}
                    >
                      <IndexTable.Cell>
                        {RESOURCE_TYPES[job.resourceType]?.label ||
                          job.resourceType}
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        {getLocaleDisplayName(job.targetLocale)}
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        {job.provider === "google"
                          ? "Google"
                          : "DeepL"}
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Badge
                          tone={
                            status === "completed"
                              ? "success"
                              : status === "failed"
                                ? "critical"
                                : status === "running"
                                  ? "attention"
                                  : undefined
                          }
                        >
                          {status}
                        </Badge>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <div style={{ width: "150px" }}>
                          <BlockStack gap="100">
                            <ProgressBar
                              progress={progress}
                              tone={
                                status === "failed"
                                  ? "critical"
                                  : "primary"
                              }
                              size="small"
                            />
                            <Text as="span" variant="bodySm" tone="subdued">
                              {completedItems}/{totalItems}
                              {failedItems > 0 &&
                                ` (${failedItems} failed)`}
                            </Text>
                          </BlockStack>
                        </div>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  );
                })}
              </IndexTable>
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
