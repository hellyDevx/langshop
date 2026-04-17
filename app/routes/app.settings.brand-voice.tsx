import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Banner,
  BlockStack,
  Button,
  Card,
  InlineStack,
  Page,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  getBrandVoiceConfig,
  saveBrandVoiceConfig,
} from "../services/brand-voice.server";

const TONE_OPTIONS = [
  { label: "Friendly", value: "Friendly" },
  { label: "Professional", value: "Professional" },
  { label: "Casual", value: "Casual" },
  { label: "Formal", value: "Formal" },
  { label: "Playful", value: "Playful" },
  { label: "Technical", value: "Technical" },
];

const STYLE_OPTIONS = [
  { label: "Concise", value: "Concise" },
  { label: "Descriptive", value: "Descriptive" },
  { label: "Conversational", value: "Conversational" },
  { label: "Editorial", value: "Editorial" },
  { label: "Technical", value: "Technical" },
];

const MAX_INSTRUCTIONS_LEN = 2000;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const config = await getBrandVoiceConfig(session.shop);
  return json({
    config: config
      ? {
          tone: config.tone,
          style: config.style,
          instructions: config.instructions,
        }
      : null,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const tone = String(formData.get("tone") || "");
  const style = String(formData.get("style") || "");
  const instructions = String(formData.get("instructions") || "");

  if (!tone || !style) {
    return json({ error: "Tone and style are required." }, { status: 400 });
  }
  if (instructions.length > MAX_INSTRUCTIONS_LEN) {
    return json(
      { error: `Instructions must be ${MAX_INSTRUCTIONS_LEN} characters or fewer.` },
      { status: 400 },
    );
  }

  await saveBrandVoiceConfig(session.shop, { tone, style, instructions });
  return json({ success: true });
};

export default function BrandVoiceSettings() {
  const { config } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ success?: boolean; error?: string }>();

  const [tone, setTone] = useState(config?.tone || TONE_OPTIONS[0].value);
  const [style, setStyle] = useState(config?.style || STYLE_OPTIONS[0].value);
  const [instructions, setInstructions] = useState(config?.instructions || "");

  useEffect(() => {
    if (config) {
      setTone(config.tone);
      setStyle(config.style);
      setInstructions(config.instructions);
    }
  }, [config]);

  const isSubmitting = fetcher.state === "submitting";

  const submit = () => {
    const fd = new FormData();
    fd.set("tone", tone);
    fd.set("style", style);
    fd.set("instructions", instructions);
    fetcher.submit(fd, { method: "POST" });
  };

  return (
    <Page
      backAction={{ content: "Settings", url: "/app/settings" }}
      title="Brand voice"
      subtitle="Guide how your store sounds when translated."
    >
      <TitleBar title="Brand voice" />
      <BlockStack gap="500">
        <Banner tone="info">
          Brand voice applies to AI translation providers (arriving in a later
          phase). Google Translate and DeepL use your glossary rules instead —
          configure those on the Glossary page.
        </Banner>

        {fetcher.data?.success && (
          <Banner tone="success">Brand voice saved.</Banner>
        )}
        {fetcher.data?.error && (
          <Banner tone="critical">{fetcher.data.error}</Banner>
        )}

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Voice
            </Text>
            <InlineStack gap="400" wrap>
              <div style={{ minWidth: 220 }}>
                <Select
                  label="Tone"
                  options={TONE_OPTIONS}
                  value={tone}
                  onChange={setTone}
                />
              </div>
              <div style={{ minWidth: 220 }}>
                <Select
                  label="Style"
                  options={STYLE_OPTIONS}
                  value={style}
                  onChange={setStyle}
                />
              </div>
            </InlineStack>

            <TextField
              label="Instructions"
              multiline={6}
              value={instructions}
              onChange={setInstructions}
              autoComplete="off"
              maxLength={MAX_INSTRUCTIONS_LEN}
              showCharacterCount
              helpText={`Examples: "Use American English spelling." "Never use 'cheap' — prefer 'affordable'."`}
              placeholder="Add extra guidance the AI should follow when translating."
            />

            <InlineStack align="end">
              <Button
                variant="primary"
                onClick={submit}
                loading={isSubmitting}
                disabled={!tone || !style}
              >
                Save brand voice
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
