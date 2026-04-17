import type {
  TranslationProvider,
  ProviderConfig,
  Language,
} from "../../types/provider";
import { createAiProvider } from "./ai-provider.server";

export class ProviderTransientError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ProviderTransientError";
    this.status = status;
  }
}

function isTransientStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export function isAiProvider(providerType: string): boolean {
  return providerType === "claude" || providerType === "openai";
}

export function createProvider(
  providerType: string,
  config: ProviderConfig,
  model?: string,
): TranslationProvider {
  switch (providerType) {
    case "google":
      return createGoogleProvider(config);
    case "deepl":
      return createDeepLProvider(config);
    case "claude":
    case "openai":
      return createAiProvider(providerType, config, model);
    default:
      throw new Error(`Unknown provider: ${providerType}`);
  }
}

function createGoogleProvider(config: ProviderConfig): TranslationProvider {
  const { apiKey, projectId } = config;
  const baseUrl = `https://translation.googleapis.com/v3/projects/${projectId}`;

  return {
    async translate(
      texts: string[],
      sourceLang: string,
      targetLang: string,
    ): Promise<string[]> {
      const results: string[] = [];

      // Google allows up to 1024 segments per request
      for (let i = 0; i < texts.length; i += 128) {
        const batch = texts.slice(i, i + 128);
        const response = await fetch(`${baseUrl}:translateText`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
          },
          body: JSON.stringify({
            contents: batch,
            sourceLanguageCode: sourceLang,
            targetLanguageCode: targetLang,
            mimeType: "text/plain",
          }),
        });

        if (!response.ok) {
          const errorBody = (await response.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null;
          const message = `Google Translate error: ${errorBody?.error?.message || response.statusText}`;
          if (isTransientStatus(response.status)) {
            throw new ProviderTransientError(message, response.status);
          }
          throw new Error(message);
        }

        const data = (await response.json()) as {
          translations: Array<{ translatedText: string }>;
        };
        results.push(...data.translations.map((t) => t.translatedText));
      }

      return results;
    },

    async validateApiKey(): Promise<boolean> {
      try {
        const response = await fetch(`${baseUrl}/supportedLanguages`, {
          headers: { "X-Goog-Api-Key": apiKey },
        });
        return response.ok;
      } catch {
        return false;
      }
    },

    async getSupportedLanguages(): Promise<Language[]> {
      const response = await fetch(`${baseUrl}/supportedLanguages`, {
        headers: { "X-Goog-Api-Key": apiKey },
      });
      const data = await response.json();
      return data.languages.map(
        (l: { displayName?: string; languageCode: string }) => ({
          label: l.displayName || l.languageCode,
          value: l.languageCode,
        }),
      );
    },
  };
}

function createDeepLProvider(config: ProviderConfig): TranslationProvider {
  const { apiKey } = config;
  const isFree = apiKey.endsWith(":fx");
  const baseUrl = isFree
    ? "https://api-free.deepl.com/v2"
    : "https://api.deepl.com/v2";

  return {
    async translate(
      texts: string[],
      sourceLang: string,
      targetLang: string,
    ): Promise<string[]> {
      const results: string[] = [];

      // DeepL allows up to 50 texts per request
      for (let i = 0; i < texts.length; i += 50) {
        const batch = texts.slice(i, i + 50);
        const response = await fetch(`${baseUrl}/translate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `DeepL-Auth-Key ${apiKey}`,
          },
          body: JSON.stringify({
            text: batch,
            source_lang: sourceLang.toUpperCase().split("-")[0],
            target_lang: targetLang.toUpperCase(),
          }),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          const message = `DeepL error: ${errorBody || response.statusText}`;
          if (isTransientStatus(response.status)) {
            throw new ProviderTransientError(message, response.status);
          }
          throw new Error(message);
        }

        const data = (await response.json()) as {
          translations: Array<{ text: string }>;
        };
        results.push(...data.translations.map((t) => t.text));
      }

      return results;
    },

    async validateApiKey(): Promise<boolean> {
      try {
        const response = await fetch(`${baseUrl}/usage`, {
          headers: { Authorization: `DeepL-Auth-Key ${apiKey}` },
        });
        return response.ok;
      } catch {
        return false;
      }
    },

    async getSupportedLanguages(): Promise<Language[]> {
      const response = await fetch(`${baseUrl}/languages?type=target`, {
        headers: { Authorization: `DeepL-Auth-Key ${apiKey}` },
      });
      const data = await response.json();
      return data.map((l: { name: string; language: string }) => ({
        label: l.name,
        value: l.language.toLowerCase(),
      }));
    },
  };
}
