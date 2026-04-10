import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page, Card, Text, BlockStack, InlineStack, Button, Banner, Box, Badge, Divider, Spinner, Modal,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useState, useCallback, useEffect } from "react";
import { authenticate } from "../shopify.server";

/* ─── Loader: Produkte mit descriptionHtml laden ─── */
export const loader = async ({ request }) => {
  try {
  const { admin, session } = await authenticate.admin(request);

  // Check plan for auto-apply internal links feature
  const { getEffectivePlan } = await import("../middleware/plan-check.server.js");
  const prisma = await import("../db.server.js").then(m => m.default);
  const plan = await getEffectivePlan(session.shop, prisma);
  const { PLAN_LIMITS } = await import("../config/limits.server.js");
  const planLimits = PLAN_LIMITS[plan] || PLAN_LIMITS.Starter;
  const autoApplyInternalLinks = planLimits.autoApplyInternalLinks === true;

  const response = await admin.graphql(`
    query {
      products(first: 50, sortKey: TITLE) {
        nodes {
          id
          title
          handle
          description
          descriptionHtml
          featuredImage { url altText }
          productType
          tags
          collections(first: 5) {
            nodes { title }
          }
        }
      }
    }
  `);
  const data = await response.json();
  const products = (data.data?.products?.nodes || []).map(p => ({
    id: p.id,
    numericId: p.id.replace("gid://shopify/Product/", ""),
    title: p.title,
    handle: p.handle,
    description: p.description || "",
    descriptionHtml: p.descriptionHtml || "",
    image: p.featuredImage?.url || null,
    imageAlt: p.featuredImage?.altText || "",
    productType: p.productType || "",
    tags: p.tags || [],
    collections: (p.collections?.nodes || []).map(c => c.title),
    linkCount: ((p.descriptionHtml || "").match(/<a\s/gi) || []).length,
  }));

  return json({ products, shop: session.shop, autoApplyInternalLinks });
  } catch (error) {
    console.error("Internal-links loader error:", error);
    if (error instanceof Response) throw error;
    return json({ products: [], shop: "", autoApplyInternalLinks: false, error: error.message });
  }
};

