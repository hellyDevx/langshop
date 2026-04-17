import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useFetcher, useLoaderData, useSearchParams } from "@remix-run/react";
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
  ProgressBar,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  getOnboardingState,
  markOnboardingComplete,
  saveOnboardingState,
} from "../services/onboarding.server";
import {
  TOTAL_STEPS,
  type OnboardingPayload,
} from "../utils/onboarding-constants";
import { fetchMarkets, fetchShopLocales } from "../services/markets.server";
import { getLocaleDisplayName } from "../utils/locale-utils";
import type { ShopLocale, Market } from "../types/shopify";

type LoaderData = {
  state: OnboardingPayload;
  locales: ShopLocale[];
  markets: Market[];
  activeProviders: string[];
};

type ActionData =
  | { success: true; step: number }
  | { success: true; completed: true }
  | { error: string };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const [state, locales, markets, providers] = await Promise.all([
    getOnboardingState(session.shop),
    fetchShopLocales(admin),
    fetchMarkets(admin),
    prisma.translationProviderConfig.findMany({
      where: { shop: session.shop, isActive: true },
      select: { provider: true },
    }),
  ]);

  return json<LoaderData>({
    state,
    locales,
    markets,
    activeProviders: providers.map((p) => p.provider),
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "save-step") {
    const step = Number.parseInt(String(formData.get("step") || "0"), 10);
    const targetLocalesRaw = String(formData.get("targetLocales") || "");
    const targetLocales = targetLocalesRaw.split(",").filter(Boolean);
    const primaryLocale = String(formData.get("primaryLocale") || "") || null;
    const completedStepsRaw = String(formData.get("completedSteps") || "");
    const completedSteps = completedStepsRaw.split(",").filter(Boolean);

    await saveOnboardingState(session.shop, {
      step: Math.max(0, Math.min(step, TOTAL_STEPS)),
      primaryLocale,
      targetLocales,
      completedSteps,
    });
    return json<ActionData>({ success: true, step });
  }

  if (intent === "complete") {
    await markOnboardingComplete(session.shop);
    return redirect("/app/auto-translate");
  }

  return json<ActionData>({ error: "Unknown action" }, { status: 400 });
};

const STEP_TITLES = [
  "Welcome",
  "Choose target languages",
  "Configure a provider",
  "Brand voice (optional)",
  "Install theme blocks (optional)",
  "You're ready to translate",
];

