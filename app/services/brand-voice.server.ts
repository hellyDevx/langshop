import type { BrandVoiceConfig, GlossaryTerm } from "@prisma/client";
import prisma from "../db.server";

export async function getBrandVoiceConfig(
  shop: string,
): Promise<BrandVoiceConfig | null> {
  return prisma.brandVoiceConfig.findUnique({ where: { shop } });
}

export interface BrandVoiceInput {
  tone: string;
  style: string;
  instructions: string;
}

export async function saveBrandVoiceConfig(
  shop: string,
  config: BrandVoiceInput,
): Promise<BrandVoiceConfig> {
  return prisma.brandVoiceConfig.upsert({
    where: { shop },
    create: {
      shop,
      tone: config.tone,
      style: config.style,
      instructions: config.instructions,
    },
    update: {
      tone: config.tone,
      style: config.style,
      instructions: config.instructions,
    },
  });
}

export interface PromptContext {
  resourceType?: string;
  sourceLocale: string;
  targetLocale: string;
}

function formatGlossaryRules(terms: GlossaryTerm[]): string {
  if (terms.length === 0) return "";
  const neverTranslate = terms.filter((t) => t.neverTranslate);
  const mustTranslate = terms.filter((t) => !t.neverTranslate);

  const lines: string[] = [];
  if (neverTranslate.length > 0) {
    lines.push("Never translate these terms — preserve them exactly:");
    for (const t of neverTranslate) {
      lines.push(`- ${t.sourceTerm}`);
    }
  }
  if (mustTranslate.length > 0) {
    lines.push("");
    lines.push("Always translate these terms using the specified target:");
    for (const t of mustTranslate) {
      const cs = t.caseSensitive ? " (case-sensitive)" : "";
      lines.push(`- "${t.sourceTerm}" → "${t.targetTerm}"${cs}`);
    }
  }
  return lines.join("\n");
}

export function buildAISystemPrompt(
  config: BrandVoiceConfig | null,
  glossaryTerms: GlossaryTerm[],
  context: PromptContext,
): string {
  const sections: string[] = [];

  sections.push(
    "You are a translation system for a Shopify storefront. Translate content accurately, preserving meaning, structure, HTML tags, and markup.",
  );
  sections.push(
    `Source locale: ${context.sourceLocale}. Target locale: ${context.targetLocale}.${context.resourceType ? ` Content type: ${context.resourceType}.` : ""}`,
  );

  if (config) {
    const voiceLines: string[] = ["Brand voice:"];
    if (config.tone) voiceLines.push(`- Tone: ${config.tone}`);
    if (config.style) voiceLines.push(`- Style: ${config.style}`);
    if (config.instructions) {
      voiceLines.push(`- Additional instructions: ${config.instructions}`);
    }
    sections.push(voiceLines.join("\n"));
  }

  const glossarySection = formatGlossaryRules(glossaryTerms);
  if (glossarySection) {
    sections.push(`Glossary rules:\n${glossarySection}`);
  }

  sections.push(
    "Output contract: return only the translated text. Do not add explanations, quotes, or prefixes.",
  );

  return sections.join("\n\n");
}
