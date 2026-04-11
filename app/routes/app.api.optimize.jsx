import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { optimizeProduct } from "../services/ai/gemini.server";
import { deployUpdate } from "../services/shopify/mutations.server";

export const action = async ({ request }) => {
  const { admin, billing, session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  let productId = formData.get("productId");
  const manualContext = formData.get("manualContext");

  if (!productId) {
    return json({ error: "Product ID fehlt." }, { status: 400 });
  }

  // Normalize to full GID format
  if (!productId.startsWith("gid://")) {
    productId = `gid://shopify/Product/${productId}`;
  }

  // Limit pre-check (deployUpdate does the authoritative check + tracking)
  const { checkLimit, limitErrorResponse } = await import("../middleware/enforce-limits.server.js");
  const limitResult = await checkLimit(shop, "optimize");
  if (!limitResult.allowed) {
    return json(limitErrorResponse(limitResult));
  }

  try {
    // Fetch current product data with deep context (metafields, collections, specs)
    const response = await admin.graphql(
      `#graphql
      query getProduct($id: ID!) {
        product(id: $id) {
          id
          title
          handle
          descriptionHtml
          vendor
          productType
          tags
          seo {
            title
            description
          }
          variants(first: 5) {
            edges {
              node {
                price
                sku
                title
                selectedOptions {
                  name
                  value
                }
              }
            }
          }
          metafields(first: 20) {
            edges {
              node {
                namespace
                key
                value
                type
              }
            }
          }
          collections(first: 5) {
            edges {
              node {
                title
                handle
              }
            }
          }
          media(first: 5) {
            edges {
              node {
                ... on MediaImage {
                  image {
                    altText
                    url
                  }
                }
              }
            }
          }
        }
      }`,
      { variables: { id: productId } }
    );

    const data = await response.json();
    const product = data.data?.product;

    if (!product) {
      return json({ error: "Produkt nicht gefunden." }, { status: 404 });
    }

    // Build deep context from metafields
    const metafields = (product.metafields?.edges || []).map(({ node }) => node);
    const deepContext = metafields
      .filter(mf => mf.value && mf.value.length > 2 && !mf.key.startsWith("geo_"))
      .map(mf => `[${mf.namespace}.${mf.key}] (${mf.type}): ${mf.value.substring(0, 500)}`)
      .join("\n");

    const collections = (product.collections?.edges || []).map(({ node }) => node.title);
    const mediaAlts = (product.media?.edges || [])
      .map(({ node }) => node.image?.altText)
      .filter(Boolean);

    const productData = {
      ...product,
      variants: product.variants.edges.map(({ node }) => node),
      deepContext: deepContext || null,
      collections,
      mediaAlts,
    };

    // ── MODULE 1: Deep Context Scraping Engine ──
    // Fetch the live product page to capture OS 2.0 section content
    let scrapedContext = "";
    try {
      const shopDomain = shop.replace(".myshopify.com", "").length === shop.length ? shop : shop;
      const liveUrl = `https://${shopDomain}/products/${product.handle}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const pageRes = await fetch(liveUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "TitanGEO-ContextEngine/1.0",
          "Accept": "text/html",
        },
      });
      clearTimeout(timeout);

      if (pageRes.ok) {
        const html = await pageRes.text();
        // Strip non-content elements
        let cleaned = html
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<nav[\s\S]*?<\/nav>/gi, "")
          .replace(/<header[\s\S]*?<\/header>/gi, "")
          .replace(/<footer[\s\S]*?<\/footer>/gi, "")
          .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
          .replace(/<svg[\s\S]*?<\/svg>/gi, "")
          .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
          .replace(/<!--[\s\S]*?-->/g, "")
          .replace(/<[^>]+>/g, " ")      // Strip remaining HTML tags
          .replace(/\{[\s\S]*?\}/g, " ") // Strip JSON/CSS blocks
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&#\d+;/g, "")
          .replace(/\s+/g, " ")
          .trim();

        // Take only the meaningful middle portion (skip nav/header text remnants)
        if (cleaned.length > 500) {
          // Find the product title in the text as anchor point
          const titleIndex = cleaned.toLowerCase().indexOf(product.title.toLowerCase().substring(0, 20));
          if (titleIndex > 0) {
            cleaned = cleaned.substring(Math.max(0, titleIndex - 100));
          }
        }

        // Cap at 3000 chars to avoid prompt bloat
        scrapedContext = cleaned.substring(0, 3000);
      }
    } catch (e) {
      // Scraping failed silently — continue with GraphQL data only
      console.log("[DeepContext] Scrape failed for", product.handle, ":", e.message);
    }

    // Merge scraped context with metafield context
    const combinedContext = [productData.deepContext, scrapedContext].filter(Boolean).join("\n\n");
    productData.deepContext = combinedContext || null;
    productData.scrapedContext = scrapedContext || null;

    // ── MODULE 2: Pre-Flight Firewall & Token-Saver ──
    // Check if we have enough context to produce quality output
    let parsedManualContext = null;

    if (manualContext) {
      try {
        parsedManualContext = JSON.parse(manualContext);
      } catch {
        parsedManualContext = null;
      }
    }

    const contextWordCount = (combinedContext || "").split(/\s+/).filter(w => w.length > 1).length;
    const descriptionWordCount = (product.descriptionHtml || "").replace(/<[^>]+>/g, " ").split(/\s+/).filter(w => w.length > 1).length;
    const totalContextWords = contextWordCount + descriptionWordCount;

    if (totalContextWords < 25 && !parsedManualContext) {
      return json({
        success: false,
        status: "NEEDS_CONTEXT",
        message: "Zu wenig Kontext für eine qualitativ hochwertige KI-Optimierung.",
        productTitle: product.title,
        productHandle: product.handle,
        contextWords: totalContextWords,
      });
    }

    // Pass manual context to product data for Gemini
    if (parsedManualContext) {
      productData.manualContext = parsedManualContext;
    }

    // Run Gemini optimization
    const optimized = await optimizeProduct(shop, productData);

    // Deploy to Shopify (with limit check)
    const result = await deployUpdate(
      admin,
      billing,
      shop,
      productId,
      optimized,
      product
    );

    if (!result.success) {
      return json({
        error: result.error,
        requiresUpgrade: result.requiresUpgrade || false,
      }, { status: 403 });
    }

    // Usage is tracked inside deployUpdate — no duplicate tracking needed
    return json({
      success: true,
      geoScore: optimized.geoScore,
      remaining: result.remaining,
      total: result.total,
    });
  } catch (error) {
    console.error("Optimize error:", error);
    return json({ error: error.message }, { status: 500 });
  }
};
