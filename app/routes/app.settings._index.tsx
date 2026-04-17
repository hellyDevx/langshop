import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  useLoaderData,
  useActionData,
  useSubmit,
  useNavigation,
} from "@remix-run/react";
import {
  Page,
  Card,
  BlockStack,
  TextField,
  Button,
  Text,
  Banner,
  InlineStack,
  Badge,
  Select,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { createProvider } from "../services/providers/provider-interface.server";
import {
  AVAILABLE_MODELS,
  DEFAULT_MODEL_FOR_PROVIDER,
} from "../utils/cost-estimator";

type ActionData =
  | { success: string }
  | { error: string }
  | { removed: string }
  | undefined;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const configs = await prisma.translationProviderConfig.findMany({
    where: { shop: session.shop },
  });

  const find = (provider: string) => configs.find((c) => c.provider === provider);

  const google = find("google");
  const deepl = find("deepl");
  const claude = find("claude");
  const openai = find("openai");

  const mask = (key: string) => key.substring(0, 8) + "...";

  return json({
    google: google
      ? {
          apiKey: mask(google.apiKey),
          projectId: google.projectId || "",
          isActive: google.isActive,
        }
      : null,
    deepl: deepl
      ? { apiKey: mask(deepl.apiKey), isActive: deepl.isActive }
      : null,
    claude: claude
      ? {
          apiKey: mask(claude.apiKey),
          isActive: claude.isActive,
          model: claude.model ?? DEFAULT_MODEL_FOR_PROVIDER.claude,
        }
      : null,
    openai: openai
      ? {
          apiKey: mask(openai.apiKey),
          isActive: openai.isActive,
          model: openai.model ?? DEFAULT_MODEL_FOR_PROVIDER.openai,
        }
      : null,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "save-google") {
    const apiKey = String(formData.get("apiKey") || "");
    const projectId = String(formData.get("projectId") || "");
    if (!apiKey || !projectId) {
      return json(
        { error: "API Key and Project ID are required for Google Translate" },
        { status: 400 },
      );
    }
    const provider = createProvider("google", { apiKey, projectId });
    if (!(await provider.validateApiKey())) {
      return json(
        { error: "Invalid Google Translate API key or Project ID" },
        { status: 400 },
      );
    }
    await prisma.translationProviderConfig.upsert({
      where: { shop_provider: { shop: session.shop, provider: "google" } },
      create: {
        shop: session.shop,
        provider: "google",
        apiKey,
        projectId,
        isActive: true,
      },
      update: { apiKey, projectId, isActive: true },
    });
    return json({ success: "google" });
  }

  if (intent === "save-deepl") {
    const apiKey = String(formData.get("apiKey") || "");
    if (!apiKey) {
      return json({ error: "API Key is required for DeepL" }, { status: 400 });
    }
    const provider = createProvider("deepl", { apiKey });
    if (!(await provider.validateApiKey())) {
      return json({ error: "Invalid DeepL API key" }, { status: 400 });
    }
    await prisma.translationProviderConfig.upsert({
      where: { shop_provider: { shop: session.shop, provider: "deepl" } },
      create: {
        shop: session.shop,
        provider: "deepl",
        apiKey,
        isActive: true,
      },
      update: { apiKey, isActive: true },
    });
    return json({ success: "deepl" });
  }

  if (intent === "save-claude" || intent === "save-openai") {
    const providerName = intent === "save-claude" ? "claude" : "openai";
    const apiKey = String(formData.get("apiKey") || "");
    const model =
      String(formData.get("model") || "") ||
      DEFAULT_MODEL_FOR_PROVIDER[providerName];
    if (!apiKey) {
      return json({ error: "API Key is required" }, { status: 400 });
    }
    const provider = createProvider(providerName, { apiKey }, model);
    if (!(await provider.validateApiKey())) {
      return json(
        { error: `Invalid ${providerName} API key or model access denied` },
        { status: 400 },
      );
    }
    await prisma.translationProviderConfig.upsert({
      where: { shop_provider: { shop: session.shop, provider: providerName } },
      create: {
        shop: session.shop,
        provider: providerName,
        apiKey,
        model,
        isActive: true,
      },
      update: { apiKey, model, isActive: true },
    });
    return json({ success: providerName });
  }

  if (
    intent === "remove-google" ||
    intent === "remove-deepl" ||
    intent === "remove-claude" ||
    intent === "remove-openai"
  ) {
    const provider = intent.replace("remove-", "");
    await prisma.translationProviderConfig.deleteMany({
      where: { shop: session.shop, provider },
    });
    return json({ removed: provider });
  }

  return json({ error: "Unknown action" }, { status: 400 });
};

export default function Settings() {
  const { google, deepl, claude, openai } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const submit = useSubmit();
  const navigation = useNavigation();

  const [googleKey, setGoogleKey] = useState("");
  const [googleProjectId, setGoogleProjectId] = useState("");
  const [deeplKey, setDeeplKey] = useState("");
  const [claudeKey, setClaudeKey] = useState("");
  const [claudeModel, setClaudeModel] = useState(
    DEFAULT_MODEL_FOR_PROVIDER.claude,
  );
  const [openaiKey, setOpenaiKey] = useState("");
  const [openaiModel, setOpenaiModel] = useState(
    DEFAULT_MODEL_FOR_PROVIDER.openai,
  );

  const isSubmitting = navigation.state === "submitting";

  const handleSave = (intent: string, fields: Record<string, string>) => {
    const formData = new FormData();
    formData.set("intent", intent);
    for (const [k, v] of Object.entries(fields)) formData.set(k, v);
    submit(formData, { method: "POST" });
  };

  const handleRemove = (provider: string) => {
    const formData = new FormData();
    formData.set("intent", `remove-${provider}`);
    submit(formData, { method: "POST" });
  };

  const success =
    actionData && "success" in actionData ? actionData.success : null;
  const error =
    actionData && "error" in actionData ? actionData.error : null;
  const removed =
    actionData && "removed" in actionData ? actionData.removed : null;

  const providerLabel: Record<string, string> = {
    google: "Google Translate",
    deepl: "DeepL",
    claude: "Claude",
    openai: "OpenAI",
  };

  return (
    <Page backAction={{ content: "Dashboard", url: "/app" }} title="Settings">
      <TitleBar title="Settings" />
      <BlockStack gap="500">
        {success && (
          <Banner tone="success">
            {providerLabel[success] ?? success} configured successfully.
          </Banner>
        )}
        {error && <Banner tone="critical">{error}</Banner>}
        {removed && (
          <Banner tone="info">{providerLabel[removed] ?? removed} removed.</Banner>
        )}

        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text as="h2" variant="headingMd">
                Google Translate
              </Text>
              {google?.isActive && <Badge tone="success">Active</Badge>}
            </InlineStack>

            {google ? (
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">
                  API Key: {google.apiKey}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Project ID: {google.projectId}
                </Text>
                <Button
                  tone="critical"
                  onClick={() => handleRemove("google")}
                >
                  Remove
                </Button>
              </BlockStack>
            ) : (
              <BlockStack gap="300">
                <TextField
                  label="API Key"
                  value={googleKey}
                  onChange={setGoogleKey}
                  type="password"
                  autoComplete="off"
                />
                <TextField
                  label="Google Cloud Project ID"
                  value={googleProjectId}
                  onChange={setGoogleProjectId}
                  autoComplete="off"
                  helpText="Found in your Google Cloud Console"
                />
                <Button
                  variant="primary"
                  loading={isSubmitting}
                  disabled={!googleKey || !googleProjectId}
                  onClick={() =>
                    handleSave("save-google", {
                      apiKey: googleKey,
                      projectId: googleProjectId,
                    })
                  }
                >
                  Save & Test Connection
                </Button>
              </BlockStack>
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text as="h2" variant="headingMd">
                DeepL
              </Text>
              {deepl?.isActive && <Badge tone="success">Active</Badge>}
            </InlineStack>

            {deepl ? (
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">
                  API Key: {deepl.apiKey}
                </Text>
                <Button tone="critical" onClick={() => handleRemove("deepl")}>
                  Remove
                </Button>
              </BlockStack>
            ) : (
              <BlockStack gap="300">
                <TextField
                  label="API Key"
                  value={deeplKey}
                  onChange={setDeeplKey}
                  type="password"
                  autoComplete="off"
                  helpText="Free API keys end with :fx"
                />
                <Button
                  variant="primary"
                  loading={isSubmitting}
                  disabled={!deeplKey}
                  onClick={() =>
                    handleSave("save-deepl", { apiKey: deeplKey })
                  }
                >
                  Save & Test Connection
                </Button>
              </BlockStack>
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text as="h2" variant="headingMd">
                Claude (Anthropic)
              </Text>
              {claude?.isActive && <Badge tone="success">Active</Badge>}
            </InlineStack>
            <Text as="p" variant="bodyMd" tone="subdued">
              AI translations use your brand voice and glossary rules. Suggestions
              are reviewed before being applied to your store.
            </Text>

            {claude ? (
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">
                  API Key: {claude.apiKey}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Model: {claude.model}
                </Text>
                <Button
                  tone="critical"
                  onClick={() => handleRemove("claude")}
                >
                  Remove
                </Button>
              </BlockStack>
            ) : (
              <BlockStack gap="300">
                <TextField
                  label="API Key"
                  value={claudeKey}
                  onChange={setClaudeKey}
                  type="password"
                  autoComplete="off"
                  helpText="Anthropic API key — sk-ant-..."
                />
                <Select
                  label="Model"
                  options={AVAILABLE_MODELS.claude.map((m) => ({
                    label: m,
                    value: m,
                  }))}
                  value={claudeModel}
                  onChange={setClaudeModel}
                  helpText="Haiku is fastest + cheapest; Opus is highest quality."
                />
                <Button
                  variant="primary"
                  loading={isSubmitting}
                  disabled={!claudeKey}
                  onClick={() =>
                    handleSave("save-claude", {
                      apiKey: claudeKey,
                      model: claudeModel,
                    })
                  }
                >
                  Save & Test Connection
                </Button>
              </BlockStack>
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text as="h2" variant="headingMd">
                OpenAI
              </Text>
              {openai?.isActive && <Badge tone="success">Active</Badge>}
            </InlineStack>
            <Text as="p" variant="bodyMd" tone="subdued">
              AI translations use your brand voice and glossary rules. Suggestions
              are reviewed before being applied to your store.
            </Text>

            {openai ? (
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">
                  API Key: {openai.apiKey}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Model: {openai.model}
                </Text>
                <Button
                  tone="critical"
                  onClick={() => handleRemove("openai")}
                >
                  Remove
                </Button>
              </BlockStack>
            ) : (
              <BlockStack gap="300">
                <TextField
                  label="API Key"
                  value={openaiKey}
                  onChange={setOpenaiKey}
                  type="password"
                  autoComplete="off"
                  helpText="OpenAI API key — sk-..."
                />
                <Select
                  label="Model"
                  options={AVAILABLE_MODELS.openai.map((m) => ({
                    label: m,
                    value: m,
                  }))}
                  value={openaiModel}
                  onChange={setOpenaiModel}
                />
                <Button
                  variant="primary"
                  loading={isSubmitting}
                  disabled={!openaiKey}
                  onClick={() =>
                    handleSave("save-openai", {
                      apiKey: openaiKey,
                      model: openaiModel,
                    })
                  }
                >
                  Save & Test Connection
                </Button>
              </BlockStack>
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">
                Brand voice
              </Text>
              <Badge>AI only</Badge>
            </InlineStack>
            <Text as="p" variant="bodyMd" tone="subdued">
              Set the tone, style, and custom instructions that AI translations
              follow. Google and DeepL use glossary rules instead.
            </Text>
            <InlineStack align="end">
              <Button url="/app/settings/brand-voice">Configure</Button>
            </InlineStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