/* ─── Action: Analyse, Auto-Verlinkung, Speichern ─── */
export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "save_description") {
    const productId = formData.get("productId");
    const descriptionHtml = formData.get("descriptionHtml");

    try {
      const mutation = await admin.graphql(
        `#graphql
        mutation productUpdate($input: ProductInput!) {
          productUpdate(input: $input) {
            product {
              id
              descriptionHtml
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
              descriptionHtml: descriptionHtml,
            },
          },
        }
      );

      const mutationResult = await mutation.json();
      const userErrors = mutationResult.data?.productUpdate?.userErrors || [];

      if (userErrors.length > 0) {
        return json({ success: false, intent: "save_description", error: userErrors.map(e => e.message).join(", ") });
      }

      return json({ success: true, intent: "save_description", productId });
    } catch (e) {
      console.error("Save description error:", e);
      return json({ success: false, intent: "save_description", error: "Speichern fehlgeschlagen." });
    }
  }

  // Limit-Check (nur für KI-Aktionen)
  const { checkLimit, trackUsage, limitErrorResponse } = await import("../middleware/enforce-limits.server.js");
  const limitResult = await checkLimit(session.shop, "internallinks");
  if (!limitResult.allowed) {
    return json(limitErrorResponse(limitResult));
  }

  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  if (intent === "analyze") {
    const productsJson = formData.get("products");
    const products = JSON.parse(productsJson);

    const productSummary = products.map(p =>
      `- "${p.title}" (handle: ${p.handle}, typ: ${p.productType}, tags: ${p.tags.join(", ")}, collections: ${p.collections.join(", ")}, aktuelle Links: ${p.linkCount})`
    ).join("\n");

    const prompt = `Du bist ein interner Verlinkungsexperte für E-Commerce SEO im deutschen Markt. Analysiere diesen Produktkatalog und schlage interne Verlinkungen vor.

Produktkatalog:
${productSummary}

Regeln:
- Verlinke nur thematisch zusammenhängende Produkte
- Jede Verlinkung braucht einen konkreten Anchor-Text (auf Deutsch mit korrekten Umlauten)
- Erkläre kurz warum die Verlinkung sinnvoll ist
- Maximal 15 Verlinkungsvorschläge
- Der Anchor-Text muss natürlich klingen und Keywords enthalten
- Priorisiere Produkte mit wenigen bestehenden Links

Generiere exakt dieses JSON-Format (keine Markdown, nur JSON):
{
  "suggestions": [
    {
      "sourceProduct": "Produktname A",
      "sourceHandle": "handle-a",
      "sourceId": "gid://shopify/Product/ID",
      "targetProduct": "Produktname B",
      "targetHandle": "handle-b",
      "anchorText": "Passender Anchor-Text",
      "reason": "Kurze Begründung warum diese Verlinkung SEO-sinnvoll ist",
      "priority": "high|medium|low",
      "insertPosition": "Wo im Text der Link eingefügt werden sollte (z.B. nach dem ersten Absatz, am Ende)"
    }
  ],
  "linkMap": [
    {
      "product": "Produktname",
      "handle": "handle",
      "linksTo": ["handle-a", "handle-b"],
      "linkedFrom": ["handle-c"]
    }
  ],
  "summary": "Zusammenfassung der Verlinkungsstrategie"
}`;

    try {
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: { temperature: 0.4, responseMimeType: "application/json" },
      });
      const linkResult = JSON.parse(result.text);
      trackUsage(session.shop, "internallinks");
      return json({ success: true, intent: "analyze", links: linkResult });
    } catch (e) {
      console.error("Internal links error:", e);
      return json({ success: false, error: "Analyse fehlgeschlagen. Bitte erneut versuchen." });
    }
  }

  if (intent === "auto_link") {
    const sourceId = formData.get("sourceId");
    const sourceHandle = formData.get("sourceHandle");
    const sourceTitle = formData.get("sourceTitle");
    const currentHtml = formData.get("currentHtml");
    const suggestionsJson = formData.get("suggestions");
    const suggestions = JSON.parse(suggestionsJson);

    const prompt = `Du bist ein HTML-Experte für E-Commerce. Füge die folgenden internen Links natürlich in die bestehende Produktbeschreibung ein.

Produkt: ${sourceTitle}
Handle: ${sourceHandle}

Aktuelle HTML-Beschreibung:
${currentHtml}

Einzufügende Links:
${suggestions.map(s => `- Link zu "${s.targetProduct}" (Handle: ${s.targetHandle}): Anchor-Text "${s.anchorText}" - Position: ${s.insertPosition}`).join("\n")}

Regeln:
- Füge die Links als <a href="/products/HANDLE">Anchor-Text</a> ein
- Die Links müssen natürlich im Text eingebaut sein
- Ändere den bestehenden Text MINIMAL - nur Links hinzufügen
- Wenn es keinen passenden Platz gibt, füge einen kurzen natürlichen Satz mit dem Link hinzu
- Alle Texte auf Deutsch mit korrekten Umlauten

Generiere exakt dieses JSON-Format:
{
  "updatedHtml": "Komplette aktualisierte HTML-Beschreibung mit allen Links eingefügt",
  "insertedLinks": [
    {
      "targetHandle": "handle",
      "anchorText": "verwendeter Anchor-Text",
      "context": "Der Satz in dem der Link eingefügt wurde"
    }
  ],
  "changesSummary": "Zusammenfassung der Änderungen"
}`;

    try {
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: { temperature: 0.3, responseMimeType: "application/json" },
      });
      const autoResult = JSON.parse(result.text);
      return json({ success: true, intent: "auto_link", sourceId, autoLink: autoResult });
    } catch (e) {
      console.error("Auto-link error:", e);
      return json({ success: false, error: "Automatische Verlinkung fehlgeschlagen." });
    }
  }

  // Generate single link with AI (Pro/Enterprise feature)
  if (intent === "generate_link") {
    // Check plan for auto-apply internal links feature
    const { getEffectivePlan } = await import("../middleware/plan-check.server.js");
    const prisma = await import("../db.server.js").then(m => m.default);
    const plan = await getEffectivePlan(session.shop, prisma);
    const { PLAN_LIMITS } = await import("../config/limits.server.js");
    const planLimits = PLAN_LIMITS[plan] || PLAN_LIMITS.Starter;
    const autoApplyInternalLinks = planLimits.autoApplyInternalLinks === true;

    if (!autoApplyInternalLinks) {
      return json({ success: false, error: "Auto-Inject Verlinkung ist ein Pro-Feature." });
    }

    const sourceTitle = formData.get("sourceTitle");
    const targetTitle = formData.get("targetTitle");
    const targetHandle = formData.get("targetHandle");

    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const prompt = `Generiere einen einzigen, conversion-starken und natürlichen Übergangssatz auf Deutsch, der am Ende einer Produktbeschreibung für das Quellprodukt "${sourceTitle}" platziert wird und einen Link zum Zielprodukt "${targetTitle}" rechtfertigt. Antworte nur mit dem Satz.`;

    try {
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: { temperature: 0.3 },
      });

      const bridgeSentence = result.text.trim().replace(/^["']|["']$/g, "");
      
      // Create HTML snippet
      const linkHtml = `<p class="titan-related-link">${bridgeSentence} <a href="/products/${targetHandle}">${targetTitle}</a></p>`;

      return json({ 
        success: true, 
        intent: "generate_link", 
        bridgeSentence, 
        linkHtml,
        targetHandle,
        targetTitle
      });
    } catch (e) {
      console.error("Link generation error:", e);
      return json({ success: false, error: "Link-Generierung fehlgeschlagen." });
    }
  }

  // Auto-apply generated link to product
  if (intent === "apply_link") {
    const productId = formData.get("productId");
    const currentHtml = formData.get("currentHtml");
    const linkHtml = formData.get("linkHtml");

    // Append the link snippet to the description
    const updatedHtml = currentHtml + "\n" + linkHtml;

    try {
      const mutation = await admin.graphql(
        `#graphql
        mutation productUpdate($input: ProductInput!) {
          productUpdate(input: $input) {
            product {
              id
              descriptionHtml
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
              descriptionHtml: updatedHtml,
            },
          },
        }
      );

      const mutationResult = await mutation.json();
      const userErrors = mutationResult.data?.productUpdate?.userErrors || [];

      if (userErrors.length > 0) {
        return json({ success: false, intent: "apply_link", error: userErrors.map(e => e.message).join(", ") });
      }

      return json({ success: true, intent: "apply_link", productId, updatedHtml });
    } catch (e) {
      console.error("Apply link error:", e);
      return json({ success: false, intent: "apply_link", error: "Link konnte nicht angewendet werden." });
    }
  }

  return json({ success: false });
};

