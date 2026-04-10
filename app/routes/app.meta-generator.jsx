import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, Link } from "@remix-run/react";
import {
  Page, Card, Text, BlockStack, InlineStack, Button, Banner, Box, Badge, Divider, Spinner, TextField, Thumbnail,
} from "@shopify/polaris";
import { useState, useMemo, useCallback } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  try {
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

  const variables = cursor
    ? direction === "next"
      ? { first: 25, after: cursor }
      : { last: 25, before: cursor }
    : { first: 25 };

  const response = await admin.graphql(`
    query getProducts($first: Int, $last: Int, $after: String, $before: String) {
      products(first: $first, last: $last, after: $after, before: $before) {
        pageInfo {
          hasNextPage
          hasPreviousPage
          startCursor
          endCursor
        }
        nodes {
          id
          title
          description
          seo {
            title
            description
          }
          handle
          featuredImage {
            url
            altText
          }
        }
      }
    }
  `, { variables });
  const data = await response.json();
  const products = (data.data?.products?.nodes || []).map(p => ({
    id: p.id,
    numericId: p.id.replace("gid://shopify/Product/", ""),
    title: p.title,
    description: p.description || "",
    seoTitle: p.seo?.title || "",
    seoDescription: p.seo?.description || "",
    handle: p.handle,
    image: p.featuredImage?.url || null,
  }));

  const pageInfo = data.data?.products?.pageInfo || {
    hasNextPage: false,
    hasPreviousPage: false,
    startCursor: null,
    endCursor: null
  };

  return json({ products, pageInfo, shop: session.shop, bulkAllowed });
  } catch (error) {
    console.error("Meta-generator loader error:", error);
    if (error instanceof Response) throw error;
    return json({ products: [], pageInfo: {}, shop: "", bulkAllowed: false, error: error.message });
  }
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "generate") {
    const productId = formData.get("productId");
    const productTitle = formData.get("productTitle");
    const productDescription = formData.get("productDescription");
    const currentSeoTitle = formData.get("currentSeoTitle");
    const currentSeoDesc = formData.get("currentSeoDesc");

    // Limit-Check
    const { checkLimit, trackUsage, limitErrorResponse } = await import("../middleware/enforce-limits.server.js");
    const limitResult = await checkLimit(session.shop, "metagenerator");
    if (!limitResult.allowed) {
      return json(limitErrorResponse(limitResult));
    }

    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const prompt = `Du bist ein SEO-Experte für E-Commerce. Generiere optimierte Meta-Daten für dieses Shopify-Produkt.

Produkt: ${productTitle}
Beschreibung: ${productDescription || "Nicht verfügbar"}
Aktueller SEO-Titel: ${currentSeoTitle || "Nicht gesetzt"}
Aktuelle SEO-Beschreibung: ${currentSeoDesc || "Nicht gesetzt"}

STRIKTE ZEICHENLIMIT-REGELN (ABSOLUT EINHALTEN):
- Meta-Titel: EXAKT 50-60 Zeichen. NIEMALS mehr als 60 Zeichen. Zähle jedes Zeichen. Haupt-Keyword am Anfang.
- Meta-Beschreibung: EXAKT 140-155 Zeichen. NIEMALS mehr als 155 Zeichen. Zähle jedes Zeichen. Mit Call-to-Action.
- Wenn du die Limits überschreitest, ist die Antwort UNGÜLTIG.
- Optimiert für GEO (Generative Engine Optimization) und klassische Suchmaschinen
- Auf Deutsch

Generiere exakt dieses JSON-Format (keine Markdown, nur JSON):
{
  "seoTitle": "Optimierter Meta-Titel hier (max 60 Zeichen!)",
  "seoDescription": "Optimierte Meta-Beschreibung hier mit CTA (max 155 Zeichen!)",
  "reasoning": "Kurze Erklärung warum diese Meta-Daten besser sind",
  "improvements": [
    "Verbesserung 1: Was genau geändert wurde und warum",
    "Verbesserung 2: Was genau geändert wurde und warum"
  ],
  "score": 85
}`;

    try {
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          temperature: 0.3,
          responseMimeType: "application/json",
        },
      });
      const metaResult = JSON.parse(result.text);

      // Hard-truncate to enforce character limits regardless of AI output
      if (metaResult.seoTitle && metaResult.seoTitle.length > 60) {
        metaResult.seoTitle = metaResult.seoTitle.substring(0, 57).replace(/\s+\S*$/, "") + "...";
      }
      if (metaResult.seoDescription && metaResult.seoDescription.length > 155) {
        metaResult.seoDescription = metaResult.seoDescription.substring(0, 152).replace(/\s+\S*$/, "") + "...";
      }

      trackUsage(session.shop, "metagenerator");
      return json({
        success: true,
        intent: "generate",
        generated: metaResult,
        productId,
        productTitle,
        oldSeoTitle: currentSeoTitle,
        oldSeoDesc: currentSeoDesc,
      });
    } catch (e) {
      console.error("Meta generation error:", e);
      return json({ success: false, error: "Generierung fehlgeschlagen. Bitte erneut versuchen." });
    }
  }

  if (intent === "save") {
    const productId = formData.get("productId");
    const seoTitle = formData.get("seoTitle");
    const seoDescription = formData.get("seoDescription");

    try {
      const result = await admin.graphql(`
        mutation productUpdate($input: ProductInput!) {
          productUpdate(input: $input) {
            product { id }
            userErrors { field message }
          }
        }
      `, {
        variables: {
          input: {
            id: productId,
            seo: {
              title: seoTitle,
              description: seoDescription,
            },
          },
        },
      });
      const resultData = await result.json();
      const errors = resultData.data?.productUpdate?.userErrors;
      if (errors?.length > 0) {
        return json({ success: false, error: errors.map(e => e.message).join(", ") });
      }
      return json({ success: true, intent: "save", saved: true, productId });
    } catch (e) {
      console.error("Meta save error:", e);
      return json({ success: false, error: "Speichern fehlgeschlagen." });
    }
  }

  if (intent === "bulkGenerate") {
    const productsJson = formData.get("products");
    const productsList = JSON.parse(productsJson);

    // Limit-Check
    const { checkLimit, trackUsage: trackBulk, limitErrorResponse } = await import("../middleware/enforce-limits.server.js");
    const limitResult = await checkLimit(session.shop, "metagenerator");
    if (!limitResult.allowed) {
      return json(limitErrorResponse(limitResult));
    }

    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const results = [];
    for (const p of productsList) {
      try {
        const prompt = `Du bist ein SEO-Experte für E-Commerce. Generiere optimierte Meta-Daten für dieses Shopify-Produkt auf Deutsch.

Produkt: ${p.title}
Beschreibung: ${p.description || "Nicht verfügbar"}

Regeln:
- Meta-Titel: maximal 60 Zeichen, mit Haupt-Keyword am Anfang
- Meta-Beschreibung: 140-160 Zeichen, mit Call-to-Action und Haupt-Keywords

Generiere exakt dieses JSON-Format (keine Markdown, nur JSON):
{
  "seoTitle": "Optimierter Meta-Titel",
  "seoDescription": "Optimierte Meta-Beschreibung"
}`;

        const result = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: { temperature: 0.3, responseMimeType: "application/json" },
        });
        const meta = JSON.parse(result.text);
        trackBulk(session.shop, "metagenerator");
        results.push({ productId: p.id, title: p.title, ...meta, success: true });
      } catch (e) {
        results.push({ productId: p.id, title: p.title, success: false, error: e.message });
      }
    }
    return json({ success: true, intent: "bulkGenerate", bulkResults: results });
  }

  if (intent === "bulkSave") {
    const itemsJson = formData.get("items");
    const items = JSON.parse(itemsJson);
    const saved = [];
    const errors = [];

    for (const item of items) {
      try {
        await admin.graphql(`
          mutation productUpdate($input: ProductInput!) {
            productUpdate(input: $input) {
              product { id }
              userErrors { field message }
            }
          }
        `, {
          variables: {
            input: {
              id: item.productId,
              seo: {
                title: item.seoTitle,
                description: item.seoDescription,
              },
            },
          },
        });
        saved.push(item.productId);
      } catch (e) {
        errors.push({ productId: item.productId, error: e.message });
      }
    }
    return json({ success: true, intent: "bulkSave", saved, errors });
  }

  return json({ success: false });
};

