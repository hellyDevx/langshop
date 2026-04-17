import type { ThirdPartyConfig } from "@prisma/client";
import prisma from "../db.server";
import type { AdminClient } from "../types/shopify";
import {
  METAFIELDS_SET_MUTATION,
  METAFIELD_DEFINITION_CREATE_MUTATION,
} from "../graphql/mutations/metafieldsSet";
import {
  DEFAULT_THIRD_PARTY_CONFIG,
  THIRD_PARTY_SELECTOR_MAP,
  type ThirdPartyConfigShape,
  type ThirdPartyPresets,
} from "../utils/third-party-constants";

export type {
  ThirdPartyConfigShape,
  ThirdPartyPresets,
} from "../utils/third-party-constants";
export {
  DEFAULT_THIRD_PARTY_CONFIG,
  THIRD_PARTY_SELECTOR_MAP,
} from "../utils/third-party-constants";

export async function getThirdPartyConfig(
  shop: string,
): Promise<ThirdPartyConfigShape> {
  const row = await prisma.thirdPartyConfig.findUnique({ where: { shop } });
  if (!row) return DEFAULT_THIRD_PARTY_CONFIG;
  try {
    return {
      presets: JSON.parse(row.presetsJson) as ThirdPartyPresets,
      customSelectors: JSON.parse(row.customSelectorsJson) as string[],
    };
  } catch {
    return DEFAULT_THIRD_PARTY_CONFIG;
  }
}

export async function saveThirdPartyConfig(
  shop: string,
  input: ThirdPartyConfigShape,
): Promise<ThirdPartyConfig> {
  return prisma.thirdPartyConfig.upsert({
    where: { shop },
    create: {
      shop,
      presetsJson: JSON.stringify(input.presets),
      customSelectorsJson: JSON.stringify(input.customSelectors),
    },
    update: {
      presetsJson: JSON.stringify(input.presets),
      customSelectorsJson: JSON.stringify(input.customSelectors),
    },
  });
}

export function buildStorefrontConfigPayload(
  config: ThirdPartyConfigShape,
): { selectors: string[] } {
  const selectors: string[] = [];
  for (const [preset, enabled] of Object.entries(config.presets)) {
    if (enabled) {
      const presetSelectors = THIRD_PARTY_SELECTOR_MAP[preset] ?? [];
      for (const s of presetSelectors) selectors.push(s);
    }
  }
  for (const s of config.customSelectors) {
    const trimmed = s.trim();
    if (trimmed) selectors.push(trimmed);
  }
  return { selectors };
}

interface MetafieldsSetResponse {
  data: {
    metafieldsSet: {
      userErrors: Array<{ field: string[] | null; message: string }>;
    };
  };
}

interface MetafieldDefinitionCreateResponse {
  data: {
    metafieldDefinitionCreate: {
      userErrors: Array<{
        field: string[] | null;
        message: string;
        code: string | null;
      }>;
    };
  };
}

export async function writeStorefrontMetafield(
  admin: AdminClient,
  shopGid: string,
  config: ThirdPartyConfigShape,
): Promise<void> {
  // Ensure the metafield definition exists with storefront access. Ignore errors
  // if the definition already exists (idempotent setup).
  try {
    const defResponse = await admin.graphql(
      METAFIELD_DEFINITION_CREATE_MUTATION,
      {
        variables: {
          definition: {
            namespace: "langshop",
            key: "third_party_config",
            name: "LangShop third-party config",
            type: "json",
            ownerType: "SHOP",
            access: { storefront: "PUBLIC_READ" },
          },
        },
      },
    );
    (await defResponse.json()) as MetafieldDefinitionCreateResponse;
  } catch {
    // ignore — non-fatal if definition already exists
  }

  const payload = buildStorefrontConfigPayload(config);
  const setResponse = await admin.graphql(METAFIELDS_SET_MUTATION, {
    variables: {
      metafields: [
        {
          ownerId: shopGid,
          namespace: "langshop",
          key: "third_party_config",
          type: "json",
          value: JSON.stringify(payload),
        },
      ],
    },
  });
  const setData = (await setResponse.json()) as MetafieldsSetResponse;
  if (setData.data.metafieldsSet.userErrors.length > 0) {
    throw new Error(
      setData.data.metafieldsSet.userErrors.map((e) => e.message).join(", "),
    );
  }
}