export default function Onboarding() {
  const { state, locales, markets, activeProviders } =
    useLoaderData<LoaderData>();
  const fetcher = useFetcher<ActionData>();
  const [searchParams, setSearchParams] = useSearchParams();

  const stepParam = Number.parseInt(searchParams.get("step") ?? "", 10);
  const initialStep = Number.isFinite(stepParam)
    ? Math.max(0, Math.min(stepParam, TOTAL_STEPS - 1))
    : state.step;

  const [step, setStep] = useState(initialStep);
  const [targetLocales, setTargetLocales] = useState<string[]>(
    state.targetLocales,
  );

  const primaryLocale = locales.find((l) => l.primary)?.locale ?? null;
  const publishedNonPrimary = locales.filter(
    (l) => !l.primary && l.published,
  );

  const progress = ((step + 1) / TOTAL_STEPS) * 100;
  const hasProvider = activeProviders.length > 0;

  const persist = (nextStep: number, completedSteps: string[]) => {
    const fd = new FormData();
    fd.set("intent", "save-step");
    fd.set("step", String(nextStep));
    fd.set("targetLocales", targetLocales.join(","));
    if (primaryLocale) fd.set("primaryLocale", primaryLocale);
    fd.set("completedSteps", completedSteps.join(","));
    fetcher.submit(fd, { method: "POST" });
  };

  const goTo = (next: number) => {
    const clamped = Math.max(0, Math.min(next, TOTAL_STEPS - 1));
    setStep(clamped);
    const sp = new URLSearchParams(searchParams);
    sp.set("step", String(clamped));
    setSearchParams(sp);
    const completed = Array.from(
      new Set([...state.completedSteps, String(step)]),
    );
    persist(clamped, completed);
  };

  const finish = () => {
    const fd = new FormData();
    fd.set("intent", "complete");
    fetcher.submit(fd, { method: "POST" });
  };

  const toggleLocale = (loc: string) => {
    setTargetLocales((prev) =>
      prev.includes(loc) ? prev.filter((p) => p !== loc) : [...prev, loc],
    );
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Welcome to LangShop
              </Text>
              <Text as="p" variant="bodyMd">
                We detected the following setup on your store. Review and
                continue when you're ready.
              </Text>
              <BlockStack gap="100">
                <Text as="p" variant="bodyMd">
                  <strong>Primary locale:</strong>{" "}
                  {primaryLocale
                    ? `${getLocaleDisplayName(primaryLocale)} (${primaryLocale})`
                    : "Not configured"}
                </Text>
                <Text as="p" variant="bodyMd">
                  <strong>Published target locales:</strong>{" "}
                  {publishedNonPrimary.length > 0
                    ? publishedNonPrimary
                        .map((l) => getLocaleDisplayName(l.locale))
                        .join(", ")
                    : "None yet"}
                </Text>
                <Text as="p" variant="bodyMd">
                  <strong>Shopify Markets:</strong>{" "}
                  {markets.length > 0
                    ? `${markets.length} configured`
                    : "None configured"}
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        );

      case 1:
        if (publishedNonPrimary.length === 0) {
          return (
            <Card>
              <EmptyState
                heading="No target locales yet"
                image=""
                action={{
                  content: "Open Shopify admin",
                  url: "https://admin.shopify.com/",
                  external: true,
                }}
              >
                <p>
                  Add and publish at least one non-primary locale in your
                  Shopify admin, then return here to continue.
                </p>
              </EmptyState>
            </Card>
          );
        }
        return (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Choose target languages
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Pick the published locales you plan to translate first. You can
                always translate the others later from the Auto-Translate page.
              </Text>
              <BlockStack gap="200">
                {publishedNonPrimary.map((l) => (
                  <Checkbox
                    key={l.locale}
                    label={`${getLocaleDisplayName(l.locale)} (${l.locale})`}
                    checked={targetLocales.includes(l.locale)}
                    onChange={() => toggleLocale(l.locale)}
                  />
                ))}
              </BlockStack>
            </BlockStack>
          </Card>
        );

      case 2:
        return (
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  Configure a translation provider
                </Text>
                {hasProvider && <Badge tone="success">Configured</Badge>}
              </InlineStack>
              <Text as="p" variant="bodyMd" tone="subdued">
                LangShop uses Google Translate, DeepL, Claude, or OpenAI.
                Configure at least one to start translating.
              </Text>
              <InlineStack gap="200">
                <Button url="/app/settings">Open Settings</Button>
              </InlineStack>
              {!hasProvider && (
                <Banner tone="warning">
                  No provider is active yet. Come back to this step after saving
                  an API key in Settings.
                </Banner>
              )}
            </BlockStack>
          </Card>
        );

      case 3:
        return (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Configure brand voice (optional)
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Set tone, style, and custom instructions so AI translations
                sound like your brand. Applies to Claude and OpenAI.
              </Text>
              <InlineStack gap="200">
                <Button url="/app/settings/brand-voice">
                  Configure brand voice
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        );

      case 4:
        return (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Install theme blocks (optional)
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                To use the language switcher and third-party content translator
                on your storefront, enable the LangShop blocks in the Theme
                Editor:
              </Text>
              <BlockStack gap="100">
                <Text as="p" variant="bodyMd">
                  1. Open <strong>Online Store → Themes → Customize</strong>.
                </Text>
                <Text as="p" variant="bodyMd">
                  2. Under <em>App embeds</em>, enable{" "}
                  <strong>LangShop Image Swap</strong>.
                </Text>
                <Text as="p" variant="bodyMd">
                  3. Add the <strong>LangShop Switcher</strong> block where you
                  want the language picker to appear.
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        );

      case 5:
        return (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                You're ready to translate
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Here's a summary of your setup. Click finish to jump into
                Auto-Translate and kick off your first job.
              </Text>
              <BlockStack gap="100">
                <Text as="p" variant="bodyMd">
                  <strong>Target locales:</strong>{" "}
                  {targetLocales.length > 0
                    ? targetLocales
                        .map((l) => getLocaleDisplayName(l))
                        .join(", ")
                    : "—"}
                </Text>
                <Text as="p" variant="bodyMd">
                  <strong>Active providers:</strong>{" "}
                  {activeProviders.length > 0
                    ? activeProviders.join(", ")
                    : "None"}
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        );

      default:
        return null;
    }
  };

  const canContinue = step !== 2 || hasProvider;

  return (
    <Page
      backAction={{ content: "Dashboard", url: "/app" }}
      title="Setup"
      subtitle="Finish configuring LangShop in a few quick steps."
    >
      <TitleBar title="Setup" />
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="200">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">
                Step {step + 1} of {TOTAL_STEPS}: {STEP_TITLES[step]}
              </Text>
              <Text as="span" variant="bodySm" tone="subdued">
                {Math.round(progress)}%
              </Text>
            </InlineStack>
            <ProgressBar progress={progress} size="small" />
          </BlockStack>
        </Card>

        {renderStep()}

        <InlineStack align="space-between" blockAlign="center">
          <Button
            onClick={() => goTo(step - 1)}
            disabled={step === 0 || fetcher.state === "submitting"}
          >
            Back
          </Button>
          {step < TOTAL_STEPS - 1 ? (
            <Button
              variant="primary"
              onClick={() => goTo(step + 1)}
              disabled={!canContinue || fetcher.state === "submitting"}
              loading={fetcher.state === "submitting"}
            >
              Continue
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={finish}
              loading={fetcher.state === "submitting"}
            >
              Finish & open Auto-Translate
            </Button>
          )}
        </InlineStack>
      </BlockStack>
    </Page>
  );
}
