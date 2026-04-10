import prisma from "../../db.server.js";
import axios from "axios";
import { checkLimit, trackUsage } from "../../middleware/enforce-limits.server.js";
import { PLAN_LIMITS, PLANS } from "../../config/limits.server.js";

const INDEX_NOW_KEY = process.env.INDEXNOW_KEY || "titan-geo-core-key";

/**
 * Deploy optimized content to Shopify product.
 * Enforces plan limits via central middleware, creates backup, applies mutations, pings IndexNow.
 *
 * @param {object} admin - Shopify admin GraphQL client.
 * @param {object} billing - Shopify billing API.
 * @param {string} shop - Shop domain.
 * @param {string} productId - Shopify product GID.
 * @param {object} data - Optimized data from Gemini engine.
 * @param {object} currentProduct - Current product data for backup.
 */
export async function deployUpdate(admin, billing, shop, productId, data, currentProduct) {
  // 1. Check plan limits using central middleware
  const limitResult = await checkLimit(shop, "optimize");
  if (!limitResult.allowed) {
    return { 
      success: false, 
      error: limitResult.message, 
      requiresUpgrade: true,
      upgradeUrl: limitResult.upgradeUrl 
    };
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

  // 5. Track usage (writes to DB via enforce-limits)
  await trackUsage(shop, "optimize", productId);

  // 6. Ping IndexNow
  const handle = currentProduct.handle;
  if (handle) {
    const productUrl = `https://${shop}/products/${handle}`;
    await pingIndexNow(productUrl).catch((err) =>
      console.error("IndexNow ping failed:", err.message)
    );
  }

  return {
    success: true,
    remaining: limitResult.remaining,
    limit: limitResult.limit,
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
  // Import getEffectivePlan from the middleware
  const { getEffectivePlan } = await import("../../middleware/plan-check.server.js");
  const plan = await getEffectivePlan(shop, prisma);
  const planLimits = PLAN_LIMITS[plan] || PLAN_LIMITS.Starter;
  const limit = planLimits.geo_optimization;
  
  // Count only today's usage (limits are per-day)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const count = await prisma.usageTracker.count({
    where: { shop, optimizedAt: { gte: todayStart } },
  });
  
  let remaining;
  if (limit === -1) {
    remaining = Infinity;
  } else {
    remaining = Math.max(limit - count, 0);
  }
  
  return {
    used: count,
    limit: limit,
    remaining: remaining,
    percentage: limit === -1 ? 0 : Math.round((count / limit) * 100),
  };
}

/**
 * Get version history for a product.
 */
export async function getVersionHistory(shop, productId) {
  return prisma.contentVersion.findMany({
    where: { shop, productId },
    orderBy: { optimizedAt: "desc" },
    take: 10,
  });
}
