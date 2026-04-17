import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useActionData, useSubmit, useNavigation } from "@remix-run/react";
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
  Divider,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { createProvider } from "../services/providers/provider-interface.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const configs = await prisma.translationProviderConfig.findMany({
    where: { shop: session.shop },
  });

  const google = configs.find((c) => c.provider === "google");
  const deepl = configs.find((c) => c.provider === "deepl");

  return {
    google: google
      ? {
          apiKey: google.apiKey.substring(0, 8) + "..." ,
          projectId: google.projectId || "",
          isActive: google.isActive,
        }
      : null,
    deepl: deepl
      ? {
          apiKey: deepl.apiKey.substring(0, 8) + "...",
          isActive: deepl.isActive,
        }
      : null,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "save-google") {
    const apiKey = formData.get("apiKey") as string;
    const projectId = formData.get("projectId") as string;

    if (!apiKey || !projectId) {
      return json(
        { error: "API Key and Project ID are required for Google Translate" },
        { status: 400 },
      );
    }

    // Validate the API key
    const provider = createProvider("google", { apiKey, projectId });
    const isValid = await provider.validateApiKey();
    if (!isValid) {
      return json(
        { error: "Invalid Google Translate API key or Project ID" },
        { status: 400 },
      );
    }

    await prisma.translationProviderConfig.upsert({
      where: {
        shop_provider: { shop: session.shop, provider: "google" },
      },
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
    const apiKey = formData.get("apiKey") as string;

    if (!apiKey) {
      return json(
        { error: "API Key is required for DeepL" },
        { status: 400 },
      );
    }

    const provider = createProvider("deepl", { apiKey });
    const isValid = await provider.validateApiKey();
    if (!isValid) {
      return json({ error: "Invalid DeepL API key" }, { status: 400 });
    }

    await prisma.translationProviderConfig.upsert({
      where: {
        shop_provider: { shop: session.shop, provider: "deepl" },
      },
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

  if (intent === "remove-google" || intent === "remove-deepl") {
    const provider = intent.replace("remove-", "");
    await prisma.translationProviderConfig.deleteMany({
      where: { shop: session.shop, provider },
    });
    return json({ removed: provider });
  }

  return json({ error: "Unknown action" }, { status: 400 });
};

export default function Settings() {
  const { google, deepl } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as
    | { success?: string; error?: string; removed?: string }
    | undefined;
  const submit = useSubmit();
  const navigation = useNavigation();

  const [googleKey, setGoogleKey] = useState("");
  const [googleProjectId, setGoogleProjectId] = useState("");
  const [deeplKey, setDeeplKey] = useState("");

  const isSubmitting = navigation.state === "submitting";

  const handleSaveGoogle = () => {
    const formData = new FormData();
    formData.set("intent", "save-google");
    formData.set("apiKey", googleKey);
    formData.set("projectId", googleProjectId);
    submit(formData, { method: "POST" });
  };

  const handleSaveDeepL = () => {
    const formData = new FormData();
    formData.set("intent", "save-deepl");
    formData.set("apiKey", deeplKey);
    submit(formData, { method: "POST" });
  };

  const handleRemove = (provider: string) => {
    const formData = new FormData();
    formData.set("intent", `remove-${provider}`);
    submit(formData, { method: "POST" });
  };

  return (
    <Page
      backAction={{ content: "Dashboard", url: "/app" }}
      title="Settings"
    >
      <TitleBar title="Settings" />
      <BlockStack gap="500">
        {actionData?.success && (
          <Banner tone="success">
            {actionData.success === "google"
              ? "Google Translate"
              : "DeepL"}{" "}
            configured successfully!
          </Banner>
        )}
        {actionData?.error && (
          <Banner tone="critical">{actionData.error}</Banner>
        )}
        {actionData?.removed && (
          <Banner tone="info">Provider removed.</Banner>
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
                  onClick={handleSaveGoogle}
                  loading={isSubmitting}
                  disabled={!googleKey || !googleProjectId}
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
                <Button
                  tone="critical"
                  onClick={() => handleRemove("deepl")}
                >
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
                  onClick={handleSaveDeepL}
                  loading={isSubmitting}
                  disabled={!deeplKey}
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
