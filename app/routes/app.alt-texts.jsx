import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page, Card, Text, BlockStack, InlineStack, Thumbnail,
  Badge, Button, Banner, Box,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useState, useEffect } from "react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const direction = url.searchParams.get("direction") || "next";

  // Check plan for bulk operations permission
  const { getEffectivePlan } = await import("../middleware/plan-check.server.js");
  const prisma = await import("../db.server.js").then(m => m.default);
  const plan = await getEffectivePlan(session.shop, prisma);
  const { PLAN_LIMITS } = await import("../config/limits.server.js");
  const planLimits = PLAN_LIMITS[plan] || PLAN_LIMITS.Starter;
  const bulkAllowed = planLimits.bulkOperationsAllowed === true;

  const paginationArgs = cursor
    ? direction === "next"
      ? `first: 25, after: "${cursor}"`
      : `last: 25, before: "${cursor}"`
    : "first: 25";

  const response = await admin.graphql(`
    query {
      products(${paginationArgs}) {
        pageInfo {
          hasNextPage
          hasPreviousPage
          startCursor
          endCursor
        }
        nodes {
          id
          title
          featuredMedia {
            preview {
              image {
                url
                altText
              }
            }
          }
          media(first: 5) {
            nodes {
              ... on MediaImage {
                id
                image {
                  url
                  altText
                }
              }
            }
          }
        }
      }
    }
  `);

  const data = await response.json();
  const products = (data.data?.products?.nodes || []).map((p) => {
    const firstMedia = p.media?.nodes?.[0];
    return {
      id: p.id,
      numericId: p.id.replace("gid://shopify/Product/", ""),
      title: p.title,
      image: p.featuredMedia?.preview?.image?.url || "",
      altText: p.featuredMedia?.preview?.image?.altText || "",
      mediaId: firstMedia?.id || "",
      imageCount: p.media?.nodes?.length || 0,
      missingAlt: p.media?.nodes?.filter((m) => !m.image?.altText).length || 0,
    };
  });

  const totalMissing = products.reduce((sum, p) => sum + (p.altText ? 0 : 1), 0);

  const pageInfo = data.data?.products?.pageInfo || {
    hasNextPage: false,
    hasPreviousPage: false,
    startCursor: null,
    endCursor: null
  };

  return json({ products, pageInfo, totalMissing, shop: session.shop, bulkAllowed });
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "generate_alt") {
    const productId = formData.get("productId");
    const productTitle = formData.get("productTitle");
    const imageUrl = formData.get("imageUrl");

    // Limit-Check
    const { checkLimit, trackUsage, limitErrorResponse } = await import("../middleware/enforce-limits.server.js");
    const limitResult = await checkLimit(session.shop, "alttext");
    if (!limitResult.allowed) {
      return json(limitErrorResponse(limitResult));
    }

    // Check Vision AI feature flag for Enterprise customers
    const { getEffectivePlan } = await import("../middleware/plan-check.server.js");
    const prisma = await import("../db.server.js").then(m => m.default);
    const plan = await getEffectivePlan(session.shop, prisma);
    const { PLAN_LIMITS } = await import("../config/limits.server.js");
    const planLimits = PLAN_LIMITS[plan] || PLAN_LIMITS.Starter;
    const visionAiAllowed = planLimits.visionAiAllowed === true;

    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    try {
      let prompt;
      let contents;

      if (visionAiAllowed && imageUrl) {
        // Vision AI: Download image, convert to base64, use inline data
        const imageResponse = await fetch(imageUrl);
        const imageBuffer = await imageResponse.arrayBuffer();
        const base64Image = Buffer.from(imageBuffer).toString('base64');

        prompt = `Analysiere das beigefügte Bild. Erkenne Farben, Materialien, Texturen und die visuelle Komposition, um einen hochpräzisen, barrierefreien SEO-Alt-Text zu generieren.

Produkt: ${productTitle}

Der Alt-Text muss:
- 80-125 Zeichen lang sein
- Das Produkt klar beschreiben inkl. visueller Details (Farbe, Material, Form)
- Relevante Keywords natürlich einbauen
- Auf Deutsch sein
- KEIN "Bild von" oder "Foto von" am Anfang

Antworte NUR mit dem Alt-Text, keine Anführungszeichen, keine Erklärung.`;

        contents = [
          { text: prompt },
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Image,
            },
          },
        ];
      } else {
        // Fallback: Text-only generation (non-Enterprise)
        prompt = `Generiere einen optimalen SEO Alt-Text für ein Produktbild.

Produkt: ${productTitle}
Bild-URL: ${imageUrl}

Der Alt-Text muss:
- 80-125 Zeichen lang sein
- Das Produkt klar beschreiben
- Relevante Keywords natürlich einbauen
- Auf Deutsch sein
- KEIN "Bild von" oder "Foto von" am Anfang

Antworte NUR mit dem Alt-Text, keine Anführungszeichen, keine Erklärung.`;

        contents = prompt;
      }

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: contents,
        config: { temperature: 0.3 },
      });

      const altText = response.text.trim().replace(/^["']|["']$/g, "");

      // Fetch the media ID for this product's first image
      const mediaResponse = await admin.graphql(
        `query getProductMedia($id: ID!) {
          product(id: $id) {
            media(first: 1) {
              nodes {
                ... on MediaImage {
                  id
                  image { url altText }
                }
              }
            }
          }
        }`,
        { variables: { id: productId } },
      );

      const mediaData = await mediaResponse.json();
      const mediaId = mediaData.data?.product?.media?.nodes?.[0]?.id;

      if (!mediaId) {
        return json({ error: "Kein Medienelement gefunden", productId });
      }

      // Save the alt text back to Shopify using productUpdateMedia
      const updateResponse = await admin.graphql(
        `mutation updateMediaAltText($productId: ID!, $media: [UpdateMediaInput!]!) {
          productUpdateMedia(productId: $productId, media: $media) {
            media {
              alt
            }
            mediaUserErrors {
              field
              message
            }
          }
        }`,
        {
          variables: {
            productId,
            media: [
              {
                id: mediaId,
                alt: altText,
              },
            ],
          },
        },
      );

      const updateData = await updateResponse.json();
      const userErrors = updateData.data?.productUpdateMedia?.mediaUserErrors || [];

      if (userErrors.length > 0) {
        return json({
          error: userErrors.map((e) => e.message).join(", "),
          productId,
        });
      }

      trackUsage(session.shop, "alttext");
      return json({ success: true, altText, productId });
    } catch (err) {
      return json({ error: err.message, productId });
    }
  }

  return json({ error: "Unbekannte Aktion" });
};

