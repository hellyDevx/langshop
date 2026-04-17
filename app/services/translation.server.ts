import { TRANSLATIONS_REGISTER_MUTATION } from "../graphql/mutations/translationsRegister";
import { TRANSLATIONS_REMOVE_MUTATION } from "../graphql/mutations/translationsRemove";
import type { AdminClient, Translation } from "../types/shopify";
import type { TranslationInput } from "../types/translation";

interface UserError {
  field: string[] | null;
  message: string;
}

interface TranslationsRegisterResponse {
  data: {
    translationsRegister: {
      translations: Translation[];
      userErrors: UserError[];
    };
  };
}

interface TranslationsRemoveResponse {
  data: {
    translationsRemove: {
      translations: Translation[];
      userErrors: UserError[];
    };
  };
}

export async function registerTranslations(
  admin: AdminClient,
  {
    resourceId,
    translations,
  }: {
    resourceId: string;
    translations: TranslationInput[];
  },
): Promise<Translation[]> {
  const response = await admin.graphql(TRANSLATIONS_REGISTER_MUTATION, {
    variables: { resourceId, translations },
  });
  const { data } = (await response.json()) as TranslationsRegisterResponse;

  if (data.translationsRegister.userErrors.length > 0) {
    throw new Error(
      data.translationsRegister.userErrors.map((e) => e.message).join(", "),
    );
  }

  return data.translationsRegister.translations;
}

export async function removeTranslations(
  admin: AdminClient,
  {
    resourceId,
    translationKeys,
    locales,
  }: {
    resourceId: string;
    translationKeys: string[];
    locales: string[];
  },
): Promise<Translation[]> {
  const response = await admin.graphql(TRANSLATIONS_REMOVE_MUTATION, {
    variables: { resourceId, translationKeys, locales },
  });
  const { data } = (await response.json()) as TranslationsRemoveResponse;

  if (data.translationsRemove.userErrors.length > 0) {
    throw new Error(
      data.translationsRemove.userErrors.map((e) => e.message).join(", "),
    );
  }

  return data.translationsRemove.translations;
}
