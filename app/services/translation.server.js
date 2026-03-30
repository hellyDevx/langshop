import { TRANSLATIONS_REGISTER_MUTATION } from "../graphql/mutations/translationsRegister";
import { TRANSLATIONS_REMOVE_MUTATION } from "../graphql/mutations/translationsRemove";

export async function registerTranslations(
  admin,
  { resourceId, translations },
) {
  const response = await admin.graphql(TRANSLATIONS_REGISTER_MUTATION, {
    variables: { resourceId, translations },
  });
  const { data } = await response.json();

  if (data.translationsRegister.userErrors.length > 0) {
    throw new Error(
      data.translationsRegister.userErrors
        .map((e) => e.message)
        .join(", "),
    );
  }

  return data.translationsRegister.translations;
}

export async function removeTranslations(
  admin,
  { resourceId, translationKeys, locales },
) {
  const response = await admin.graphql(TRANSLATIONS_REMOVE_MUTATION, {
    variables: { resourceId, translationKeys, locales },
  });
  const { data } = await response.json();

  if (data.translationsRemove.userErrors.length > 0) {
    throw new Error(
      data.translationsRemove.userErrors
        .map((e) => e.message)
        .join(", "),
    );
  }

  return data.translationsRemove.translations;
}