export default function AltTexts() {
  const { products, pageInfo, totalMissing, bulkAllowed } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [generatedAlts, setGeneratedAlts] = useState({});

  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.altText) {
      setGeneratedAlts((prev) => ({
        ...prev,
        [fetcher.data.productId]: fetcher.data.altText,
      }));
      shopify.toast.show("Alt-Text generiert und gespeichert!");
    } else if (fetcher.data?.error && fetcher.data?.productId) {
      shopify.toast.show(`Fehler: ${fetcher.data.error}`, { isError: true });
    }
  }, [fetcher.data]);

  // Helper function for controlled delay
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Generate alt text for a single product
  const handleGenerateSingle = (product) => {
    fetcher.submit(
      {
        intent: "generate_alt",
        productId: product.id,
        productTitle: product.title,
        imageUrl: product.image || "",
      },
      { method: "post" },
    );
  };

  // Bulk generate alt texts for all products without alt text
  const handleBulkGenerate = async () => {
    const toGenerate = products.filter(p => !p.altText);

    if (toGenerate.length === 0) {
      shopify.toast.show("Alle Produkte haben bereits Alt-Texte!");
      return;
    }

    const total = toGenerate.length;
    shopify.toast.show(`${total} Alt-Texte werden generiert...`);
    let completed = 0;

    for (let i = 0; i < toGenerate.length; i++) {
      const product = toGenerate[i];
      
      // Add delay between each request (2.5 seconds)
      if (i > 0) {
        await delay(2500);
      }
      
      handleGenerateSingle(product);
      completed++;

      // Show progress toast every 5 products
      if (completed % 5 === 0 || completed === total) {
        shopify.toast.show(`${completed}/${total} Alt-Texte generiert...`);
      }
    }

    shopify.toast.show(`Alle ${total} Alt-Texte wurden zur Generierung eingereicht.`);
  };

  return (
    <Page
      title="Bild Alt-Text Optimierer"
      subtitle="Optimiere Alt-Texte für bessere SEO und Barrierefreiheit"
      backAction={{ content: "Dashboard", url: "/app" }}
    >
      <BlockStack gap="400">
        {fetcher.data?.limitReached && (
          <Banner tone="warning" title="Tageslimit erreicht">
            <p>{fetcher.data.error}</p>
            <div style={{ marginTop: "12px" }}>
              <Button variant="primary" url="/app/billing">Jetzt upgraden</Button>
            </div>
          </Banner>
        )}

        {totalMissing > 0 && (
          <Banner tone="warning" title={`${totalMissing} Produkte ohne Alt-Text`}>
            <p>
              Alt-Texte sind wichtig für SEO und Barrierefreiheit. Lass die KI
              optimale Alt-Texte generieren und direkt speichern.
            </p>
          </Banner>
        )}

        {/* Paywall Banner for Bulk Operations */}
        {!bulkAllowed && totalMissing > 0 && (
          <Banner tone="info" title="Bulk-Automatisierung" action={{ content: "Upgrade", url: "/app/billing" }}>
            🚀 Bulk-Automatisierung ist ein Pro-Feature. Spare Stunden manueller Arbeit.
          </Banner>
        )}

        {/* Bulk Generate Button */}
        {totalMissing > 0 && (
          <BlockStack gap="200">
            <Button
              variant="primary"
              onClick={handleBulkGenerate}
              disabled={fetcher.state !== "idle" || !bulkAllowed}
            >
              Alle {totalMissing} Alt-Texte generieren
            </Button>
          </BlockStack>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: "16px",
          }}
        >
          {products.map((product) => {
            const isLoading =
              fetcher.state !== "idle" &&
              fetcher.formData?.get("productId") === product.id;
            const generated = generatedAlts[product.id];

            return (
              <Card key={product.id}>
                <BlockStack gap="300">
                  {/* Thumbnail and title */}
                  <InlineStack gap="300" blockAlign="center">
                    <Thumbnail
                      source={product.image || ""}
                      alt={product.title}
                      size="large"
                    />
                    <BlockStack gap="100">
                      <Text variant="bodyMd" fontWeight="semibold">
                        {product.title}
                      </Text>
                      <Text variant="bodySm" tone="subdued">
                        {product.imageCount} Bild{product.imageCount !== 1 ? "er" : ""} &middot;{" "}
                        {product.missingAlt} ohne Alt-Text
                      </Text>
                    </BlockStack>
                  </InlineStack>

                  {/* Status badge */}
                  <InlineStack gap="200" blockAlign="center">
                    <Text variant="bodySm" fontWeight="semibold">
                      Status:
                    </Text>
                    {product.altText ? (
                      <Badge tone="success">Alt-Text vorhanden</Badge>
                    ) : (
                      <Badge tone="critical">Alt-Text fehlt</Badge>
                    )}
                  </InlineStack>

                  {/* Current alt text */}
                  <Box
                    background="bg-surface-secondary"
                    padding="200"
                    borderRadius="200"
                  >
                    <BlockStack gap="100">
                      <Text variant="bodySm" fontWeight="semibold">
                        Aktueller Alt-Text:
                      </Text>
                      <Text variant="bodySm" tone="subdued">
                        {product.altText || "— Keiner vorhanden —"}
                      </Text>
                    </BlockStack>
                  </Box>

                  {/* Generated alt text (if any) */}
                  {generated && (
                    <Box
                      background="bg-surface-success"
                      padding="200"
                      borderRadius="200"
                    >
                      <BlockStack gap="100">
                        <Text variant="bodySm" fontWeight="semibold">
                          Generierter Alt-Text (gespeichert):
                        </Text>
                        <Text variant="bodySm">{generated}</Text>
                      </BlockStack>
                    </Box>
                  )}

                  {/* Action button */}
                  <Button
                    variant="primary"
                    fullWidth
                    onClick={() => {
                      fetcher.submit(
                        {
                          intent: "generate_alt",
                          productId: product.id,
                          productTitle: product.title,
                          imageUrl: product.image || "",
                        },
                        { method: "post" },
                      );
                    }}
                    loading={isLoading}
                  >
                    {generated ? "Neu generieren & speichern" : "Alt-Text generieren & speichern"}
                  </Button>
                </BlockStack>
              </Card>
            );
          })}
        </div>

        {/* Pagination */}
        {(pageInfo.hasPreviousPage || pageInfo.hasNextPage) && (
          <BlockStack gap="300" align="center">
            <InlineStack gap="300" blockAlign="center">
              {pageInfo.hasPreviousPage && (
                <Button 
                  url={`/app/alt-texts?cursor=${pageInfo.startCursor}&direction=prev`}
                >
                  ← Vorherige Seite
                </Button>
              )}
              <Text variant="bodySm" as="span" tone="subdued">
                Seite
              </Text>
              {pageInfo.hasNextPage && (
                <Button 
                  url={`/app/alt-texts?cursor=${pageInfo.endCursor}&direction=next`}
                >
                  Nächste Seite →
                </Button>
              )}
            </InlineStack>
          </BlockStack>
        )}
      </BlockStack>
    </Page>
  );
}
