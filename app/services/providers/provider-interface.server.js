/**
 * @typedef {Object} TranslationProvider
 * @property {function(string[], string, string): Promise<string[]>} translate
 * @property {function(): Promise<boolean>} validateApiKey
 * @property {function(): Promise<{label: string, value: string}[]>} getSupportedLanguages
 */

/**
 * Creates a provider instance based on type and config.
 * @param {string} providerType - "google" or "deepl"
 * @param {Object} config - { apiKey, projectId? }
 * @returns {TranslationProvider}
 */
export function createProvider(providerType, config) {
  switch (providerType) {
    case "google":
      return createGoogleProvider(config);
    case "deepl":
      return createDeepLProvider(config);
    default:
      throw new Error(`Unknown provider: ${providerType}`);
  }
}

function createGoogleProvider(config) {
  const { apiKey, projectId } = config;
  const baseUrl = `https://translation.googleapis.com/v3/projects/${projectId}`;

  return {
    async translate(texts, sourceLang, targetLang) {
      const results = [];

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
          const error = await response.json();
          throw new Error(
            `Google Translate error: ${error.error?.message || response.statusText}`,
          );
        }

        const data = await response.json();
        results.push(
          ...data.translations.map((t) => t.translatedText),
        );
      }

      return results;
    },

    async validateApiKey() {
      try {
        const response = await fetch(
          `${baseUrl}/supportedLanguages`,
          {
            headers: { "X-Goog-Api-Key": apiKey },
          },
        );
        return response.ok;
      } catch {
        return false;
      }
    },

    async getSupportedLanguages() {
      const response = await fetch(
        `${baseUrl}/supportedLanguages`,
        {
          headers: { "X-Goog-Api-Key": apiKey },
        },
      );
      const data = await response.json();
      return data.languages.map((l) => ({
        label: l.displayName || l.languageCode,
        value: l.languageCode,
      }));
    },
  };
}

function createDeepLProvider(config) {
  const { apiKey } = config;
  const isFree = apiKey.endsWith(":fx");
  const baseUrl = isFree
    ? "https://api-free.deepl.com/v2"
    : "https://api.deepl.com/v2";

  return {
    async translate(texts, sourceLang, targetLang) {
      const results = [];

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
          const error = await response.text();
          throw new Error(`DeepL error: ${error}`);
        }

        const data = await response.json();
        results.push(...data.translations.map((t) => t.text));
      }

      return results;
    },

    async validateApiKey() {
      try {
        const response = await fetch(`${baseUrl}/usage`, {
          headers: { Authorization: `DeepL-Auth-Key ${apiKey}` },
        });
        return response.ok;
      } catch {
        return false;
      }
    },

    async getSupportedLanguages() {
      const response = await fetch(`${baseUrl}/languages?type=target`, {
        headers: { Authorization: `DeepL-Auth-Key ${apiKey}` },
      });
      const data = await response.json();
      return data.map((l) => ({
        label: l.name,
        value: l.language.toLowerCase(),
      }));
    },
  };
}
