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
    // Fetch current product data
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
          variants(first: 1) {
            edges {
              node {
                price
                sku
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

    const productData = {
      ...product,
      variants: product.variants.edges.map(({ node }) => node),
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
