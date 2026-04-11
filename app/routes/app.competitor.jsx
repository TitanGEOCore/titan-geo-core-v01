import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import {
  Page, Card, Text, BlockStack, InlineStack, TextField, Button,
  Banner, Box, Badge, Divider, Spinner, Modal,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useState, useCallback, useEffect, useRef } from "react";
import { authenticate } from "../shopify.server";

/* ─── Loader: Produkte mit Bildern laden (mit Pagination) ─── */
export const loader = async ({ request }) => {
  try {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const direction = url.searchParams.get("direction") || "next";

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
          handle
          description
          descriptionHtml
          featuredImage { url altText }
          seo { title description }
          metafield(namespace: "custom", key: "geo_keywords") {
            value
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
    handle: p.handle,
    description: p.description || "",
    descriptionHtml: p.descriptionHtml || "",
    image: p.featuredImage?.url || null,
    imageAlt: p.featuredImage?.altText || "",
    seoTitle: p.seo?.title || "",
    seoDescription: p.seo?.description || "",
    geoKeywords: p.metafield?.value ? JSON.parse(p.metafield.value) : null,
  }));

  const pageInfo = data.data?.products?.pageInfo || {
    hasNextPage: false,
    hasPreviousPage: false,
    startCursor: null,
    endCursor: null
  };

  return json({ products, pageInfo, shop: session.shop });
  } catch (error) {
    console.error("Competitor loader error:", error);
    if (error instanceof Response) throw error;
    return json({ products: [], pageInfo: {}, shop: "", error: error.message });
  }
};

