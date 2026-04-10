import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { optimizeProduct } from "../services/ai/gemini.server";
import { deployUpdate } from "../services/shopify/mutations.server";

export const action = async ({ request }) => {
  const { admin, billing, session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  let productId = formData.get("productId");

  if (!productId) {
    return json({ error: "Product ID fehlt." }, { status: 400 });
  }

  // Normalize to full GID format
  if (!productId.startsWith("gid://")) {
    productId = `gid://shopify/Product/${productId}`;
  }

  // Limit-Check
  const { checkLimit, trackUsage, limitErrorResponse } = await import("../middleware/enforce-limits.server.js");
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

    trackUsage(shop, "optimize");
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