/* Character count bar */
function CharCountBar({ count, min, max, label }) {
  const isOptimal = count >= min && count <= max;
  const isTooShort = count > 0 && count < min;
  const isTooLong = count > max;
  const isEmpty = count === 0;
  const pct = Math.min((count / max) * 100, 120);
  const color = isEmpty ? "#94a3b8" : isOptimal ? "#10b981" : isTooShort ? "#f59e0b" : "#ef4444";

  return (
    <div style={{ marginTop: "4px" }}>
      <InlineStack align="space-between">
        <Text variant="bodySm" tone="subdued">{label}</Text>
        <Text variant="bodySm" fontWeight="semibold" style={{ color }}>
          {count}/{max} Zeichen {isOptimal ? "✓" : isTooShort ? "(zu kurz)" : isTooLong ? "(zu lang)" : ""}
        </Text>
      </InlineStack>
      <div style={{
        height: "6px",
        background: "#f1f5f9",
        borderRadius: "100px",
        marginTop: "4px",
        overflow: "hidden",
      }}>
        <div style={{
          height: "100%",
          width: `${Math.min(pct, 100)}%`,
          background: color,
          borderRadius: "100px",
          transition: "width 0.5s ease",
        }} />
      </div>
    </div>
  );
}

/* Filter Chip */
function FilterChip({ label, active, onClick, count }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "8px 18px",
        borderRadius: "100px",
        border: active ? "2px solid var(--titan-primary, #6366f1)" : "2px solid #e2e8f0",
        background: active ? "linear-gradient(135deg, #ede9fe, #e0f2fe)" : "white",
        color: active ? "#4f46e5" : "#64748b",
        fontWeight: active ? 700 : 500,
        fontSize: "13px",
        cursor: "pointer",
        transition: "all 0.2s ease",
        whiteSpace: "nowrap",
      }}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span style={{
          background: active ? "#6366f1" : "#e2e8f0",
          color: active ? "white" : "#64748b",
          borderRadius: "100px",
          padding: "1px 8px",
          fontSize: "11px",
          fontWeight: 700,
        }}>
          {count}
        </span>
      )}
    </button>
  );
}