/* ─── Action: Analyse durchführen ─── */
export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "analyze") {
    const url = formData.get("url");
    const productId = formData.get("productId");
    const productTitle = formData.get("productTitle");
    const productDescription = formData.get("productDescription");
    const productSeoTitle = formData.get("productSeoTitle");
    const productSeoDesc = formData.get("productSeoDesc");

    // Limit-Check
    const { checkLimit, trackUsage, limitErrorResponse } = await import("../middleware/enforce-limits.server.js");
    const limitResult = await checkLimit(session.shop, "competitor");
    if (!limitResult.allowed) {
      return json(limitErrorResponse(limitResult));
    }

    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    try {
      const prompt = `Du bist ein GEO (Generative Engine Optimization) und SEO-Experte für den deutschen E-Commerce.

Analysiere die folgende Wettbewerber-URL im Vergleich zu meinem Produkt und liefere eine detaillierte, umsetzbare Analyse.

Wettbewerber-URL: ${url}

MEIN PRODUKT:
- Titel: ${productTitle || "Nicht angegeben"}
- Beschreibung: ${productDescription ? productDescription.substring(0, 500) : "Keine Beschreibung"}
- SEO-Titel: ${productSeoTitle || "Nicht gesetzt"}
- SEO-Beschreibung: ${productSeoDesc || "Nicht gesetzt"}

WICHTIG: Jede Empfehlung muss KONKRET und SOFORT UMSETZBAR sein. Generiere für jede Maßnahme den KOMPLETTEN fertigen Text.

Erstelle exakt dieses JSON-Format (keine Markdown, nur JSON):
{
  "overview": "2-3 Sätze Zusammenfassung",
  "estimatedGeoScore": 65,
  "comparison": {
    "content": {
      "myScore": 45,
      "competitorScore": 72,
      "verdict": "competitor_better",
      "myStrengths": ["Was mein Produkt gut macht"],
      "competitorStrengths": ["Was der Wettbewerber besser macht"],
      "differences": ["Konkreter Unterschied 1", "Konkreter Unterschied 2"]
    },
    "seo": {
      "myScore": 50,
      "competitorScore": 68,
      "verdict": "competitor_better",
      "myStrengths": ["Meine SEO-Stärke"],
      "competitorStrengths": ["Wettbewerber SEO-Stärke"],
      "differences": ["SEO-Unterschied 1"]
    },
    "keywords": {
      "myScore": 40,
      "competitorScore": 75,
      "verdict": "competitor_better",
      "myStrengths": ["Meine Keyword-Stärke"],
      "competitorStrengths": ["Wettbewerber Keyword-Stärke"],
      "differences": ["Keyword-Unterschied 1"]
    },
    "structure": {
      "myScore": 55,
      "competitorScore": 70,
      "verdict": "competitor_better",
      "myStrengths": ["Meine Struktur-Stärke"],
      "competitorStrengths": ["Wettbewerber Struktur-Stärke"],
      "differences": ["Struktur-Unterschied 1"]
    }
  },
  "strengths": [
    {
      "title": "Stärke-Titel",
      "description": "Detaillierte Beschreibung",
      "category": "content|seo|keywords|structure"
    }
  ],
  "weaknesses": [
    {
      "title": "Schwäche-Titel",
      "description": "Was fehlt oder schlecht ist",
      "action": "Was du ändern solltest",
      "priority": "high|medium|low",
      "category": "content|seo|keywords|structure"
    }
  ],
  "recommendedKeywords": [
    {
      "keyword": "Keyword",
      "volume": "high|medium|low",
      "placements": [
        {
          "where": "title|description|meta_title|meta_description|h1|alt_text|blog",
          "exampleSentence": "Kompletter Beispielsatz mit dem Keyword natürlich eingebaut"
        }
      ]
    }
  ],
  "actionPlan": [
    {
      "step": 1,
      "title": "Maßnahme-Titel",
      "description": "Beschreibung",
      "priority": "high|medium|low",
      "impact": "high|medium|low",
      "category": "content|seo|keywords|structure",
      "generatedContent": {
        "type": "product_description|meta_title|meta_description|blog_post",
        "content": "KOMPLETTER fertiger Text, der direkt übernommen werden kann. Bei product_description: vollständige HTML-Beschreibung. Bei meta_title: fertiger Meta-Titel. Bei meta_description: fertige Meta-Beschreibung. Bei blog_post: kompletter Blog-Beitrag mit HTML."
      }
    }
  ]
}

Generiere mindestens 3 Stärken, 4 Schwächen, 6 Keywords (je mit 2-3 Placements), 5 Maßnahmen mit KOMPLETTEM generiertem Content. Alle Texte auf Deutsch mit korrekten Umlauten.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: { temperature: 0.4, responseMimeType: "application/json" },
      });

      const result = JSON.parse(response.text);
      trackUsage(session.shop, "competitor");
      return json({
        success: true,
        analysis: result,
        url,
        productId,
        productTitle,
        analyzedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Competitor analysis error:", err);
      return json({ success: false, error: `Analyse fehlgeschlagen: ${err.message}` });
    }
  }

  // Inject gap keywords from competitor analysis
  if (intent === "inject_gap_keywords") {
    const { admin, session } = await authenticate.admin(request);
    const productId = formData.get("productId");
    const productTitle = formData.get("productTitle");

    // Limit-Check
    const { checkLimit, trackUsage, limitErrorResponse } = await import("../middleware/enforce-limits.server.js");
    const limitResult = await checkLimit(session.shop, "competitor");
    if (!limitResult.allowed) {
      return json(limitErrorResponse(limitResult));
    }

    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const prompt = `Analysiere das Produkt "${productTitle}". Nenne die 20 wichtigsten SEO-Keywords der stärksten Konkurrenten. Antworte ausschließlich mit einem JSON-Array von Strings.`;

    try {
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: { temperature: 0.3, responseMimeType: "application/json" },
      });

      const keywords = JSON.parse(result.text);
      
      if (!Array.isArray(keywords)) {
        return json({ success: false, error: "Ungültiges Keyword-Format" });
      }

      // Save keywords to metafield
      const metafieldMutation = await admin.graphql(
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
                key: "geo_keywords",
                type: "json",
                value: JSON.stringify(keywords),
              },
            ],
          },
        }
      );

      const metafieldResult = await metafieldMutation.json();
      const metafieldErrors = metafieldResult.data?.metafieldsSet?.userErrors || [];

      if (metafieldErrors.length > 0) {
        return json({ success: false, error: metafieldErrors.map(e => e.message).join(", ") });
      }

      trackUsage(session.shop, "competitor");

      return json({ 
        success: true, 
        intent: "inject_gap_keywords", 
        productId, 
        keywords: keywords.slice(0, 5) // Return first 5 for display
      });
    } catch (err) {
      console.error("Inject gap keywords error:", err);
      return json({ success: false, error: `Keyword-Injektion fehlgeschlagen: ${err.message}` });
    }
  }

  return json({ success: false });
};

/* ─── Hilfsfunktionen ─── */
const STORAGE_KEY = "titan_competitor_analyses";

function loadSavedAnalyses() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

function saveAnalysis(entry) {
  try {
    const existing = loadSavedAnalyses();
    const updated = [entry, ...existing].slice(0, 20);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch { return []; }
}

function verdictColor(verdict) {
  if (verdict === "my_better") return "#09090b";
  if (verdict === "competitor_better") return "#a1a1aa";
  return "#3f3f46";
}

function verdictLabel(verdict) {
  if (verdict === "my_better") return "Du bist besser";
  if (verdict === "competitor_better") return "Wettbewerber ist besser";
  return "Gleichauf";
}

function verdictTone(verdict) {
  if (verdict === "my_better") return "success";
  if (verdict === "competitor_better") return "critical";
  return "warning";
}

function categoryLabel(cat) {
  const map = { content: "Content", seo: "SEO", keywords: "Keywords", structure: "Struktur" };
  return map[cat] || cat;
}

function priorityBadge(p) {
  if (p === "high") return <Badge tone="critical">Hohe Priorität</Badge>;
  if (p === "medium") return <Badge tone="warning">Mittlere Priorität</Badge>;
  return <Badge tone="info">Niedrige Priorität</Badge>;
}

/* ─── Filter-Chips ─── */
const FILTERS = [
  { key: "alle", label: "Alle" },
  { key: "strengths", label: "Stärken" },
  { key: "weaknesses", label: "Schwächen" },
  { key: "keywords", label: "Keywords" },
  { key: "actions", label: "Maßnahmen" },
];

/* ─── ScoreRing ─── */
function ScoreRing({ score, size = 64 }) {
  const cls = score >= 70 ? "excellent" : score >= 40 ? "good" : "poor";
  return (
    <div className={`titan-score-ring ${cls}`} style={size !== 64 ? { width: size, height: size, fontSize: Math.round(size * 0.28) } : undefined}>
      {score}
    </div>
  );
}

/* ─── ComparisonBar ─── */
function ComparisonBar({ label, myScore, competitorScore, verdict }) {
  return (
    <div className="titan-card-premium" style={{ padding: "16px", borderLeft: `4px solid ${verdictColor(verdict)}` }}>
      <BlockStack gap="200">
        <InlineStack align="space-between" blockAlign="center">
          <Text variant="bodyMd" fontWeight="bold">{label}</Text>
          <Badge tone={verdictTone(verdict)}>{verdictLabel(verdict)}</Badge>
        </InlineStack>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "11px", color: "#71717a", marginBottom: "4px" }}>Dein Shop: {myScore}/100</div>
            <div className="titan-progress-container">
              <div className="titan-progress-bar" style={{ width: `${myScore}%`, background: "#09090b" }} />
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "11px", color: "#71717a", marginBottom: "4px" }}>Wettbewerber: {competitorScore}/100</div>
            <div className="titan-progress-container">
              <div className="titan-progress-bar" style={{ width: `${competitorScore}%`, background: "#a1a1aa" }} />
            </div>
          </div>
        </div>
      </BlockStack>
    </div>
  );
}

/* ─── Hauptkomponente ─── */
export default function Competitor() {
  const { products } = useLoaderData();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const shopify = useAppBridge();

  const [url, setUrl] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [activeFilter, setActiveFilter] = useState("alle");
  const [savedAnalyses, setSavedAnalyses] = useState([]);
  const [showSaved, setShowSaved] = useState(false);
  const [contentModal, setContentModal] = useState(null);
  const lastAnalyzedRef = useRef(null);

  // Gespeicherte Analysen laden
  useEffect(() => {
    setSavedAnalyses(loadSavedAnalyses());
  }, []);

  const isLoading = fetcher.state !== "idle";
  const analysis = fetcher.data?.analysis;

  // Analyse speichern wenn neues Ergebnis
  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.analysis && fetcher.data?.analyzedAt && lastAnalyzedRef.current !== fetcher.data.analyzedAt) {
      lastAnalyzedRef.current = fetcher.data.analyzedAt;
      const entry = {
        url: fetcher.data.url,
        productId: fetcher.data.productId,
        productTitle: fetcher.data.productTitle,
        score: fetcher.data.analysis.estimatedGeoScore,
        analyzedAt: fetcher.data.analyzedAt,
        overview: fetcher.data.analysis.overview,
        analysis: fetcher.data.analysis,
      };
      const updated = saveAnalysis(entry);
      setSavedAnalyses(updated);
    }
  }, [fetcher.data]);

  const handleAnalyze = useCallback(() => {
    if (!url || !selectedProduct) return;
    const formData = new FormData();
    formData.set("intent", "analyze");
    formData.set("url", url);
    formData.set("productId", selectedProduct.id);
    formData.set("productTitle", selectedProduct.title);
    formData.set("productDescription", selectedProduct.description);
    formData.set("productSeoTitle", selectedProduct.seoTitle);
    formData.set("productSeoDesc", selectedProduct.seoDescription);
    fetcher.submit(formData, { method: "post" });
  }, [url, selectedProduct, fetcher]);

  const handleCopyKeywords = useCallback(() => {
    if (!analysis?.recommendedKeywords) return;
    const text = analysis.recommendedKeywords.map(k => k.keyword).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      shopify.toast.show("Keywords in die Zwischenablage kopiert!");
    });
  }, [analysis, shopify]);

  const handleApplyContent = useCallback((action) => {
    if (!action.generatedContent) return;
    setContentModal(action);
  }, []);

  const handleNavigateToProduct = useCallback(() => {
    if (!selectedProduct) return;
    navigate(`/app/products/${selectedProduct.numericId}`);
  }, [selectedProduct, navigate]);

  const handleCopyContent = useCallback((text) => {
    navigator.clipboard.writeText(text).then(() => {
      shopify.toast.show("Inhalt in die Zwischenablage kopiert!");
    });
  }, [shopify]);

  const handleReanalyze = useCallback((entry) => {
    setUrl(entry.url);
    const prod = products.find(p => p.id === entry.productId);
    if (prod) setSelectedProduct(prod);
    setShowSaved(false);
  }, [products]);

  const handleDeleteSaved = useCallback((idx) => {
    try {
      const existing = loadSavedAnalyses();
      existing.splice(idx, 1);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
      setSavedAnalyses(existing);
      shopify.toast.show("Analyse gelöscht");
    } catch {}
  }, [shopify]);

  // Bulk inject gap keywords for all products
  const handleBulkInject = useCallback(async () => {
    const productsToProcess = products.filter(p => !p.geoKeywords);
    
    if (productsToProcess.length === 0) {
      shopify.toast.show("Keine Produkte ohne Keywords gefunden.");
      return;
    }

    const total = productsToProcess.length;
    shopify.toast.show(`Starte Keyword-Injektion für ${total} Produkte...`);

    for (let i = 0; i < productsToProcess.length; i++) {
      const product = productsToProcess[i];
      
      // Add delay between requests to prevent API locks
      if (i > 0) {
        await delay(2500);
      }

      const formData = new FormData();
      formData.set("intent", "inject_gap_keywords");
      formData.set("productId", product.id);
      formData.set("productTitle", product.title);
      fetcher.submit(formData, { method: "post" });

      // Show progress toast every 5 products
      if ((i + 1) % 5 === 0 && (i + 1) < total) {
        shopify.toast.show(`${i + 1}/${total} Produkte verarbeitet...`);
      }
    }

    shopify.toast.show(`Keyword-Injektion für ${total} Produkte abgeschlossen!`);
  }, [products, fetcher, shopify]);

  // Helper function for controlled delay
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Vergleich-Kategorien
  const comparisonCategories = analysis?.comparison ? [
    { key: "content", label: "Content", data: analysis.comparison.content },
    { key: "seo", label: "SEO", data: analysis.comparison.seo },
    { key: "keywords", label: "Keywords", data: analysis.comparison.keywords },
    { key: "structure", label: "Struktur", data: analysis.comparison.structure },
  ] : [];

  return (
    <Page
      title="Wettbewerber-Analyse"
      subtitle="Analysiere die Content-Strategie deiner Konkurrenz mit KI"
      backAction={{ content: "Zurück", url: "/app" }}
    >
      <BlockStack gap="600">

        {/* ─── Hero ─── */}
        <div className="titan-hero">
          <div className="titan-hero-content">
            <h1>Wettbewerber-Analyse</h1>
            <p>
              Vergleiche dein Produkt direkt mit der Konkurrenz und erhalte sofort umsetzbare
              Empfehlungen mit komplettem, fertigem Content.
            </p>
          </div>
        </div>

        {/* ─── Gespeicherte Analysen ─── */}
        {savedAnalyses.length > 0 && (
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingSm" as="h2">Gespeicherte Analysen ({savedAnalyses.length})</Text>
                <Button variant="plain" onClick={() => setShowSaved(!showSaved)}>
                  {showSaved ? "Ausblenden" : "Alle anzeigen"}
                </Button>
              </InlineStack>
              {showSaved && (
                <>
                  <Divider />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "12px" }}>
                    {savedAnalyses.map((entry, i) => (
                      <div key={i} className="titan-card-premium" style={{ padding: "16px" }}>
                        <BlockStack gap="200">
                          <InlineStack align="space-between" blockAlign="start">
                            <BlockStack gap="100">
                              <Text variant="bodySm" fontWeight="bold" truncate>{entry.url}</Text>
                              <Text variant="bodySm" tone="subdued">
                                {entry.productTitle || "Kein Produkt"}
                              </Text>
                            </BlockStack>
                            <ScoreRing score={entry.score || 0} size={40} />
                          </InlineStack>
                          <Text variant="bodySm" tone="subdued">
                            {new Date(entry.analyzedAt).toLocaleString("de-DE")}
                          </Text>
                          <InlineStack gap="200">
                            <Button size="slim" onClick={() => handleReanalyze(entry)}>Erneut analysieren</Button>
                            <Button size="slim" tone="critical" variant="plain" onClick={() => handleDeleteSaved(i)}>Löschen</Button>
                          </InlineStack>
                        </BlockStack>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </BlockStack>
          </Card>
        )}

        {/* ─── Produkt-Auswahl als Karten ─── */}
        <Card>
          <BlockStack gap="400">
            <Text variant="headingSm" as="h2">1. Dein Produkt auswählen</Text>
            <Text variant="bodySm" tone="subdued">
              Wähle das Produkt, das du mit dem Wettbewerber vergleichen möchtest.
            </Text>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "10px", maxHeight: "320px", overflowY: "auto", padding: "4px" }}>
              {products.map(p => (
                <div
                  key={p.id}
                  className="titan-card-premium"
                  onClick={() => setSelectedProduct(p)}
                  style={{
                    padding: "12px",
                    cursor: "pointer",
                    border: selectedProduct?.id === p.id ? "2px solid #09090b" : "1px solid rgba(9, 9, 11, 0.08)",
                    background: selectedProduct?.id === p.id ? "linear-gradient(145deg, #f4f4f5 0%, #e4e4e7 100%)" : undefined,
                  }}
                >
                  <BlockStack gap="200">
                    {p.image ? (
                      <div style={{ width: "100%", height: "80px", borderRadius: "8px", overflow: "hidden", background: "#f4f4f5" }}>
                        <img src={p.image} alt={p.imageAlt || p.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </div>
                    ) : (
                      <div style={{ width: "100%", height: "80px", borderRadius: "8px", background: "linear-gradient(135deg, #e4e4e7, #e4e4e7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px", color: "#09090b" }}>
                        &#128722;
                      </div>
                    )}
                    <Text variant="bodySm" fontWeight="semibold" truncate>{p.title}</Text>
                    {selectedProduct?.id === p.id && (
                      <Badge tone="info">Ausgewählt</Badge>
                    )}
                  </BlockStack>
                </div>
              ))}
            </div>
            {selectedProduct && (
              <Banner tone="info">
                <p>Ausgewählt: <strong>{selectedProduct.title}</strong></p>
              </Banner>
            )}
            
            {/* Bulk Inject Button */}
            <div style={{ marginTop: "16px" }}>
              <Button 
                variant="primary" 
                onClick={handleBulkInject}
                disabled={products.filter(p => !p.geoKeywords).length === 0}
              >
                Gap-Keywords für alle {products.filter(p => !p.geoKeywords).length} Produkte injizieren
              </Button>
            </div>
          </BlockStack>
        </Card>

        {/* ─── URL Eingabe ─── */}
        <Card>
          <BlockStack gap="400">
            <Text variant="headingSm" as="h2">2. Wettbewerber-URL eingeben</Text>
            <TextField
              label="Wettbewerber-URL"
              value={url}
              onChange={setUrl}
              placeholder="https://www.konkurrent.de/produkt-seite"
              helpText="Die URL einer Produktseite, Kategorie oder Startseite deines Wettbewerbers"
              autoComplete="off"
            />
            <InlineStack align="end">
              <Button
                variant="primary"
                onClick={handleAnalyze}
                loading={isLoading}
                disabled={!url || !selectedProduct}
              >
                {isLoading ? "Analysiere mit KI..." : "Wettbewerber analysieren"}
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>

        {/* ─── Limit erreicht ─── */}
        {fetcher.data?.limitReached && (
          <Banner tone="warning" title="Tageslimit erreicht">
            <p>{fetcher.data.error}</p>
            <div style={{ marginTop: "12px" }}>
              <Button variant="primary" url={fetcher.data.upgradeUrl || "/app/billing"}>Jetzt upgraden</Button>
            </div>
          </Banner>
        )}

        {/* ─── Fehler ─── */}
        {fetcher.data?.error && !fetcher.data?.limitReached && (
          <Banner tone="critical" title="Fehler">
            <p>{fetcher.data.error}</p>
          </Banner>
        )}

        {/* ─── Ladeanimation ─── */}
        {isLoading && (
          <Card>
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <Spinner size="large" />
              <div style={{ marginTop: "16px" }}>
                <Text variant="bodyMd" tone="subdued">
                  Gemini KI analysiert den Wettbewerber und erstellt detaillierte Empfehlungen...
                </Text>
              </div>
            </div>
          </Card>
        )}

        {/* ─── Ergebnisse ─── */}
        {analysis && !isLoading && (
          <div className="titan-fade-in">
            <BlockStack gap="500">

              {/* ── Übersicht + Score ── */}
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingSm" as="h2">Analyse-Ergebnis</Text>
                    <ScoreRing score={analysis.estimatedGeoScore} />
                  </InlineStack>
                  <Text variant="bodyMd">{analysis.overview}</Text>
                </BlockStack>
              </Card>

              {/* ── Filter-Chips ── */}
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {FILTERS.map(f => (
                  <div
                    key={f.key}
                    onClick={() => setActiveFilter(f.key)}
                    className="titan-card-premium"
                    style={{
                      padding: "8px 18px",
                      cursor: "pointer",
                      background: activeFilter === f.key ? "linear-gradient(135deg, #09090b, #3f3f46)" : undefined,
                      color: activeFilter === f.key ? "white" : "#52525b",
                      fontWeight: 600,
                      fontSize: "13px",
                      borderRadius: "100px",
                      transition: "all 0.2s ease",
                      userSelect: "none",
                    }}
                  >
                    {f.label}
                  </div>
                ))}
              </div>

              {/* ── Vergleichsansicht ── */}
              {(activeFilter === "alle" || activeFilter === "strengths" || activeFilter === "weaknesses") && analysis.comparison && (
                <Card>
                  <BlockStack gap="400">
                    <Text variant="headingSm" as="h2">Direktvergleich: Dein Shop vs. Wettbewerber</Text>
                    <Divider />
                    {comparisonCategories.map(cat => (
                      <div key={cat.key}>
                        <ComparisonBar
                          label={cat.label}
                          myScore={cat.data?.myScore || 0}
                          competitorScore={cat.data?.competitorScore || 0}
                          verdict={cat.data?.verdict || "equal"}
                        />
                        {cat.data?.differences?.length > 0 && (
                          <div style={{ padding: "8px 16px", marginTop: "4px" }}>
                            <BlockStack gap="100">
                              {cat.data.differences.map((diff, di) => (
                                <div key={di} style={{ display: "flex", gap: "8px", alignItems: "start", fontSize: "13px", color: "#52525b" }}>
                                  <span style={{ color: "#09090b", flexShrink: 0 }}>&#9679;</span>
                                  <span>{diff}</span>
                                </div>
                              ))}
                            </BlockStack>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Detaillierter Vergleich */}
                    <Divider />
                    <Text variant="headingSm" as="h3">Detaillierter Vergleich</Text>
                    {comparisonCategories.map(cat => (
                      <div key={`detail-${cat.key}`} style={{ marginBottom: "12px" }}>
                        <Text variant="bodySm" fontWeight="bold" as="h4">{cat.label}</Text>
                        <div className="titan-compare-grid" style={{ marginTop: "8px" }}>
                          <div className="titan-compare-after">
                            <div className="titan-compare-label" style={{ color: "#18181b" }}>Dein Shop</div>
                            <BlockStack gap="100">
                              {(cat.data?.myStrengths || []).map((s, si) => (
                                <div key={si} style={{ fontSize: "13px", color: "#18181b", display: "flex", gap: "6px" }}>
                                  <span>&#10003;</span><span>{s}</span>
                                </div>
                              ))}
                            </BlockStack>
                          </div>
                          <div className="titan-compare-before">
                            <div className="titan-compare-label" style={{ color: "#a1a1aa" }}>Wettbewerber</div>
                            <BlockStack gap="100">
                              {(cat.data?.competitorStrengths || []).map((s, si) => (
                                <div key={si} style={{ fontSize: "13px", color: "#52525b", display: "flex", gap: "6px" }}>
                                  <span>&#10003;</span><span>{s}</span>
                                </div>
                              ))}
                            </BlockStack>
                          </div>
                        </div>
                      </div>
                    ))}
                  </BlockStack>
                </Card>
              )}

              {/* ── Stärken ── */}
              {(activeFilter === "alle" || activeFilter === "strengths") && analysis.strengths?.length > 0 && (
                <Card>
                  <BlockStack gap="300">
                    <InlineStack gap="200" blockAlign="center">
                      <Text variant="headingSm" as="h2">Deine Stärken</Text>
                      <Badge tone="success">{analysis.strengths.length}</Badge>
                    </InlineStack>
                    <Divider />
                    {analysis.strengths.map((s, i) => (
                      <div key={i} className="titan-card-premium" style={{ padding: "16px", borderLeft: "4px solid #09090b" }}>
                        <BlockStack gap="200">
                          <InlineStack align="space-between" blockAlign="center">
                            <Text variant="bodyMd" fontWeight="bold">{s.title}</Text>
                            <Badge tone="info">{categoryLabel(s.category)}</Badge>
                          </InlineStack>
                          <Text variant="bodySm">{s.description}</Text>
                        </BlockStack>
                      </div>
                    ))}
                  </BlockStack>
                </Card>
              )}

              {/* ── Schwächen ── */}
              {(activeFilter === "alle" || activeFilter === "weaknesses") && analysis.weaknesses?.length > 0 && (
                <Card>
                  <BlockStack gap="300">
                    <InlineStack gap="200" blockAlign="center">
                      <Text variant="headingSm" as="h2">Schwächen & Chancen</Text>
                      <Badge tone="warning">{analysis.weaknesses.length}</Badge>
                    </InlineStack>
                    <Divider />
                    {analysis.weaknesses.map((w, i) => (
                      <div key={i} className="titan-card-premium" style={{ padding: "16px", borderLeft: "4px solid #3f3f46" }}>
                        <BlockStack gap="300">
                          <InlineStack align="space-between" blockAlign="center">
                            <Text variant="bodyMd" fontWeight="bold">{w.title}</Text>
                            <InlineStack gap="200">
                              <Badge tone="info">{categoryLabel(w.category)}</Badge>
                              {priorityBadge(w.priority)}
                            </InlineStack>
                          </InlineStack>
                          <Text variant="bodySm">{w.description}</Text>
                          <Box background="bg-surface-warning" padding="200" borderRadius="200">
                            <Text variant="bodySm" fontWeight="semibold">Empfohlene Maßnahme:</Text>
                            <Text variant="bodySm">{w.action}</Text>
                          </Box>
                        </BlockStack>
                      </div>
                    ))}
                  </BlockStack>
                </Card>
              )}

              {/* ── Keywords mit Platzierungs-Empfehlungen ── */}
              {(activeFilter === "alle" || activeFilter === "keywords") && analysis.recommendedKeywords?.length > 0 && (
                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="headingSm" as="h2">Empfohlene Keywords</Text>
                        <Badge tone="success">{analysis.recommendedKeywords.length}</Badge>
                      </InlineStack>
                      <Button onClick={handleCopyKeywords} size="slim">Alle kopieren</Button>
                    </InlineStack>
                    <Divider />
                    {analysis.recommendedKeywords.map((kw, i) => (
                      <div key={i} className="titan-card-premium" style={{ padding: "16px" }}>
                        <BlockStack gap="300">
                          <InlineStack align="space-between" blockAlign="center">
                            <Text variant="bodyMd" fontWeight="bold">{kw.keyword}</Text>
                            {kw.volume === "high" ? <Badge tone="success">Hohes Suchvolumen</Badge> :
                             kw.volume === "medium" ? <Badge tone="warning">Mittleres Suchvolumen</Badge> :
                             <Badge tone="info">Niedriges Suchvolumen</Badge>}
                          </InlineStack>
                          <Text variant="bodySm" fontWeight="semibold">Wo einsetzen:</Text>
                          {(kw.placements || []).map((pl, pi) => {
                            const whereLabels = {
                              title: "Produkt-Titel",
                              description: "Beschreibung",
                              meta_title: "Meta-Titel",
                              meta_description: "Meta-Beschreibung",
                              h1: "H1-Überschrift",
                              alt_text: "Bild-Alt-Text",
                              blog: "Blog-Beitrag",
                            };
                            return (
                              <div key={pi} style={{ background: "#f4f4f5", borderRadius: "8px", padding: "10px 14px" }}>
                                <InlineStack gap="200" blockAlign="center">
                                  <Badge>{whereLabels[pl.where] || pl.where}</Badge>
                                </InlineStack>
                                <div style={{ marginTop: "6px", fontSize: "13px", color: "#52525b", fontStyle: "italic", lineHeight: "1.5" }}>
                                  &bdquo;{pl.exampleSentence}&ldquo;
                                </div>
                              </div>
                            );
                          })}
                        </BlockStack>
                      </div>
                    ))}
                  </BlockStack>
                </Card>
              )}

              {/* ── Maßnahmen mit "Jetzt umsetzen" ── */}
              {(activeFilter === "alle" || activeFilter === "actions") && analysis.actionPlan?.length > 0 && (
                <Card>
                  <BlockStack gap="300">
                    <Text variant="headingSm" as="h2">Konkrete Maßnahmen mit fertigem Content</Text>
                    <Text variant="bodySm" tone="subdued">
                      Jede Maßnahme enthält komplett generierten Text, den du direkt übernehmen kannst.
                    </Text>
                    <Divider />
                    {analysis.actionPlan.map((action, i) => (
                      <div key={i} className="titan-card-premium" style={{ padding: "16px" }}>
                        <BlockStack gap="300">
                          <InlineStack align="space-between" blockAlign="center">
                            <InlineStack gap="200" blockAlign="center">
                              <div style={{
                                width: "32px", height: "32px", fontSize: "14px",
                                background: "linear-gradient(135deg, #09090b, #3f3f46)",
                                color: "white", display: "flex", alignItems: "center",
                                justifyContent: "center", borderRadius: "50%", fontWeight: "bold",
                                minWidth: "32px",
                              }}>
                                {action.step}
                              </div>
                              <Text variant="bodyMd" fontWeight="bold">{action.title}</Text>
                            </InlineStack>
                            <InlineStack gap="200">
                              <Badge tone="info">{categoryLabel(action.category)}</Badge>
                              {priorityBadge(action.priority)}
                            </InlineStack>
                          </InlineStack>

                          <Text variant="bodySm">{action.description}</Text>

                          {action.generatedContent && (
                            <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                              <BlockStack gap="200">
                                <InlineStack align="space-between" blockAlign="center">
                                  <Text variant="bodySm" fontWeight="semibold">
                                    Fertiger Content ({action.generatedContent.type === "product_description" ? "Produktbeschreibung" :
                                      action.generatedContent.type === "meta_title" ? "Meta-Titel" :
                                      action.generatedContent.type === "meta_description" ? "Meta-Beschreibung" :
                                      action.generatedContent.type === "blog_post" ? "Blog-Beitrag" : action.generatedContent.type}):
                                  </Text>
                                  <Button size="slim" onClick={() => handleCopyContent(action.generatedContent.content)}>
                                    Kopieren
                                  </Button>
                                </InlineStack>
                                <div style={{
                                  background: "white", borderRadius: "8px", padding: "12px",
                                  border: "1px solid #e4e4e7", maxHeight: "150px", overflowY: "auto",
                                  fontSize: "13px", lineHeight: "1.6", color: "#3f3f46",
                                  whiteSpace: "pre-wrap",
                                }}>
                                  {action.generatedContent.content}
                                </div>
                              </BlockStack>
                            </Box>
                          )}

                          <InlineStack align="end" gap="200">
                            {action.generatedContent && (
                              <Button size="slim" onClick={() => handleApplyContent(action)}>
                                Vollständig anzeigen
                              </Button>
                            )}
                            <Button
                              size="slim"
                              variant="primary"
                              onClick={handleNavigateToProduct}
                            >
                              Jetzt umsetzen
                            </Button>
                          </InlineStack>
                        </BlockStack>
                      </div>
                    ))}
                  </BlockStack>
                </Card>
              )}
            </BlockStack>
          </div>
        )}

        {/* ─── Content-Modal ─── */}
        {contentModal && (
          <Modal
            open={!!contentModal}
            onClose={() => setContentModal(null)}
            title={`Fertiger Content: ${contentModal.title}`}
            primaryAction={{
              content: "Zum Produkt navigieren",
              onAction: () => {
                setContentModal(null);
                handleNavigateToProduct();
              },
            }}
            secondaryActions={[
              {
                content: "In Zwischenablage kopieren",
                onAction: () => handleCopyContent(contentModal.generatedContent?.content || ""),
              },
              {
                content: "Schließen",
                onAction: () => setContentModal(null),
              },
            ]}
          >
            <Modal.Section>
              <BlockStack gap="400">
                <Text variant="bodySm" tone="subdued">
                  Kopiere diesen Text und füge ihn in deinem Produkt ein, oder navigiere direkt zur Produktseite.
                </Text>
                <div style={{
                  background: "#f4f4f5", borderRadius: "12px", padding: "20px",
                  border: "1px solid #e4e4e7", fontSize: "14px", lineHeight: "1.7",
                  color: "#18181b", whiteSpace: "pre-wrap", maxHeight: "400px", overflowY: "auto",
                }}>
                  {contentModal.generatedContent?.content || "Kein Content verfügbar"}
                </div>
              </BlockStack>
            </Modal.Section>
          </Modal>
        )}
      </BlockStack>
    </Page>
  );
}
