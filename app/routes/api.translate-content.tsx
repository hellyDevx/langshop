import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import {
  applyGlossaryPost,
  applyGlossaryPre,
  getGlossaryTermsByLocalePair,
} from "../services/glossary.server";
import { createProvider } from "../services/providers/provider-interface.server";
import { recordProviderUsage } from "../services/usage.server";

interface TranslateContentRequest {
  locale?: string;
  sourceLocale?: string;
  texts?: string[];
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const auth = await authenticate.public.appProxy(request);
  const session = auth.session;
  if (!session) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: TranslateContentRequest;
  try {
    body = (await request.json()) as TranslateContentRequest;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { locale, texts, sourceLocale } = body;
  if (!locale || !Array.isArray(texts) || texts.length === 0) {
    return json({ error: "Missing locale or texts" }, { status: 400 });
  }
  if (texts.length > 100) {
    return json({ error: "Too many texts (max 100)" }, { status: 400 });
  }

  const configs = await prisma.translationProviderConfig.findMany({
    where: { shop: session.shop, isActive: true },
    orderBy: { createdAt: "asc" },
  });
  const machine = configs.find(
    (c) => c.provider === "google" || c.provider === "deepl",
  );
  if (!machine) {
    return json({ translations: texts });
  }

  const effectiveSource = sourceLocale || "en";
  const provider = createProvider(
    machine.provider,
    {
      apiKey: machine.apiKey,
      projectId: machine.projectId ?? undefined,
    },
    machine.model ?? undefined,
  );

  const rules = await getGlossaryTermsByLocalePair(
    session.shop,
    effectiveSource,
    locale,
  );
  const preResults = texts.map((t) => applyGlossaryPre(t, rules));
  const masked = preResults.map((p) => p.masked);

  let translated: string[];
  try {
    translated = await provider.translate(masked, effectiveSource, locale);
  } catch {
    return json({ translations: texts });
  }

  const final = translated.map(
    (t, i) => applyGlossaryPost(t, preResults[i].placeholderMap, rules).restored,
  );

  const charCount = masked.reduce((sum, t) => sum + t.length, 0);
  await recordProviderUsage(session.shop, machine.provider, locale, charCount);

  return json({ translations: final });
};