const getMetaStatus = (p) => {
  const hasTitle = p.seoTitle && p.seoTitle.length > 0;
  const hasDesc = p.seoDescription && p.seoDescription.length > 0;
  if (!hasTitle && !hasDesc) return { label: "Meta fehlt", tone: "critical", filter: "Meta fehlt" };
  const titleLen = p.seoTitle?.length || 0;
  const descLen = p.seoDescription?.length || 0;
  const titleOk = titleLen >= 30 && titleLen <= 60;
  const descOk = descLen >= 120 && descLen <= 160;
  if (titleOk && descOk) return { label: "Optimiert", tone: "success", filter: "Optimiert" };
  if (titleLen > 0 && titleLen < 30 || descLen > 0 && descLen < 120) return { label: "Zu kurz", tone: "warning", filter: "Zu kurz" };
  if (titleLen > 60 || descLen > 160) return { label: "Zu lang", tone: "warning", filter: "Zu lang" };
  return { label: "Teilweise", tone: "info", filter: "Alle" };
};

export default function MetaGenerator() {
  const { products, pageInfo, bulkAllowed } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("Alle");
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [bulkResults, setBulkResults] = useState(null);

  const isLoading = fetcher.state !== "idle";
  const result = fetcher.data;

  /* Counts */
  const statusCounts = useMemo(() => {
    const counts = { Alle: products.length, "Meta fehlt": 0, "Zu kurz": 0, "Zu lang": 0, Optimiert: 0 };
    products.forEach(p => {
      const s = getMetaStatus(p);
      if (counts[s.filter] !== undefined) counts[s.filter]++;
    });
    return counts;
  }, [products]);

  const filteredProducts = useMemo(() => {
    let list = products;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p => p.title.toLowerCase().includes(q));
    }
    if (activeFilter !== "Alle") {
      list = list.filter(p => getMetaStatus(p).filter === activeFilter);
    }
    return list;
  }, [products, searchQuery, activeFilter]);

  const handleGenerate = (product) => {
    setSelectedProductId(product.id);
    const formData = new FormData();
    formData.set("intent", "generate");
    formData.set("productId", product.id);
    formData.set("productTitle", product.title);
    formData.set("productDescription", product.description);
    formData.set("currentSeoTitle", product.seoTitle);
    formData.set("currentSeoDesc", product.seoDescription);
    fetcher.submit(formData, { method: "post" });
  };

  const handleSave = () => {
    if (!result?.generated || !result?.productId) return;
    const formData = new FormData();
    formData.set("intent", "save");
    formData.set("productId", result.productId);
    formData.set("seoTitle", result.generated.seoTitle);
    formData.set("seoDescription", result.generated.seoDescription);
    fetcher.submit(formData, { method: "post" });
  };

  // Helper function for controlled delay
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const handleBulkGenerate = async () => {
    const toOptimize = products.filter(p => {
      const s = getMetaStatus(p);
      return s.filter === "Meta fehlt" || s.filter === "Zu kurz" || s.filter === "Zu lang";
    });

    if (toOptimize.length === 0) {
      shopify.toast.show("Alle Produkte haben bereits optimierte Meta-Daten!");
      return;
    }

    const total = toOptimize.length;
    shopify.toast.show(`${total} Meta-Tags werden generiert...`);
    let completed = 0;

    for (let i = 0; i < toOptimize.length; i++) {
      const product = toOptimize[i];
      
      // Add delay between each request (2.5 seconds)
      if (i > 0) {
        await delay(2500);
      }
      
      handleGenerate(product);
      completed++;

      // Show progress toast every 5 products
      if (completed % 5 === 0 || completed === total) {
        shopify.toast.show(`${completed}/${total} Meta-Tags generiert...`);
      }
    }

    shopify.toast.show(`Alle ${total} Meta-Tags wurden zur Generierung eingereicht.`);
  };

  const handleBulkSave = useCallback(() => {
    if (!result?.bulkResults) return;
    const successful = result.bulkResults.filter(r => r.success);
    if (successful.length === 0) return;

    const formData = new FormData();
    formData.set("intent", "bulkSave");
    formData.set("items", JSON.stringify(successful.map(r => ({
      productId: r.productId,
      seoTitle: r.seoTitle,
      seoDescription: r.seoDescription,
    }))));
    fetcher.submit(formData, { method: "post" });
  }, [result, fetcher]);

  const currentGenerated = result?.success && result?.intent === "generate" && result?.generated ? result : null;
  const currentProduct = currentGenerated ? products.find(p => p.id === currentGenerated.productId) : null;
  const bulkData = result?.success && result?.intent === "bulkGenerate" ? result.bulkResults : null;
  const bulkSaved = result?.success && result?.intent === "bulkSave";

  return (
    <div className="titan-fade-in">
      <Page
        title="Meta Generator"
        subtitle="KI-optimierte Meta-Titel und Beschreibungen für deine Produkte"
        backAction={{ content: "Dashboard", url: "/app" }}
      >
        <BlockStack gap="600">

          {/* Hero */}
          <div className="titan-hero">
            <div className="titan-hero-content">
              <h1>Meta-Daten Optimierung</h1>
              <p>
                Generiere perfekte Meta-Titel und Beschreibungen mit KI.
                Optimale Länge, relevante Keywords und überzeugende Call-to-Actions.
              </p>
            </div>
          </div>

          {/* Paywall Banner for Bulk Operations */}
          {!bulkAllowed && (
            <Banner tone="info" title="Bulk-Automatisierung" action={{ content: "Upgrade", url: "/app/billing" }}>
              🚀 Bulk-Automatisierung ist ein Pro-Feature. Spare Stunden manueller Arbeit.
            </Banner>
          )}

          {/* Stats Overview */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px" }}>
            <div className="titan-metric-card">
              <div className="titan-metric-label">Gesamt</div>
              <div className="titan-metric-value">{products.length}</div>
            </div>
            <div className="titan-metric-card">
              <div className="titan-metric-label">Meta fehlt</div>
              <div className="titan-metric-value" style={{ color: statusCounts["Meta fehlt"] > 0 ? "#ef4444" : "#10b981" }}>
                {statusCounts["Meta fehlt"]}
              </div>
            </div>
            <div className="titan-metric-card">
              <div className="titan-metric-label">Optimiert</div>
              <div className="titan-metric-value" style={{ color: "#10b981" }}>
                {statusCounts.Optimiert}
              </div>
            </div>
            <div className="titan-metric-card">
              <div className="titan-metric-label">Bulk-Aktion</div>
              <div style={{ marginTop: "8px" }}>
                <Button
                  variant="primary"
                  onClick={handleBulkGenerate}
                  loading={isLoading && result?.intent === "bulkGenerate"}
                  disabled={isLoading || !bulkAllowed}
                  fullWidth
                  size="slim"
                >
                  Alle optimieren
                </Button>
              </div>
            </div>
          </div>

          {/* Sticky Filter Bar */}
          <div style={{
            position: "sticky",
            top: 0,
            zIndex: 100,
            background: "white",
            borderRadius: "16px",
            padding: "16px 20px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
            border: "1px solid rgba(99, 102, 241, 0.1)",
          }}>
            <BlockStack gap="300">
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                <Text variant="bodySm" fontWeight="bold" tone="subdued">Filter:</Text>
                {["Alle", "Meta fehlt", "Zu kurz", "Zu lang", "Optimiert"].map(f => (
                  <FilterChip
                    key={f}
                    label={f}
                    active={activeFilter === f}
                    onClick={() => setActiveFilter(f)}
                    count={statusCounts[f]}
                  />
                ))}
              </div>
              <TextField
                label="Produkte suchen"
                labelHidden
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Produkt suchen..."
                autoComplete="off"
              />
            </BlockStack>
          </div>

          {/* Limit Reached */}
          {result?.limitReached && (
            <Banner tone="warning" title="Tageslimit erreicht">
              <p>{result.error}</p>
              <div style={{ marginTop: "12px" }}>
                <Button variant="primary" url={result.upgradeUrl || "/app/billing"}>Jetzt upgraden</Button>
              </div>
            </Banner>
          )}

          {/* Error */}
          {result && !result.success && result.error && !result.limitReached && (
            <Banner tone="critical" title="Fehler">{result.error}</Banner>
          )}

          {/* Saved Success */}
          {result?.saved && (
            <Banner tone="success" title="Gespeichert!">
              Meta-Daten wurden erfolgreich in Shopify gespeichert.
            </Banner>
          )}

          {/* Bulk Save Success */}
          {bulkSaved && (
            <Banner tone="success" title="Bulk-Speicherung abgeschlossen!">
              {result.saved?.length || 0} Produkte wurden erfolgreich aktualisiert.
              {result.errors?.length > 0 && ` ${result.errors.length} Fehler aufgetreten.`}
            </Banner>
          )}

          {/* Bulk Results */}
          {bulkData && (
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <Text variant="headingSm" as="h2">Bulk-Ergebnisse</Text>
                    <Badge tone="success">{bulkData.filter(r => r.success).length} generiert</Badge>
                    {bulkData.filter(r => !r.success).length > 0 && (
                      <Badge tone="critical">{bulkData.filter(r => !r.success).length} fehlgeschlagen</Badge>
                    )}
                  </InlineStack>
                  <Button
                    variant="primary"
                    onClick={handleBulkSave}
                    loading={isLoading}
                    disabled={isLoading || bulkData.filter(r => r.success).length === 0}
                  >
                    Alle in Shopify speichern
                  </Button>
                </InlineStack>
                <Divider />
                {bulkData.filter(r => r.success).map((r, i) => (
                  <div key={i} className="titan-card-premium" style={{ padding: "14px" }}>
                    <BlockStack gap="200">
                      <Text variant="bodyMd" fontWeight="bold">{r.title}</Text>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                        <Box>
                          <Text variant="bodySm" fontWeight="semibold" tone="subdued">Meta-Titel:</Text>
                          <Text variant="bodySm">{r.seoTitle}</Text>
                          <CharCountBar count={r.seoTitle?.length || 0} min={30} max={60} label="Titel" />
                        </Box>
                        <Box>
                          <Text variant="bodySm" fontWeight="semibold" tone="subdued">Meta-Beschreibung:</Text>
                          <Text variant="bodySm">{r.seoDescription}</Text>
                          <CharCountBar count={r.seoDescription?.length || 0} min={120} max={160} label="Beschreibung" />
                        </Box>
                      </div>
                    </BlockStack>
                  </div>
                ))}
              </BlockStack>
            </Card>
          )}

          {/* Loading */}
          {isLoading && (
            <Card>
              <div style={{ textAlign: "center", padding: "48px 0" }}>
                <Spinner size="large" />
                <div style={{ marginTop: "16px" }}>
                  <Text variant="bodyMd" tone="subdued">
                    KI generiert optimierte Meta-Daten...
                  </Text>
                </div>
              </div>
            </Card>
          )}

          {/* Single Product Generated Result — Before/After */}
          {currentGenerated && !result?.saved && (
            <div className="titan-fade-in">
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="200" blockAlign="center">
                      <Text variant="headingSm" as="h2">{currentGenerated.productTitle}</Text>
                      {currentGenerated.generated.score && (
                        <div className={`titan-score-ring ${currentGenerated.generated.score >= 70 ? "excellent" : currentGenerated.generated.score >= 40 ? "good" : "poor"}`}
                          style={{ width: "40px", height: "40px", fontSize: "13px" }}>
                          {currentGenerated.generated.score}
                        </div>
                      )}
                    </InlineStack>
                    <InlineStack gap="200">
                      <Button variant="primary" onClick={handleSave} loading={isLoading}>
                        Sofort speichern
                      </Button>
                      {currentProduct && (
                        <Link to={`/app/products/${currentProduct.numericId}`}>
                          <Button>Produkt bearbeiten</Button>
                        </Link>
                      )}
                    </InlineStack>
                  </InlineStack>
                  <Divider />

                  {/* Before/After Comparison */}
                  <div className="titan-compare-grid">
                    <div className="titan-compare-before">
                      <div className="titan-compare-label">Vorher</div>
                      <div style={{ marginBottom: "16px" }}>
                        <Text variant="bodySm" fontWeight="semibold" tone="subdued">Meta-Titel</Text>
                        <Text variant="bodyMd">{currentGenerated.oldSeoTitle || "— Nicht gesetzt"}</Text>
                        <CharCountBar count={currentGenerated.oldSeoTitle?.length || 0} min={30} max={60} label="Titel" />
                      </div>
                      <div>
                        <Text variant="bodySm" fontWeight="semibold" tone="subdued">Meta-Beschreibung</Text>
                        <Text variant="bodyMd">{currentGenerated.oldSeoDesc || "— Nicht gesetzt"}</Text>
                        <CharCountBar count={currentGenerated.oldSeoDesc?.length || 0} min={120} max={160} label="Beschreibung" />
                      </div>
                    </div>
                    <div className="titan-compare-after">
                      <div className="titan-compare-label">Nachher (KI-optimiert)</div>
                      <div style={{ marginBottom: "16px" }}>
                        <Text variant="bodySm" fontWeight="semibold" tone="subdued">Meta-Titel</Text>
                        <Text variant="bodyMd" fontWeight="semibold">{currentGenerated.generated.seoTitle}</Text>
                        <CharCountBar count={currentGenerated.generated.seoTitle?.length || 0} min={30} max={60} label="Titel" />
                      </div>
                      <div>
                        <Text variant="bodySm" fontWeight="semibold" tone="subdued">Meta-Beschreibung</Text>
                        <Text variant="bodyMd" fontWeight="semibold">{currentGenerated.generated.seoDescription}</Text>
                        <CharCountBar count={currentGenerated.generated.seoDescription?.length || 0} min={120} max={160} label="Beschreibung" />
                      </div>
                    </div>
                  </div>

                  {/* Reasoning */}
                  {currentGenerated.generated.reasoning && (
                    <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                      <BlockStack gap="200">
                        <Text variant="bodySm" fontWeight="semibold" tone="subdued">KI-Erklärung:</Text>
                        <Text variant="bodyMd">{currentGenerated.generated.reasoning}</Text>
                      </BlockStack>
                    </Box>
                  )}

                  {/* Improvements */}
                  {currentGenerated.generated.improvements?.length > 0 && (
                    <BlockStack gap="200">
                      <Text variant="bodySm" fontWeight="semibold" tone="subdued">Verbesserungen im Detail:</Text>
                      {currentGenerated.generated.improvements.map((imp, i) => (
                        <div key={i} style={{
                          padding: "8px 12px",
                          background: "#f0fdf4",
                          borderRadius: "8px",
                          borderLeft: "3px solid #10b981",
                        }}>
                          <Text variant="bodySm">{imp}</Text>
                        </div>
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>
            </div>
          )}

          {/* Product Grid */}
          <BlockStack gap="300">
            <Text variant="headingSm" as="h2">
              Produkte ({filteredProducts.length})
            </Text>
            <div className="titan-feature-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
              {filteredProducts.map(product => {
                const status = getMetaStatus(product);
                const isSelected = selectedProductId === product.id;
                const titleLen = product.seoTitle?.length || 0;
                const descLen = product.seoDescription?.length || 0;

                return (
                  <div
                    key={product.id}
                    className="titan-feature-card"
                    style={{
                      padding: "0",
                      overflow: "hidden",
                      border: isSelected ? "2px solid #6366f1" : undefined,
                    }}
                  >
                    {/* Card Header with Image */}
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "14px 16px",
                      borderBottom: "1px solid #f1f5f9",
                      background: "#fafbfc",
                    }}>
                      <Thumbnail
                        source={product.image || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png"}
                        alt={product.title}
                        size="small"
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text variant="bodyMd" fontWeight="bold">{product.title}</Text>
                      </div>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </div>

                    {/* Meta Info */}
                    <div style={{ padding: "14px 16px" }}>
                      <BlockStack gap="300">
                        {/* SEO Title */}
                        <Box>
                          <InlineStack align="space-between">
                            <Text variant="bodySm" fontWeight="semibold" tone="subdued">Meta-Titel</Text>
                            {!product.seoTitle && <Badge tone="critical">Fehlt</Badge>}
                          </InlineStack>
                          {product.seoTitle ? (
                            <>
                              <Text variant="bodySm">{product.seoTitle}</Text>
                              <CharCountBar count={titleLen} min={30} max={60} label="" />
                            </>
                          ) : (
                            <Text variant="bodySm" tone="subdued">— Nicht gesetzt</Text>
                          )}
                        </Box>

                        {/* SEO Description */}
                        <Box>
                          <InlineStack align="space-between">
                            <Text variant="bodySm" fontWeight="semibold" tone="subdued">Meta-Beschreibung</Text>
                            {!product.seoDescription && <Badge tone="critical">Fehlt</Badge>}
                          </InlineStack>
                          {product.seoDescription ? (
                            <>
                              <Text variant="bodySm">
                                {product.seoDescription.substring(0, 80)}
                                {product.seoDescription.length > 80 ? "..." : ""}
                              </Text>
                              <CharCountBar count={descLen} min={120} max={160} label="" />
                            </>
                          ) : (
                            <Text variant="bodySm" tone="subdued">— Nicht gesetzt</Text>
                          )}
                        </Box>

                        {/* Action Button */}
                        <InlineStack align="end">
                          <Button
                            variant="primary"
                            size="slim"
                            onClick={() => handleGenerate(product)}
                            loading={isLoading && selectedProductId === product.id}
                            disabled={isLoading}
                          >
                            Optimieren
                          </Button>
                        </InlineStack>
                      </BlockStack>
                    </div>
                  </div>
                );
              })}
            </div>
          </BlockStack>

        </BlockStack>

      {/* Pagination */}
      {(pageInfo.hasPreviousPage || pageInfo.hasNextPage) && (
        <BlockStack gap="300" align="center">
          <InlineStack gap="300" blockAlign="center">
            {pageInfo.hasPreviousPage && (
              <Button 
                url={`/app/meta-generator?cursor=${pageInfo.startCursor}&direction=prev`}
              >
                ← Vorherige Seite
              </Button>
            )}
            <Text variant="bodySm" as="span" tone="subdued">
              Seite
            </Text>
            {pageInfo.hasNextPage && (
              <Button 
                url={`/app/meta-generator?cursor=${pageInfo.endCursor}&direction=next`}
              >
                Nächste Seite →
              </Button>
            )}
          </InlineStack>
        </BlockStack>
      )}
    </Page>
    </div>
  );
}
