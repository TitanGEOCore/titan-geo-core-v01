import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import {
  Page, Card, Text, BlockStack, InlineStack, Button, Banner, Box, Badge, Divider, TextField, Spinner, Modal,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useState, useCallback, useEffect, useRef } from "react";
import { authenticate } from "../shopify.server";

const STORAGE_KEY = "titan_ranking_tracker";

/* ─── Loader: Produkte laden ─── */
export const loader = async ({ request }) => {
  try {
  const { admin, session } = await authenticate.admin(request);

  const response = await admin.graphql(`
    query {
      products(first: 50, sortKey: TITLE) {
        nodes {
          id
          title
          handle
          description
          featuredImage { url altText }
          seo { title description }
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
    image: p.featuredImage?.url || null,
    seoTitle: p.seo?.title || "",
    seoDescription: p.seo?.description || "",
  }));

  return json({ products, shop: session.shop });
  } catch (error) {
    console.error("Ranking-tracker loader error:", error);
    if (error instanceof Response) throw error;
    return json({ products: [], shop: "", error: error.message });
  }
};

/* ─── Action: Ranking-Analyse & Keyword-Optimierung ─── */
export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  // Limit-Check
  const { checkLimit, trackUsage, limitErrorResponse } = await import("../middleware/enforce-limits.server.js");
  const limitResult = await checkLimit(session.shop, "rankingtracker");
  if (!limitResult.allowed) {
    return json(limitErrorResponse(limitResult));
  }

  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  if (intent === "track") {
    const keywords = formData.get("keywords");
    const productsJson = formData.get("products");
    const shopDomain = session.shop;

    const prompt = `Du bist ein SEO-Ranking-Experte für den deutschen E-Commerce. Schätze die ungefähren Ranking-Positionen für einen Shopify-Shop (${shopDomain}) bei Google für folgende Keywords ein.

Keywords: ${keywords}

Zugeordnete Produkte:
${productsJson}

Berücksichtige:
- Shopify-Shops ranken typischerweise zwischen Position 10-100+ für generische Keywords
- Long-Tail Keywords haben oft bessere Positionen
- Nischen-Keywords können Top 10 erreichen
- Schätze realistisch basierend auf der Wettbewerbsintensität

Generiere exakt dieses JSON-Format (keine Markdown, nur JSON):
{
  "rankings": [
    {
      "keyword": "keyword hier",
      "estimatedPosition": 23,
      "difficulty": "high|medium|low",
      "searchVolume": "1.2K",
      "trend": "up|down|stable|new",
      "opportunity": "Beschreibung der Optimierungsmöglichkeit",
      "linkedProductTitle": "Name des zugehörigen Produkts oder null",
      "alternatives": [
        {
          "keyword": "alternatives keyword 1",
          "estimatedPosition": 12,
          "searchVolume": "800",
          "reason": "Warum dieses Keyword besser performen könnte"
        }
      ],
      "recommendation": "Wenn du [dieses Keyword] in [Produkt X] einsetzt, könntest du Position [Y] erreichen"
    }
  ],
  "overallAssessment": "Gesamteinschätzung der Ranking-Situation",
  "topOpportunity": "Bestes Keyword mit dem größten Potenzial"
}

Für jedes Keyword mindestens 5 alternative Keywords vorschlagen. Antworte auf Deutsch mit korrekten Umlauten.`;

    try {
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: { temperature: 0.4, responseMimeType: "application/json" },
      });
      const rankingResult = JSON.parse(result.text);
      trackUsage(session.shop, "rankingtracker");
      return json({ success: true, intent: "track", data: rankingResult });
    } catch (e) {
      console.error("Ranking tracker error:", e);
      return json({ success: false, error: "Tracking fehlgeschlagen. Bitte erneut versuchen." });
    }
  }

  if (intent === "generate_content") {
    const keyword = formData.get("keyword");
    const productTitle = formData.get("productTitle");
    const productDescription = formData.get("productDescription");
    const productSeoTitle = formData.get("productSeoTitle");

    const prompt = `Du bist ein GEO-Optimierungsexperte für den deutschen E-Commerce. Generiere optimierten Content, der das Keyword "${keyword}" perfekt einbaut.

Aktuelles Produkt:
- Titel: ${productTitle}
- Beschreibung: ${productDescription ? productDescription.substring(0, 500) : "Keine"}
- SEO-Titel: ${productSeoTitle || "Nicht gesetzt"}

Generiere exakt dieses JSON-Format:
{
  "optimizedTitle": "Optimierter Produkttitel mit dem Keyword natürlich eingebaut",
  "optimizedMetaTitle": "Optimierter Meta-Titel (max 60 Zeichen) mit dem Keyword",
  "optimizedMetaDescription": "Optimierte Meta-Beschreibung (max 155 Zeichen) mit dem Keyword",
  "optimizedDescription": "Komplette optimierte Produktbeschreibung in HTML mit dem Keyword an strategischen Stellen (H2, erster Absatz, letzter Absatz). Mindestens 200 Wörter.",
  "keywordDensity": "1.5%",
  "placementNotes": "Wo genau das Keyword platziert wurde und warum"
}

Auf Deutsch mit korrekten Umlauten. Das Keyword muss natürlich klingen, nicht gezwungen.`;

    try {
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: { temperature: 0.4, responseMimeType: "application/json" },
      });
      const contentResult = JSON.parse(result.text);
      trackUsage(session.shop, "rankingtracker");
      return json({ success: true, intent: "generate_content", content: contentResult, keyword });
    } catch (e) {
      console.error("Content generation error:", e);
      return json({ success: false, error: "Content-Generierung fehlgeschlagen." });
    }
  }

  return json({ success: false });
};

/* ─── Hilfsfunktionen ─── */
function loadTrackingData() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : { history: [], productKeywords: {} };
  } catch { return { history: [], productKeywords: {} }; }
}

function saveTrackingData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

function positionColor(pos) {
  if (pos <= 3) return "#10b981";
  if (pos <= 10) return "#06b6d4";
  if (pos <= 30) return "#f59e0b";
  return "#ef4444";
}

function positionLabel(pos) {
  if (pos <= 3) return "Top 3";
  if (pos <= 10) return "Top 10";
  if (pos <= 30) return "Top 30";
  return ">30";
}

function trendIcon(trend) {
  if (trend === "up") return { icon: "\u2191", color: "#10b981", label: "Steigend" };
  if (trend === "down") return { icon: "\u2193", color: "#ef4444", label: "Fallend" };
  if (trend === "new") return { icon: "\u2605", color: "#6366f1", label: "Neu" };
  return { icon: "\u2192", color: "#94a3b8", label: "Stabil" };
}

/* ─── Filter-Optionen ─── */
const POSITION_FILTERS = [
  { key: "alle", label: "Alle" },
  { key: "top3", label: "Top 3" },
  { key: "top10", label: "Top 10" },
  { key: "top30", label: "Top 30" },
  { key: "below", label: ">30" },
];

const TREND_FILTERS = [
  { key: "alle_trends", label: "Alle Trends" },
  { key: "up", label: "Steigend" },
  { key: "down", label: "Fallend" },
  { key: "stable", label: "Stabil" },
];

/* ─── Hauptkomponente ─── */
export default function RankingTracker() {
  const { products, shop } = useLoaderData();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const shopify = useAppBridge();

  const [keywords, setKeywords] = useState("");
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [trackingData, setTrackingData] = useState({ history: [], productKeywords: {} });
  const [positionFilter, setPositionFilter] = useState("alle");
  const [trendFilter, setTrendFilter] = useState("alle_trends");
  const [productFilter, setProductFilter] = useState("alle_produkte");
  const [contentModal, setContentModal] = useState(null);
  const [showAlternatives, setShowAlternatives] = useState(null);
  const lastResultRef = useRef(null);

  useEffect(() => {
    setTrackingData(loadTrackingData());
  }, []);

  const isLoading = fetcher.state !== "idle";
  const result = fetcher.data;

  // Ergebnisse speichern
  useEffect(() => {
    if (result?.success && result?.intent === "track" && result?.data && lastResultRef.current !== result) {
      lastResultRef.current = result;
      const td = loadTrackingData();
      const entry = {
        date: new Date().toISOString(),
        rankings: result.data.rankings,
        overallAssessment: result.data.overallAssessment,
      };
      td.history = [entry, ...td.history].slice(0, 30);

      // Produkt-Keyword-Zuordnung speichern
      result.data.rankings.forEach(r => {
        if (r.linkedProductTitle) {
          const prod = products.find(p => p.title === r.linkedProductTitle);
          if (prod) {
            if (!td.productKeywords[prod.id]) td.productKeywords[prod.id] = [];
            if (!td.productKeywords[prod.id].includes(r.keyword)) {
              td.productKeywords[prod.id].push(r.keyword);
            }
          }
        }
      });

      saveTrackingData(td);
      setTrackingData(td);
    }
  }, [result, products]);

  const toggleProduct = useCallback((prod) => {
    setSelectedProducts(prev => {
      const exists = prev.find(p => p.id === prod.id);
      if (exists) return prev.filter(p => p.id !== prod.id);
      return [...prev, prod];
    });
  }, []);

  const handleTrack = useCallback(() => {
    if (!keywords.trim()) return;
    const formData = new FormData();
    formData.set("intent", "track");
    formData.set("keywords", keywords);
    formData.set("products", selectedProducts.map(p => `${p.title} (${p.handle})`).join(", ") || "Keine zugeordnet");
    fetcher.submit(formData, { method: "post" });
  }, [keywords, selectedProducts, fetcher]);

  const handleGenerateContent = useCallback((keyword, product) => {
    const formData = new FormData();
    formData.set("intent", "generate_content");
    formData.set("keyword", keyword);
    formData.set("productTitle", product.title);
    formData.set("productDescription", product.description);
    formData.set("productSeoTitle", product.seoTitle);
    fetcher.submit(formData, { method: "post" });
  }, [fetcher]);

  const handleCopyContent = useCallback((text) => {
    navigator.clipboard.writeText(text).then(() => {
      shopify.toast.show("Inhalt kopiert!");
    });
  }, [shopify]);

  // Filtern der Rankings
  const rankings = result?.success && result?.intent === "track" ? result.data.rankings : [];
  const filteredRankings = rankings.filter(r => {
    if (positionFilter === "top3" && r.estimatedPosition > 3) return false;
    if (positionFilter === "top10" && r.estimatedPosition > 10) return false;
    if (positionFilter === "top30" && r.estimatedPosition > 30) return false;
    if (positionFilter === "below" && r.estimatedPosition <= 30) return false;
    if (trendFilter !== "alle_trends" && r.trend !== trendFilter) return false;
    if (productFilter !== "alle_produkte" && r.linkedProductTitle !== productFilter) return false;
    return true;
  });

  // Historische Positionen für ein Keyword
  const getHistory = (keyword) => {
    return trackingData.history
      .map(h => {
        const found = h.rankings.find(r => r.keyword === keyword);
        return found ? { date: h.date, position: found.estimatedPosition } : null;
      })
      .filter(Boolean)
      .slice(0, 10)
      .reverse();
  };

  // Content-Generierung Ergebnis
  const generatedContent = result?.success && result?.intent === "generate_content" ? result.content : null;

  useEffect(() => {
    if (generatedContent && result?.keyword) {
      setContentModal({ keyword: result.keyword, content: generatedContent });
    }
  }, [generatedContent, result]);

  // Alle verlinkten Produktnamen für Filter
  const linkedProductNames = [...new Set(rankings.map(r => r.linkedProductTitle).filter(Boolean))];

  return (
    <div className="titan-fade-in">
      <Page
        title="Ranking Tracker"
        subtitle="Verfolge deine Keyword-Positionen und optimiere gezielt"
        backAction={{ content: "Zurück", url: "/app" }}
      >
        <BlockStack gap="600">

          {/* ─── Hero ─── */}
          <div className="titan-hero">
            <div className="titan-hero-content">
              <h1>Keyword Ranking Tracker</h1>
              <p>
                Tracke deine Keywords, entdecke bessere Alternativen und generiere
                optimierten Content mit einem Klick.
              </p>
            </div>
          </div>

          {/* ─── Produkt-Zuordnung ─── */}
          <Card>
            <BlockStack gap="400">
              <Text variant="headingSm" as="h2">Produkte zuordnen (optional)</Text>
              <Text variant="bodySm" tone="subdued">
                Ordne Keywords bestimmten Produkten zu, um gezieltere Empfehlungen zu erhalten.
              </Text>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "8px", maxHeight: "240px", overflowY: "auto", padding: "4px" }}>
                {products.map(p => {
                  const isSelected = selectedProducts.some(sp => sp.id === p.id);
                  const assignedKeywords = trackingData.productKeywords[p.id] || [];
                  return (
                    <div
                      key={p.id}
                      className="titan-card-premium"
                      onClick={() => toggleProduct(p)}
                      style={{
                        padding: "10px",
                        cursor: "pointer",
                        border: isSelected ? "2px solid #6366f1" : "1px solid rgba(99, 102, 241, 0.08)",
                        background: isSelected ? "linear-gradient(145deg, #eef2ff 0%, #e0e7ff 100%)" : undefined,
                      }}
                    >
                      <BlockStack gap="100">
                        {p.image ? (
                          <div style={{ width: "100%", height: "60px", borderRadius: "6px", overflow: "hidden", background: "#f8fafc" }}>
                            <img src={p.image} alt={p.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          </div>
                        ) : (
                          <div style={{ width: "100%", height: "60px", borderRadius: "6px", background: "linear-gradient(135deg, #e0e7ff, #ddd6fe)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px" }}>
                            &#128722;
                          </div>
                        )}
                        <Text variant="bodySm" fontWeight="semibold" truncate>{p.title}</Text>
                        {assignedKeywords.length > 0 && (
                          <Text variant="bodySm" tone="subdued">{assignedKeywords.length} Keywords</Text>
                        )}
                      </BlockStack>
                    </div>
                  );
                })}
              </div>
            </BlockStack>
          </Card>

          {/* ─── Keyword-Eingabe ─── */}
          <Card>
            <BlockStack gap="400">
              <Text variant="headingSm" as="h2">Keywords tracken</Text>
              <Text variant="bodySm" tone="subdued">
                Gib die Keywords ein, die du verfolgen möchtest (kommagetrennt oder zeilenweise).
              </Text>
              <TextField
                label="Keywords"
                labelHidden
                value={keywords}
                onChange={setKeywords}
                multiline={4}
                placeholder="z.B. handgemachte seife kaufen, naturkosmetik online shop, bio shampoo deutschland"
                autoComplete="off"
              />
              <InlineStack align="end">
                <Button
                  variant="primary"
                  onClick={handleTrack}
                  disabled={!keywords.trim() || isLoading}
                  loading={isLoading}
                >
                  {isLoading ? "Analysiere Rankings..." : "Rankings prüfen"}
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>

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
                  <Text variant="bodyMd" tone="subdued">Analysiere Keywords und suche Alternativen...</Text>
                </div>
              </div>
            </Card>
          )}

          {/* ─── Ergebnisse ─── */}
          {result?.success && result?.intent === "track" && result.data && !isLoading && (
            <div className="titan-fade-in">
              <BlockStack gap="500">

                {/* Gesamtbewertung */}
                <Card>
                  <BlockStack gap="300">
                    <Text variant="headingSm" as="h2">Gesamtbewertung</Text>
                    <Text variant="bodyMd">{result.data.overallAssessment}</Text>
                    {result.data.topOpportunity && (
                      <Banner tone="info" title="Top-Chance">
                        {result.data.topOpportunity}
                      </Banner>
                    )}
                  </BlockStack>
                </Card>

                {/* Metriken */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px" }}>
                  <div className="titan-metric-card">
                    <div className="titan-metric-label">Getrackte Keywords</div>
                    <div className="titan-metric-value">{rankings.length}</div>
                  </div>
                  <div className="titan-metric-card">
                    <div className="titan-metric-label">Top 10 Keywords</div>
                    <div className="titan-metric-value">{rankings.filter(r => r.estimatedPosition <= 10).length}</div>
                  </div>
                  <div className="titan-metric-card">
                    <div className="titan-metric-label">Durchschnittsposition</div>
                    <div className="titan-metric-value">
                      {rankings.length > 0 ? Math.round(rankings.reduce((s, r) => s + r.estimatedPosition, 0) / rankings.length) : "—"}
                    </div>
                  </div>
                  <div className="titan-metric-card">
                    <div className="titan-metric-label">Analysen gesamt</div>
                    <div className="titan-metric-value">{trackingData.history.length}</div>
                  </div>
                </div>

                {/* Filter-Leiste */}
                <Card>
                  <BlockStack gap="300">
                    <Text variant="bodySm" fontWeight="semibold">Filter</Text>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {POSITION_FILTERS.map(f => (
                        <div
                          key={f.key}
                          onClick={() => setPositionFilter(f.key)}
                          className="titan-card-premium"
                          style={{
                            padding: "6px 14px",
                            cursor: "pointer",
                            background: positionFilter === f.key ? "linear-gradient(135deg, #6366f1, #06b6d4)" : undefined,
                            color: positionFilter === f.key ? "white" : "#475569",
                            fontWeight: 600, fontSize: "12px", borderRadius: "100px",
                          }}
                        >
                          {f.label}
                        </div>
                      ))}
                      <div style={{ width: "1px", background: "#e2e8f0", margin: "0 4px" }} />
                      {TREND_FILTERS.map(f => (
                        <div
                          key={f.key}
                          onClick={() => setTrendFilter(f.key)}
                          className="titan-card-premium"
                          style={{
                            padding: "6px 14px",
                            cursor: "pointer",
                            background: trendFilter === f.key ? "linear-gradient(135deg, #6366f1, #06b6d4)" : undefined,
                            color: trendFilter === f.key ? "white" : "#475569",
                            fontWeight: 600, fontSize: "12px", borderRadius: "100px",
                          }}
                        >
                          {f.label}
                        </div>
                      ))}
                    </div>
                    {linkedProductNames.length > 0 && (
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <div
                          onClick={() => setProductFilter("alle_produkte")}
                          className="titan-card-premium"
                          style={{
                            padding: "6px 14px", cursor: "pointer",
                            background: productFilter === "alle_produkte" ? "linear-gradient(135deg, #6366f1, #06b6d4)" : undefined,
                            color: productFilter === "alle_produkte" ? "white" : "#475569",
                            fontWeight: 600, fontSize: "12px", borderRadius: "100px",
                          }}
                        >
                          Alle Produkte
                        </div>
                        {linkedProductNames.map(name => (
                          <div
                            key={name}
                            onClick={() => setProductFilter(name)}
                            className="titan-card-premium"
                            style={{
                              padding: "6px 14px", cursor: "pointer",
                              background: productFilter === name ? "linear-gradient(135deg, #6366f1, #06b6d4)" : undefined,
                              color: productFilter === name ? "white" : "#475569",
                              fontWeight: 600, fontSize: "12px", borderRadius: "100px",
                            }}
                          >
                            {name}
                          </div>
                        ))}
                      </div>
                    )}
                  </BlockStack>
                </Card>

                {/* Keyword-Rankings */}
                <BlockStack gap="300">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Text variant="headingSm" as="h2">Keyword-Rankings</Text>
                    <Badge tone="info">{filteredRankings.length} von {rankings.length}</Badge>
                  </div>

                  {filteredRankings.map((r, i) => {
                    const t = trendIcon(r.trend);
                    const history = getHistory(r.keyword);
                    const linkedProd = r.linkedProductTitle ? products.find(p => p.title === r.linkedProductTitle) : null;

                    return (
                      <div key={i} className="titan-card-premium" style={{ padding: "20px" }}>
                        <BlockStack gap="300">
                          {/* Keyword Header */}
                          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <div style={{
                              width: "48px", height: "48px", borderRadius: "12px",
                              background: positionColor(r.estimatedPosition),
                              color: "white", display: "flex", alignItems: "center", justifyContent: "center",
                              fontWeight: 800, fontSize: "16px", flexShrink: 0,
                            }}>
                              #{r.estimatedPosition}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                                <span style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a" }}>{r.keyword}</span>
                                <span style={{ color: t.color, fontWeight: 700, fontSize: "14px" }} title={t.label}>{t.icon}</span>
                              </div>
                              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                                {r.difficulty === "high" ? <Badge tone="critical">Schwierigkeit: Hoch</Badge> :
                                 r.difficulty === "medium" ? <Badge tone="warning">Schwierigkeit: Mittel</Badge> :
                                 <Badge tone="success">Schwierigkeit: Niedrig</Badge>}
                                <span style={{ fontSize: "12px", color: "#94a3b8" }}>Suchvolumen: {r.searchVolume}</span>
                              </div>
                            </div>
                            {/* Positions-Balken */}
                            <div style={{ width: "100px" }}>
                              <div className="titan-progress-container">
                                <div
                                  className="titan-progress-bar"
                                  style={{
                                    width: `${Math.max(5, 100 - r.estimatedPosition)}%`,
                                    background: positionColor(r.estimatedPosition),
                                  }}
                                />
                              </div>
                              <div style={{ fontSize: "10px", color: "#94a3b8", textAlign: "center", marginTop: "2px" }}>
                                {positionLabel(r.estimatedPosition)}
                              </div>
                            </div>
                          </div>

                          {/* Verlinktes Produkt */}
                          {r.linkedProductTitle && (
                            <div style={{ background: "#f8fafc", borderRadius: "8px", padding: "8px 12px", display: "flex", alignItems: "center", gap: "8px" }}>
                              <Badge tone="info">Produkt</Badge>
                              <Text variant="bodySm" fontWeight="semibold">{r.linkedProductTitle}</Text>
                            </div>
                          )}

                          {/* Empfehlung */}
                          {r.recommendation && (
                            <Box background="bg-surface-success" padding="200" borderRadius="200">
                              <Text variant="bodySm">{r.recommendation}</Text>
                            </Box>
                          )}

                          {/* Opportunity */}
                          {r.opportunity && (
                            <Text variant="bodySm" tone="subdued">{r.opportunity}</Text>
                          )}

                          {/* Verlauf (Progress-Balken) */}
                          {history.length > 1 && (
                            <div>
                              <Text variant="bodySm" fontWeight="semibold">Positionsverlauf:</Text>
                              <div style={{ display: "flex", gap: "4px", alignItems: "end", height: "40px", marginTop: "8px" }}>
                                {history.map((h, hi) => {
                                  const barHeight = Math.max(8, Math.round((100 - h.position) / 100 * 40));
                                  return (
                                    <div
                                      key={hi}
                                      title={`${new Date(h.date).toLocaleDateString("de-DE")}: Position ${h.position}`}
                                      style={{
                                        flex: 1,
                                        height: `${barHeight}px`,
                                        background: positionColor(h.position),
                                        borderRadius: "3px 3px 0 0",
                                        minWidth: "8px",
                                        opacity: hi === history.length - 1 ? 1 : 0.6,
                                      }}
                                    />
                                  );
                                })}
                              </div>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#94a3b8", marginTop: "2px" }}>
                                <span>{new Date(history[0]?.date).toLocaleDateString("de-DE")}</span>
                                <span>{new Date(history[history.length - 1]?.date).toLocaleDateString("de-DE")}</span>
                              </div>
                            </div>
                          )}

                          {/* Aktions-Buttons */}
                          <InlineStack gap="200">
                            <Button
                              size="slim"
                              onClick={() => setShowAlternatives(showAlternatives === i ? null : i)}
                            >
                              {showAlternatives === i ? "Alternativen ausblenden" : `${r.alternatives?.length || 0} Alternativen`}
                            </Button>
                            {linkedProd && (
                              <Button
                                size="slim"
                                variant="primary"
                                onClick={() => handleGenerateContent(r.keyword, linkedProd)}
                                loading={isLoading}
                              >
                                Keyword einsetzen
                              </Button>
                            )}
                            {!linkedProd && selectedProducts.length > 0 && (
                              <Button
                                size="slim"
                                variant="primary"
                                onClick={() => handleGenerateContent(r.keyword, selectedProducts[0])}
                                loading={isLoading}
                              >
                                Keyword einsetzen
                              </Button>
                            )}
                          </InlineStack>

                          {/* Alternativen */}
                          {showAlternatives === i && r.alternatives?.length > 0 && (
                            <div style={{ marginTop: "4px" }}>
                              <Divider />
                              <BlockStack gap="200">
                                <Text variant="bodySm" fontWeight="semibold" as="h4">Alternative Keywords:</Text>
                                {r.alternatives.map((alt, ai) => (
                                  <div key={ai} style={{
                                    background: "#f8fafc", borderRadius: "8px", padding: "10px 14px",
                                    display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px",
                                    flexWrap: "wrap",
                                  }}>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontWeight: 600, fontSize: "13px", color: "#0f172a" }}>{alt.keyword}</div>
                                      <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                                        Position ~{alt.estimatedPosition} | Volumen: {alt.searchVolume}
                                      </div>
                                      <div style={{ fontSize: "12px", color: "#475569", marginTop: "4px" }}>{alt.reason}</div>
                                    </div>
                                    <Button
                                      size="slim"
                                      onClick={() => {
                                        const prod = linkedProd || (selectedProducts.length > 0 ? selectedProducts[0] : null);
                                        if (prod) handleGenerateContent(alt.keyword, prod);
                                        else shopify.toast.show("Bitte zuerst ein Produkt zuordnen");
                                      }}
                                    >
                                      Jetzt wechseln
                                    </Button>
                                  </div>
                                ))}
                              </BlockStack>
                            </div>
                          )}
                        </BlockStack>
                      </div>
                    );
                  })}
                </BlockStack>

                {/* Produkt-Keyword-Zuordnung */}
                {Object.keys(trackingData.productKeywords).length > 0 && (
                  <Card>
                    <BlockStack gap="300">
                      <Text variant="headingSm" as="h2">Produkt-Keyword-Zuordnung</Text>
                      <Divider />
                      {Object.entries(trackingData.productKeywords).map(([prodId, kws]) => {
                        const prod = products.find(p => p.id === prodId);
                        if (!prod) return null;
                        return (
                          <div key={prodId} className="titan-card-premium" style={{ padding: "14px" }}>
                            <InlineStack align="space-between" blockAlign="center">
                              <BlockStack gap="100">
                                <Text variant="bodySm" fontWeight="bold">{prod.title}</Text>
                                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                                  {kws.map((kw, ki) => (
                                    <Badge key={ki} tone="info">{kw}</Badge>
                                  ))}
                                </div>
                              </BlockStack>
                              <Button size="slim" url={`/app/products/${prod.numericId}`}>
                                Zum Produkt
                              </Button>
                            </InlineStack>
                          </div>
                        );
                      })}
                    </BlockStack>
                  </Card>
                )}
              </BlockStack>
            </div>
          )}

          {/* ─── Leerer Zustand ─── */}
          {!result?.success && !isLoading && (
            <Card>
              <div className="titan-empty-state">
                <div className="titan-empty-state-icon">&#128200;</div>
                <Text variant="headingMd" as="h2">Keyword-Rankings verfolgen</Text>
                <Box paddingBlockStart="200">
                  <Text variant="bodyMd" tone="subdued">
                    Gib deine wichtigsten Keywords ein und erhalte eine KI-basierte
                    Schätzung deiner aktuellen Ranking-Positionen bei Google
                    mit alternativen Keyword-Vorschlägen.
                  </Text>
                </Box>
              </div>
            </Card>
          )}
        </BlockStack>

        {/* ─── Content-Modal ─── */}
        {contentModal && (
          <Modal
            open={!!contentModal}
            onClose={() => setContentModal(null)}
            title={`Optimierter Content für "${contentModal.keyword}"`}
            primaryAction={{
              content: "Zum Produkt navigieren",
              onAction: () => {
                const prod = selectedProducts[0];
                if (prod) {
                  setContentModal(null);
                  navigate(`/app/products/${prod.numericId}`);
                }
              },
            }}
            secondaryActions={[
              {
                content: "Alles kopieren",
                onAction: () => {
                  const c = contentModal.content;
                  const text = `Titel: ${c.optimizedTitle}\n\nMeta-Titel: ${c.optimizedMetaTitle}\n\nMeta-Beschreibung: ${c.optimizedMetaDescription}\n\nBeschreibung:\n${c.optimizedDescription}`;
                  handleCopyContent(text);
                },
              },
            ]}
          >
            <Modal.Section>
              <BlockStack gap="400">
                <div style={{ background: "#f0fdf4", borderRadius: "8px", padding: "12px", border: "1px solid rgba(16,185,129,0.2)" }}>
                  <Text variant="bodySm" fontWeight="semibold">Keyword-Dichte: {contentModal.content.keywordDensity}</Text>
                  <Text variant="bodySm" tone="subdued">{contentModal.content.placementNotes}</Text>
                </div>

                <BlockStack gap="300">
                  <div>
                    <Text variant="bodySm" fontWeight="bold">Optimierter Titel:</Text>
                    <div style={{ background: "#f8fafc", padding: "10px", borderRadius: "6px", marginTop: "4px", fontSize: "14px" }}>
                      {contentModal.content.optimizedTitle}
                    </div>
                    <div style={{ marginTop: "4px" }}>
                      <Button size="slim" onClick={() => handleCopyContent(contentModal.content.optimizedTitle)}>Kopieren</Button>
                    </div>
                  </div>

                  <div>
                    <Text variant="bodySm" fontWeight="bold">Meta-Titel:</Text>
                    <div style={{ background: "#f8fafc", padding: "10px", borderRadius: "6px", marginTop: "4px", fontSize: "14px" }}>
                      {contentModal.content.optimizedMetaTitle}
                    </div>
                    <div style={{ marginTop: "4px" }}>
                      <Button size="slim" onClick={() => handleCopyContent(contentModal.content.optimizedMetaTitle)}>Kopieren</Button>
                    </div>
                  </div>

                  <div>
                    <Text variant="bodySm" fontWeight="bold">Meta-Beschreibung:</Text>
                    <div style={{ background: "#f8fafc", padding: "10px", borderRadius: "6px", marginTop: "4px", fontSize: "14px" }}>
                      {contentModal.content.optimizedMetaDescription}
                    </div>
                    <div style={{ marginTop: "4px" }}>
                      <Button size="slim" onClick={() => handleCopyContent(contentModal.content.optimizedMetaDescription)}>Kopieren</Button>
                    </div>
                  </div>

                  <div>
                    <Text variant="bodySm" fontWeight="bold">Optimierte Beschreibung:</Text>
                    <div style={{
                      background: "#f8fafc", padding: "14px", borderRadius: "6px", marginTop: "4px",
                      fontSize: "13px", lineHeight: "1.7", maxHeight: "300px", overflowY: "auto",
                      border: "1px solid #e2e8f0",
                    }}>
                      <div dangerouslySetInnerHTML={{ __html: contentModal.content.optimizedDescription }} />
                    </div>
                    <div style={{ marginTop: "4px" }}>
                      <Button size="slim" onClick={() => handleCopyContent(contentModal.content.optimizedDescription)}>HTML kopieren</Button>
                    </div>
                  </div>
                </BlockStack>
              </BlockStack>
            </Modal.Section>
          </Modal>
        )}
      </Page>
    </div>
  );
}
