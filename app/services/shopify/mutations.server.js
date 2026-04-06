import prisma from "../../db.server.js";
import axios from "axios";

const FREE_TIER_LIMIT = 5;
const INDEX_NOW_KEY = process.env.INDEXNOW_KEY || "titan-geo-core-key";

/**
 * Check if the shop has exceeded the free-tier limit and has no active subscription.
 */
async function checkUsageLimit(shop, billing) {
  const count = await prisma.usageTracker.count({ where: { shop } });

  if (count >= FREE_TIER_LIMIT) {
    let hasSubscription = false;
    try {
      const billingCheck = await billing.require({
        plans: ["Titan GEO Pro"],
        isTest: process.env.NODE_ENV !== "production",
        onFailure: () => {
          hasSubscription = false;
        },
      });
      hasSubscription = true;
    } catch {
      hasSubscription = false;
    }

    if (!hasSubscription) {
      return {
        allowed: false,
        count,
        message: `Free-Tier-Limit erreicht (${count}/${FREE_TIER_LIMIT}). Bitte upgrade auf Titan GEO Pro, um weitere Optimierungen durchzuführen.`,
      };
    }
  }

  return { allowed: true, count };
}

/**
 * Deploy optimized content to Shopify product.
 * Enforces free-tier limit, creates backup, applies mutations, pings IndexNow.
 *
 * @param {object} admin - Shopify admin GraphQL client.
 * @param {object} billing - Shopify billing API.
 * @param {string} shop - Shop domain.
 * @param {string} productId - Shopify product GID.
 * @param {object} data - Optimized data from Gemini engine.
 * @param {object} currentProduct - Current product data for backup.
 */
export async function deployUpdate(admin, billing, shop, productId, data, currentProduct) {
  // 1. Check free-tier limit
  const usage = await checkUsageLimit(shop, billing);
  if (!usage.allowed) {
    return { success: false, error: usage.message, requiresUpgrade: true };
  }

  // 2. Create backup in ContentVersion
  await prisma.contentVersion.create({
    data: {
      shop,
      productId,
      previousData: JSON.stringify({
        title: currentProduct.title,
        descriptionHtml: currentProduct.descriptionHtml,
        seo: currentProduct.seo,
      }),
      newData: JSON.stringify(data),
    },
  });

  // 3. Update product via GraphQL
  const productUpdate = await admin.graphql(
    `#graphql
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
          title
          descriptionHtml
          seo {
            title
            description
          }
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        input: {
          id: productId,
          title: data.optimizedTitle,
          descriptionHtml: data.optimizedHtmlBody,
          seo: {
            title: data.optimizedTitle,
            description: data.optimizedMetaDesc,
          },
        },
      },
    }
  );

  const productResult = await productUpdate.json();
  if (productResult.data?.productUpdate?.userErrors?.length > 0) {
    return {
      success: false,
      error: productResult.data.productUpdate.userErrors
        .map((e) => e.message)
        .join(", "),
    };
  }

  // 4. Set JSON-LD metafield
  await admin.graphql(
    `#graphql
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          key
          namespace
          value
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        metafields: [
          {
            ownerId: productId,
            namespace: "custom",
            key: "geo_data",
            type: "json",
            value: JSON.stringify(data.jsonLdSchema),
          },
          {
            ownerId: productId,
            namespace: "custom",
            key: "geo_score",
            type: "number_integer",
            value: String(Math.round(data.geoScore)),
          },
          {
            ownerId: productId,
            namespace: "custom",
            key: "geo_optimized_body",
            type: "multi_line_text_field",
            value: data.optimizedHtmlBody,
          },
        ],
      },
    }
  );

  // 5. Register in UsageTracker
  await prisma.usageTracker.create({
    data: { shop, productId },
  });

  // 6. Ping IndexNow
  const handle = currentProduct.handle;
  if (handle) {
    const productUrl = `https://${shop}/products/${handle}`;
    await pingIndexNow(productUrl).catch((err) =>
      console.error("IndexNow ping failed:", err.message)
    );
  }

  const newCount = usage.count + 1;
  return {
    success: true,
    remaining: Math.max(FREE_TIER_LIMIT - newCount, 0),
    total: newCount,
  };
}

/**
 * Ping IndexNow to notify search engines of the updated URL.
 */
async function pingIndexNow(url) {
  const host = new URL(url).host;

  await axios.post("https://api.indexnow.org/indexnow", {
    host,
    key: INDEX_NOW_KEY,
    keyLocation: `https://${host}/${INDEX_NOW_KEY}.txt`,
    urlList: [url],
  });
}

/**
 * Get current usage stats for a shop.
 */
export async function getUsageStats(shop) {
  const count = await prisma.usageTracker.count({ where: { shop } });
  return {
    used: count,
    limit: FREE_TIER_LIMIT,
    remaining: Math.max(FREE_TIER_LIMIT - count, 0),
    percentage: Math.round((count / FREE_TIER_LIMIT) * 100),
  };
}

/**
 * Get version history for a product.
 */
export async function getVersionHistory(shop, productId) {
  return prisma.contentVersion.findMany({
    where: { shop, productId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
}