/* ─── Hilfsfunktionen ─── */
function priorityColor(p) {
  if (p === "high") return "#ef4444";
  if (p === "medium") return "#f59e0b";
  return "#10b981";
}

function priorityLabel(p) {
  if (p === "high") return "Hoch";
  if (p === "medium") return "Mittel";
  return "Niedrig";
}

function priorityTone(p) {
  if (p === "high") return "critical";
  if (p === "medium") return "warning";
  return "success";
}

/* ─── Hauptkomponente ─── */
export default function InternalLinks() {
  const { products } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [previewModal, setPreviewModal] = useState(null);
  const [savedProducts, setSavedProducts] = useState(new Set());

  const isLoading = fetcher.state !== "idle";
  const result = fetcher.data;
  const suggestions = result?.success && result?.intent === "analyze" ? result.links?.suggestions || [] : [];
  const linkMap = result?.success && result?.intent === "analyze" ? result.links?.linkMap || [] : [];
  const autoLink = result?.success && result?.intent === "auto_link" ? result.autoLink : null;

  // Auto-Link Ergebnis als Preview anzeigen
  useEffect(() => {
    if (autoLink && result?.sourceId) {
      setPreviewModal({
        productId: result.sourceId,
        html: autoLink.updatedHtml,
        insertedLinks: autoLink.insertedLinks || [],
        summary: autoLink.changesSummary,
      });
    }
  }, [autoLink, result]);

  // Speicher-Bestätigung
  useEffect(() => {
    if (result?.success && result?.intent === "save_description" && result?.productId) {
      setSavedProducts(prev => new Set([...prev, result.productId]));
      shopify.toast.show("Produktbeschreibung erfolgreich aktualisiert!");
    }
  }, [result, shopify]);

  const handleAnalyze = useCallback(() => {
    const formData = new FormData();
    formData.set("intent", "analyze");
    formData.set("products", JSON.stringify(products.slice(0, 30)));
    fetcher.submit(formData, { method: "post" });
  }, [products, fetcher]);

  const handleAutoLink = useCallback((product, productSuggestions) => {
    const formData = new FormData();
    formData.set("intent", "auto_link");
    formData.set("sourceId", product.id);
    formData.set("sourceHandle", product.handle);
    formData.set("sourceTitle", product.title);
    formData.set("currentHtml", product.descriptionHtml);
    formData.set("suggestions", JSON.stringify(productSuggestions));
    fetcher.submit(formData, { method: "post" });
  }, [fetcher]);

  const handleSaveDescription = useCallback((productId, html) => {
    const formData = new FormData();
    formData.set("intent", "save_description");
    formData.set("productId", productId);
    formData.set("descriptionHtml", html);
    fetcher.submit(formData, { method: "post" });
    setPreviewModal(null);
  }, [fetcher]);

  const handleCopyHtml = useCallback((html) => {
    navigator.clipboard.writeText(html).then(() => {
      shopify.toast.show("HTML in die Zwischenablage kopiert!");
    });
  }, [shopify]);

  // Vorschläge für ein bestimmtes Produkt gruppieren
  const getSuggestionsForProduct = (handle) => {
    return suggestions.filter(s => s.sourceHandle === handle);
  };

  // Eingehende Links für ein Produkt
  const getIncomingLinks = (handle) => {
    return suggestions.filter(s => s.targetHandle === handle);
  };

  return (
    <div className="titan-fade-in">
      <Page
        title="Interne Verlinkung"
        subtitle="KI-gestützte Verlinkungsvorschläge mit Ein-Klick-Anwendung"
        backAction={{ content: "Zurück", url: "/app" }}
      >
        <BlockStack gap="600">

          {/* ─── Hero ─── */}
          <div className="titan-hero">
            <div className="titan-hero-content">
              <h1>Interne Verlinkungsanalyse</h1>
              <p>
                Analysiere deinen Produktkatalog, erhalte intelligente Verlinkungsvorschläge
                und wende sie mit einem Klick direkt an.
              </p>
              <div style={{ marginTop: "16px" }}>
                <Button
                  variant="primary"
                  onClick={handleAnalyze}
                  disabled={isLoading || products.length < 2}
                  loading={isLoading}
                >
                  {isLoading ? "Analysiere Katalog..." : `${products.length} Produkte analysieren`}
                </Button>
              </div>
            </div>
          </div>

          {/* ─── Metriken ─── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px" }}>
            <div className="titan-metric-card">
              <div className="titan-metric-label">Produkte im Katalog</div>
              <div className="titan-metric-value">{products.length}</div>
            </div>
            <div className="titan-metric-card">
              <div className="titan-metric-label">Produkttypen</div>
              <div className="titan-metric-value">
                {new Set(products.map(p => p.productType).filter(Boolean)).size || "—"}
              </div>
            </div>
            <div className="titan-metric-card">
              <div className="titan-metric-label">Vorschläge generiert</div>
              <div className="titan-metric-value">{suggestions.length}</div>
            </div>
            <div className="titan-metric-card">
              <div className="titan-metric-label">Angewendet</div>
              <div className="titan-metric-value">{savedProducts.size}</div>
            </div>
          </div>

          {/* ─── Limit erreicht ─── */}
          {result?.limitReached && (
            <Banner tone="warning" title="Tageslimit erreicht">
              <p>{result.error}</p>
              <div style={{ marginTop: "12px" }}>
                <Button variant="primary" url={result.upgradeUrl || "/app/billing"}>Jetzt upgraden</Button>
              </div>
            </Banner>
          )}

          {/* ─── Fehler ─── */}
          {result && !result.success && result.error && !result.limitReached && (
            <Banner tone="critical" title="Fehler">{result.error}</Banner>
          )}

          {/* ─── Ladeanimation ─── */}
          {isLoading && (
            <Card>
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <Spinner size="large" />
                <div style={{ marginTop: "16px" }}>
                  <Text variant="bodyMd" tone="subdued">Analysiere interne Verlinkungsmöglichkeiten...</Text>
                </div>
              </div>
            </Card>
          )}

          {/* ─── Ergebnisse ─── */}
          {result?.success && result?.intent === "analyze" && !isLoading && (
            <div className="titan-fade-in">
              <BlockStack gap="500">

                {/* Zusammenfassung */}
                {result.links?.summary && (
                  <Card>
                    <BlockStack gap="200">
                      <Text variant="headingSm" as="h2">Strategie-Zusammenfassung</Text>
                      <Text variant="bodyMd">{result.links.summary}</Text>
                    </BlockStack>
                  </Card>
                )}

                {/* Visuelle Link-Map */}
                {linkMap.length > 0 && (
                  <Card>
                    <BlockStack gap="300">
                      <Text variant="headingSm" as="h2">Visuelle Verlinkungskarte</Text>
                      <Text variant="bodySm" tone="subdued">
                        Übersicht der empfohlenen Verlinkungsstruktur zwischen deinen Produkten.
                      </Text>
                      <Divider />
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
                        {linkMap.map((node, ni) => {
                          const outgoing = node.linksTo?.length || 0;
                          const incoming = node.linkedFrom?.length || 0;
                          return (
                            <div key={ni} className="titan-card-premium" style={{ padding: "16px" }}>
                              <BlockStack gap="200">
                                <Text variant="bodySm" fontWeight="bold">{node.product}</Text>
                                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                  <Badge tone="info">Ausgehend: {outgoing}</Badge>
                                  <Badge tone="success">Eingehend: {incoming}</Badge>
                                </div>
                                {outgoing > 0 && (
                                  <div style={{ fontSize: "12px", color: "#475569" }}>
                                    Verlinkt zu: {node.linksTo.map(h => {
                                      const p = products.find(pr => pr.handle === h);
                                      return p ? p.title : h;
                                    }).join(", ")}
                                  </div>
                                )}
                                {incoming > 0 && (
                                  <div style={{ fontSize: "12px", color: "#059669" }}>
                                    Verlinkt von: {node.linkedFrom.map(h => {
                                      const p = products.find(pr => pr.handle === h);
                                      return p ? p.title : h;
                                    }).join(", ")}
                                  </div>
                                )}
                              </BlockStack>
                            </div>
                          );
                        })}
                      </div>
                    </BlockStack>
                  </Card>
                )}

                {/* Produkt-Karten mit Verlinkungsoptionen */}
                <Card>
                  <BlockStack gap="300">
                    <Text variant="headingSm" as="h2">Produkte & Verlinkungsvorschläge</Text>
                    <Divider />
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "12px" }}>
                      {products.map(p => {
                        const productSuggestions = getSuggestionsForProduct(p.handle);
                        const incomingLinks = getIncomingLinks(p.handle);
                        const isSaved = savedProducts.has(p.id);

                        if (productSuggestions.length === 0 && incomingLinks.length === 0) return null;

                        return (
                          <div
                            key={p.id}
                            className="titan-card-premium"
                            style={{
                              padding: "16px",
                              border: selectedProduct?.id === p.id ? "2px solid #6366f1" : undefined,
                              cursor: "pointer",
                            }}
                            onClick={() => setSelectedProduct(selectedProduct?.id === p.id ? null : p)}
                          >
                            <BlockStack gap="200">
                              {p.image ? (
                                <div style={{ width: "100%", height: "100px", borderRadius: "8px", overflow: "hidden", background: "#f8fafc" }}>
                                  <img src={p.image} alt={p.imageAlt || p.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                </div>
                              ) : (
                                <div style={{ width: "100%", height: "100px", borderRadius: "8px", background: "linear-gradient(135deg, #e0e7ff, #ddd6fe)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px" }}>
                                  &#128722;
                                </div>
                              )}
                              <Text variant="bodySm" fontWeight="bold" truncate>{p.title}</Text>
                              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                                <Badge tone="info">Links: {p.linkCount}</Badge>
                                {productSuggestions.length > 0 && (
                                  <Badge tone="warning">+{productSuggestions.length} empfohlen</Badge>
                                )}
                                {isSaved && <Badge tone="success">Aktualisiert</Badge>}
                              </div>
                              {productSuggestions.length > 0 && (
                                <Button
                                  size="slim"
                                  variant="primary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAutoLink(p, productSuggestions);
                                  }}
                                  loading={isLoading}
                                >
                                  Automatisch verlinken
                                </Button>
                              )}
                            </BlockStack>
                          </div>
                        );
                      })}
                    </div>
                  </BlockStack>
                </Card>

                {/* Detaillierte Vorschläge */}
                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="headingSm" as="h2">Alle Verlinkungsvorschläge</Text>
                      <Badge tone="info">{suggestions.length} Vorschläge</Badge>
                    </InlineStack>
                    <Divider />

                    {suggestions.map((link, i) => (
                      <div key={i} className="titan-card-premium" style={{ padding: "20px", borderLeft: `4px solid ${priorityColor(link.priority)}` }}>
                        <BlockStack gap="300">
                          <InlineStack align="space-between" blockAlign="center">
                            <InlineStack gap="200" blockAlign="center">
                              <span style={{ fontWeight: 800, fontSize: "16px", color: "#6366f1" }}>#{i + 1}</span>
                              <Badge tone={priorityTone(link.priority)}>Priorität: {priorityLabel(link.priority)}</Badge>
                            </InlineStack>
                          </InlineStack>

                          {/* Quelle -> Ziel Visualisierung */}
                          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                            <div style={{
                              background: "#f8fafc", borderRadius: "10px", padding: "10px 14px",
                              fontWeight: 600, fontSize: "14px", flex: "1 1 200px",
                            }}>
                              {link.sourceProduct}
                            </div>
                            <span style={{ fontSize: "20px", color: "#6366f1" }}>&#8594;</span>
                            <div style={{
                              background: "linear-gradient(145deg, #f0fdf4, #ecfdf5)", borderRadius: "10px", padding: "10px 14px",
                              fontWeight: 600, fontSize: "14px", border: "1px solid rgba(16,185,129,0.2)", flex: "1 1 200px",
                            }}>
                              {link.targetProduct}
                            </div>
                          </div>

                          {/* Anchor-Text */}
                          <div style={{ background: "#f8fafc", borderRadius: "8px", padding: "12px 16px" }}>
                            <Text variant="bodySm" fontWeight="semibold" tone="subdued">Empfohlener Anchor-Text:</Text>
                            <div style={{ marginTop: "4px" }}>
                              <code style={{ background: "#e2e8f0", padding: "4px 8px", borderRadius: "4px", fontSize: "13px" }}>
                                &lt;a href="/products/{link.targetHandle}"&gt;{link.anchorText}&lt;/a&gt;
                              </code>
                            </div>
                          </div>

                          {/* Begründung */}
                          <Text variant="bodySm" tone="subdued">{link.reason}</Text>

                          {/* Einfüge-Position */}
                          {link.insertPosition && (
                            <div style={{ fontSize: "12px", color: "#6366f1" }}>
                              Einfügen: {link.insertPosition}
                            </div>
                          )}

                          {/* Aktionen */}
                          <InlineStack gap="200">
                            <Button
                              size="slim"
                              onClick={() => handleCopyHtml(`<a href="/products/${link.targetHandle}">${link.anchorText}</a>`)}
                            >
                              HTML kopieren
                            </Button>
                            <Button
                              size="slim"
                              variant="primary"
                              onClick={() => {
                                const source = products.find(p => p.handle === link.sourceHandle);
                                if (source) handleAutoLink(source, [link]);
                              }}
                              loading={isLoading}
                            >
                              Automatisch einfügen
                            </Button>
                          </InlineStack>
                        </BlockStack>
                      </div>
                    ))}
                  </BlockStack>
                </Card>
              </BlockStack>
            </div>
          )}

          {/* ─── Produktliste (kein Ergebnis) ─── */}
          {(!result?.success || result?.intent !== "analyze") && !isLoading && (
            <Card>
              <BlockStack gap="300">
                <Text variant="headingSm" as="h2">Produkte im Katalog</Text>
                <Divider />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "12px" }}>
                  {products.map(p => (
                    <div key={p.id} className="titan-card-premium" style={{ padding: "14px" }}>
                      <BlockStack gap="200">
                        {p.image ? (
                          <div style={{ width: "100%", height: "80px", borderRadius: "8px", overflow: "hidden", background: "#f8fafc" }}>
                            <img src={p.image} alt={p.imageAlt || p.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          </div>
                        ) : (
                          <div style={{ width: "100%", height: "80px", borderRadius: "8px", background: "linear-gradient(135deg, #e0e7ff, #ddd6fe)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px" }}>
                            &#128722;
                          </div>
                        )}
                        <Text variant="bodySm" fontWeight="bold" truncate>{p.title}</Text>
                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                          {p.productType && <Badge>{p.productType}</Badge>}
                          <Badge tone="info">Links: {p.linkCount}</Badge>
                        </div>
                      </BlockStack>
                    </div>
                  ))}
                </div>
              </BlockStack>
            </Card>
          )}
        </BlockStack>

        {/* ─── Preview-Modal für automatische Verlinkung ─── */}
        {previewModal && (
          <Modal
            open={!!previewModal}
            onClose={() => setPreviewModal(null)}
            title="Vorschau: Aktualisierte Produktbeschreibung"
            primaryAction={{
              content: "Übernehmen & Speichern",
              onAction: () => handleSaveDescription(previewModal.productId, previewModal.html),
            }}
            secondaryActions={[
              {
                content: "HTML kopieren",
                onAction: () => handleCopyHtml(previewModal.html),
              },
              {
                content: "Abbrechen",
                onAction: () => setPreviewModal(null),
              },
            ]}
          >
            <Modal.Section>
              <BlockStack gap="400">
                {/* Zusammenfassung der Änderungen */}
                {previewModal.summary && (
                  <Banner tone="info" title="Änderungen">
                    {previewModal.summary}
                  </Banner>
                )}

                {/* Eingefügte Links */}
                {previewModal.insertedLinks?.length > 0 && (
                  <BlockStack gap="200">
                    <Text variant="bodySm" fontWeight="bold">Eingefügte Links:</Text>
                    {previewModal.insertedLinks.map((il, ili) => (
                      <div key={ili} style={{ background: "#f0fdf4", borderRadius: "6px", padding: "8px 12px", border: "1px solid rgba(16,185,129,0.2)" }}>
                        <Text variant="bodySm" fontWeight="semibold">{il.anchorText}</Text>
                        <Text variant="bodySm" tone="subdued">{il.context}</Text>
                      </div>
                    ))}
                  </BlockStack>
                )}

                {/* HTML-Vorschau */}
                <div>
                  <Text variant="bodySm" fontWeight="bold">Vorschau der aktualisierten Beschreibung:</Text>
                  <div style={{
                    background: "#f8fafc", borderRadius: "8px", padding: "16px",
                    border: "1px solid #e2e8f0", marginTop: "8px",
                    maxHeight: "400px", overflowY: "auto",
                    fontSize: "14px", lineHeight: "1.7",
                  }}>
                    <div dangerouslySetInnerHTML={{ __html: previewModal.html }} />
                  </div>
                </div>

                {/* Raw HTML */}
                <div>
                  <Text variant="bodySm" fontWeight="bold">HTML-Quellcode:</Text>
                  <div style={{
                    background: "#1e293b", color: "#e2e8f0", borderRadius: "8px", padding: "14px",
                    marginTop: "8px", maxHeight: "200px", overflowY: "auto",
                    fontSize: "12px", lineHeight: "1.5", fontFamily: "monospace",
                    whiteSpace: "pre-wrap", wordBreak: "break-all",
                  }}>
                    {previewModal.html}
                  </div>
                </div>
              </BlockStack>
            </Modal.Section>
          </Modal>
        )}
      </Page>
    </div>
  );
}
