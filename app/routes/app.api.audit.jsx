import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { auditProduct } from "../services/ai/gemini.server";

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const productId = formData.get("productId");

  if (!productId) {
    return json({ error: "Product ID fehlt." }, { status: 400 });
  }

  // Limit-Check
  const { checkLimit, trackUsage, limitErrorResponse } = await import("../middleware/enforce-limits.server.js");
  const limitResult = await checkLimit(shop, "audit");
  if (!limitResult.allowed) {
    return json(limitErrorResponse(limitResult));
  }

  try {
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
    const product = data.data.product;

    if (!product) {
      return json({ error: "Produkt nicht gefunden." }, { status: 404 });
    }

    const productData = {
      ...product,
      variants: product.variants.edges.map(({ node }) => node),
    };

    const result = await auditProduct(shop, productData);
    trackUsage(shop, "audit");

    return json({
      geoScore: result.geoScore,
      title: product.title,
      productId,
    });
  } catch (error) {
    console.error("Audit error:", error);
    return json({ error: error.message }, { status: 500 });
  }
};
