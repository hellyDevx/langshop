import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { METAFIELDS_DELETE_MUTATION } from "../graphql/mutations/metafieldsDelete";
import type { AdminClient } from "../types/shopify";

interface MetafieldIdentifier {
  ownerId: string;
  namespace: string;
  key: string;
}

async function deleteMetafieldsBestEffort(
  admin: AdminClient,
  shop: string,
): Promise<void> {
  const identifiers: MetafieldIdentifier[] = [];

  const imageRows = await db.imageTranslation.findMany({
    where: { shop },
    select: { resourceId: true },
    distinct: ["resourceId"],
  });
  for (const row of imageRows) {
    identifiers.push({
      ownerId: row.resourceId,
      namespace: "langshop",
      key: "langshop_images",
    });
  }

  try {
    const shopResponse = await admin.graphql(
      `#graphql
        query ShopId { shop { id } }
      `,
    );
    const shopData = (await shopResponse.json()) as {
      data: { shop: { id: string } };
    };
    const shopId = shopData.data.shop.id;
    identifiers.push({
      ownerId: shopId,
      namespace: "langshop",
      key: "third_party_config",
    });
  } catch (err) {
    console.error("[uninstall] could not resolve shop id:", err);
  }

  if (identifiers.length === 0) return;

  const chunkSize = 25;
  for (let i = 0; i < identifiers.length; i += chunkSize) {
    const chunk = identifiers.slice(i, i + chunkSize);
    try {
      await admin.graphql(METAFIELDS_DELETE_MUTATION, {
        variables: { metafields: chunk },
      });
    } catch (err) {
      console.error(
        `[uninstall] metafieldsDelete chunk ${i}-${i + chunk.length} failed:`,
        err,
      );
    }
  }
}

async function wipeShopData(shop: string): Promise<void> {
  await db.$transaction([
    db.translationJobEntry.deleteMany({
      where: { job: { shop } },
    }),
    db.translationJob.deleteMany({ where: { shop } }),
    db.translationProviderConfig.deleteMany({ where: { shop } }),
    db.imageTranslation.deleteMany({ where: { shop } }),
    db.translationStats.deleteMany({ where: { shop } }),
    db.glossaryTerm.deleteMany({ where: { shop } }),
    db.brandVoiceConfig.deleteMany({ where: { shop } }),
    db.translationAuditLog.deleteMany({ where: { shop } }),
    db.translationAlert.deleteMany({ where: { shop } }),
    db.usageTracking.deleteMany({ where: { shop } }),
    db.contentDigest.deleteMany({ where: { shop } }),
    db.translationSuggestion.deleteMany({ where: { shop } }),
    db.onboardingState.deleteMany({ where: { shop } }),
    db.thirdPartyConfig.deleteMany({ where: { shop } }),
    db.session.deleteMany({ where: { shop } }),
  ]);
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, admin, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  if (admin) {
    try {
      await deleteMetafieldsBestEffort(admin, shop);
    } catch (err) {
      console.error("[uninstall] metafield cleanup failed:", err);
    }
  }

  if (session) {
    try {
      await wipeShopData(shop);
    } catch (err) {
      console.error("[uninstall] data wipe failed:", err);
      // Fall back to at least deleting the session so the app can be reinstalled.
      await db.session.deleteMany({ where: { shop } });
    }
  }

  return new Response();
};
