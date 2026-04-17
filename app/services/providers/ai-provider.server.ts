import Anthropic from "@anthropic-ai/sdk";
import type {
  TranslationProvider,
  ProviderConfig,
  AITranslationContext,
  Language,
} from "../../types/provider";
import { ProviderTransientError } from "./provider-interface.server";

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

export interface AiTranslationResult {
  translations: string[];
  usage: AiUsage;
}

export interface AiTranslationProvider extends TranslationProvider {
  translateWithContext(
    texts: string[],
    sourceLang: string,
    targetLang: string,
    systemPrompt: string,
    context: AITranslationContext | null,
  ): Promise<AiTranslationResult>;
}

const RETURN_TRANSLATIONS_TOOL: Anthropic.Tool = {
  name: "return_translations",
  description:
    "Return the translated strings in the same order as the input. Preserve HTML tags, Unicode placeholders (U+E000..U+E001), and markup verbatim.",
  input_schema: {
    type: "object",
    properties: {
      translations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: { type: "integer" },
            value: { type: "string" },
          },
          required: ["index", "value"],
        },
      },
    },
    required: ["translations"],
  },
};

function buildUserMessage(
  texts: string[],
  sourceLang: string,
  targetLang: string,
): string {
  return `Translate each of the following ${texts.length} strings from ${sourceLang} to ${targetLang}. Return them via the return_translations tool, one entry per input string with the matching index.\n\n${texts
    .map((t, i) => `[${i}] ${t}`)
    .join("\n---\n")}`;
}

export function createAiProvider(
  providerType: string,
  config: ProviderConfig,
  model?: string,
): AiTranslationProvider {
  if (providerType === "claude") return createClaudeProvider(config, model);
  if (providerType === "openai") return createOpenAiProvider(config, model);
  throw new Error(`Unknown AI provider: ${providerType}`);
}

function createClaudeProvider(
  config: ProviderConfig,
  model = "claude-haiku-4-5",
): AiTranslationProvider {
  const client = new Anthropic({ apiKey: config.apiKey });

  async function translateWithContext(
    texts: string[],
    sourceLang: string,
    targetLang: string,
    systemPrompt: string,
    _context: AITranslationContext | null,
  ): Promise<AiTranslationResult> {
    try {
      const response = await client.messages.create({
        model,
        max_tokens: 16000,
        system: [
          {
            type: "text",
            text: systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ],
        tools: [RETURN_TRANSLATIONS_TOOL],
        tool_choice: { type: "tool", name: "return_translations" },
        messages: [
          {
            role: "user",
            content: buildUserMessage(texts, sourceLang, targetLang),
          },
        ],
      });

      const toolUseBlock = response.content.find((b) => b.type === "tool_use");
      if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
        throw new Error("Claude returned no tool_use block");
      }
      const input = toolUseBlock.input as {
        translations: Array<{ index: number; value: string }>;
      };
      const out = new Array<string>(texts.length).fill("");
      for (const t of input.translations) {
        if (t.index >= 0 && t.index < texts.length) out[t.index] = t.value;
      }

      return {
        translations: out,
        usage: {
          inputTokens:
            response.usage.input_tokens +
            (response.usage.cache_creation_input_tokens ?? 0),
          outputTokens: response.usage.output_tokens,
          cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        },
      };
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) {
        throw new ProviderTransientError(err.message, 429);
      }
      if (err instanceof Anthropic.InternalServerError) {
        throw new ProviderTransientError(err.message, 500);
      }
      throw err;
    }
  }

  async function translate(
    texts: string[],
    sourceLang: string,
    targetLang: string,
  ): Promise<string[]> {
    const systemPrompt = `You are a translation system. Translate from ${sourceLang} to ${targetLang}. Return only the translated text for each input string.`;
    const result = await translateWithContext(
      texts,
      sourceLang,
      targetLang,
      systemPrompt,
      null,
    );
    return result.translations;
  }

  async function validateApiKey(): Promise<boolean> {
    try {
      await client.models.retrieve(model);
      return true;
    } catch {
      return false;
    }
  }

  async function getSupportedLanguages(): Promise<Language[]> {
    return [{ label: "All languages (Claude)", value: "*" }];
  }

  return {
    translate,
    translateWithContext,
    validateApiKey,
    getSupportedLanguages,
  };
}

function createOpenAiProvider(
  config: ProviderConfig,
  model = "gpt-4o-mini",
): AiTranslationProvider {
  const baseUrl = "https://api.openai.com/v1";

  async function translateWithContext(
    texts: string[],
    sourceLang: string,
    targetLang: string,
    systemPrompt: string,
    _context: AITranslationContext | null,
  ): Promise<AiTranslationResult> {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              systemPrompt +
              '\n\nRespond ONLY with JSON of shape {"translations":[{"index":<int>,"value":<string>}]}, with one entry per input string.',
          },
          {
            role: "user",
            content: buildUserMessage(texts, sourceLang, targetLang),
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      const msg = `OpenAI error ${response.status}: ${body || response.statusText}`;
      if (response.status === 429 || response.status >= 500) {
        throw new ProviderTransientError(msg, response.status);
      }
      throw new Error(msg);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage: { prompt_tokens: number; completion_tokens: number };
    };

    const raw = data.choices[0]?.message.content ?? "";
    const parsed = JSON.parse(raw) as {
      translations: Array<{ index: number; value: string }>;
    };
    const out = new Array<string>(texts.length).fill("");
    for (const t of parsed.translations) {
      if (t.index >= 0 && t.index < texts.length) out[t.index] = t.value;
    }

    return {
      translations: out,
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
        cacheReadTokens: 0,
      },
    };
  }

  async function translate(
    texts: string[],
    sourceLang: string,
    targetLang: string,
  ): Promise<string[]> {
    const systemPrompt = `You are a translation system. Translate from ${sourceLang} to ${targetLang}. Return only the translated text for each input string.`;
    const result = await translateWithContext(
      texts,
      sourceLang,
      targetLang,
      systemPrompt,
      null,
    );
    return result.translations;
  }

  async function validateApiKey(): Promise<boolean> {
    try {
      const resp = await fetch(`${baseUrl}/models/${model}`, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  async function getSupportedLanguages(): Promise<Language[]> {
    return [{ label: "All languages (OpenAI)", value: "*" }];
  }

  return {
    translate,
    translateWithContext,
    validateApiKey,
    getSupportedLanguages,
  };
}
