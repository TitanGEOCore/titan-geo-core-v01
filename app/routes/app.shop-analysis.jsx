import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, Link } from "@remix-run/react";
import {
  Page, Card, Text, BlockStack, InlineStack, Button, Banner, Box,
  Badge, Divider, Spinner, ProgressBar, Thumbnail,
} from "@shopify/polaris";
import { useState, useEffect, useCallback } from "react";
import { authenticate } from "../shopify.server";
import { TitanHeader } from "../components/TitanHeader";

/* ──────────────────────────────────────────────
   LOADER — Fetch all products for analysis
   ────────────────────────────────────────────── */
export const loader = async ({ request }) => {
  try {
  const { admin, session } = await authenticate.admin(request);

  const response = await admin.graphql(`
    query {
      products(first: 80) {
        nodes {
          id
          title
          description
          descriptionHtml
          handle
          productType
          tags
          seo { title description }
          featuredMedia {
            preview { image { url altText } }
          }
          media(first: 5) {
            nodes {
              ... on MediaImage {
                id
                image { url altText }
              }
            }
          }
        }
      }
      productsCount { count }
    }
  `);

  const data = await response.json();
  const products = (data.data?.products?.nodes || []).map(p => ({
    id: p.id,
    numericId: p.id.replace("gid://shopify/Product/", ""),
    title: p.title,
    description: p.description || "",
    descriptionHtml: p.descriptionHtml || "",
    handle: p.handle,
    productType: p.productType || "",
    tags: p.tags || [],
    seoTitle: p.seo?.title || "",
    seoDescription: p.seo?.description || "",
    image: p.featuredMedia?.preview?.image?.url || null,
    altText: p.featuredMedia?.preview?.image?.altText || "",
    imageCount: p.media?.nodes?.length || 0,
    missingAlt: p.media?.nodes?.filter(m => !m.image?.altText).length || 0,
  }));

  const totalProducts = data.data?.productsCount?.count || 0;

  // Load latest saved report from DB
  const prisma = await import("../db.server.js").then(m => m.default);
  let savedReport = null;
  try {
    const latest = await prisma.shopAnalysisReport.findFirst({
      where: { shop: session.shop },
      orderBy: { createdAt: "desc" },
    });
    if (latest) {
      savedReport = {
        id: latest.id,
        overallScore: latest.overallScore,
        criticalProducts: latest.criticalProducts ? JSON.parse(latest.criticalProducts) : [],
        fullReport: JSON.parse(latest.fullReport),
        createdAt: latest.createdAt,
      };
    }
  } catch (e) {
    console.error("Failed to load saved report:", e);
  }

  return json({ products, totalProducts, shop: session.shop, savedReport });
  } catch (error) {
    console.error("Shop-analysis loader error:", error);
    if (error instanceof Response) throw error;
    return json({ products: [], totalProducts: 0, shop: "", savedReport: null, error: error.message });
  }
};

/* ──────────────────────────────────────────────
   ACTION — Run full AI analysis
   ────────────────────────────────────────────── */
export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const productsJson = formData.get("products");

  if (!productsJson) {
    return json({ error: "Keine Produktdaten erhalten." });
  }

  let products;
  try {
    products = JSON.parse(productsJson);
  } catch {
    return json({ error: "Produktdaten konnten nicht gelesen werden." });
  }

  // Limit-Check
  const { checkLimit, trackUsage, limitErrorResponse } = await import("../middleware/enforce-limits.server.js");
  const limitResult = await checkLimit(session.shop, "shopanalysis");
  if (!limitResult.allowed) {
    return json(limitErrorResponse(limitResult));
  }

  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  // Build comprehensive product summary for AI
  const productSummary = products.map(p => {
    const descText = (p.descriptionHtml || "").replace(/<[^>]*>/g, "");
    const wordCount = descText.split(/\s+/).filter(Boolean).length;
    return `- "${p.title}" | Typ: ${p.productType || "k.A."} | Tags: ${(p.tags || []).join(", ") || "keine"} | SEO-Titel: ${p.seoTitle || "FEHLT"} | Meta-Desc: ${p.seoDescription || "FEHLT"} | Alt-Text: ${p.altText || "FEHLT"} | Wörter: ${wordCount} | Bilder: ${p.imageCount} | Fehlende Alt-Texte: ${p.missingAlt}`;
  }).join("\n");

  const prompt = `Du bist ein erfahrener SEO-Berater und E-Commerce-Experte. Führe eine vollständige Shop-Analyse durch.

Hier sind ALLE Produkte des Shops (${products.length} Stück):
${productSummary}

Analysiere den gesamten Shop und erstelle eine umfassende Bewertung. Generiere exakt dieses JSON-Format (keine Markdown, nur JSON):
{
  "overallScore": 72,
  "seoHealth": {
    "score": 68,
    "healthy": 14,
    "total": 20,
    "issues": ["Konkrete SEO-Probleme hier"]
  },
  "contentQuality": {
    "score": 65,
    "good": 12,
    "total": 20,
    "issues": ["Konkrete Content-Probleme hier"]
  },
  "metaTags": {
    "titlesComplete": 8,
    "titlesMissing": 12,
    "descriptionsComplete": 6,
    "descriptionsMissing": 14,
    "issues": ["Konkrete Meta-Tag-Probleme"]
  },
  "priorityActions": [
    {
      "priority": 1,
      "title": "Konkreter Aktionspunkt",
      "description": "Detaillierte Beschreibung was zu tun ist und warum",
      "impact": "high",
      "module": "meta-generator",
      "affectedProducts": 12
    },
    {
      "priority": 2,
      "title": "Weiterer Aktionspunkt",
      "description": "Beschreibung",
      "impact": "high",
      "module": "alt-texts",
      "affectedProducts": 8
    },
    {
      "priority": 3,
      "title": "Dritter Aktionspunkt",
      "description": "Beschreibung",
      "impact": "medium",
      "module": "content-audit",
      "affectedProducts": 6
    },
    {
      "priority": 4,
      "title": "Vierter Aktionspunkt",
      "description": "Beschreibung",
      "impact": "medium",
      "module": "keywords",
      "affectedProducts": 4
    },
    {
      "priority": 5,
      "title": "Fünfter Aktionspunkt",
      "description": "Beschreibung",
      "impact": "low",
      "module": "internal-links",
      "affectedProducts": 3
    }
  ],
  "keywordOpportunities": [
    {
      "keyword": "relevantes keyword",
      "searchVolume": "high",
      "currentUsage": "Wo/ob es aktuell im Shop vorkommt",
      "recommendation": "Konkreter Vorschlag zur Implementierung",
      "matchingProducts": ["Produkttitel 1", "Produkttitel 2"]
    }
  ],
  "internalLinking": {
    "score": 45,
    "opportunities": 15,
    "suggestions": ["Verlinkungsvorschlag 1", "Verlinkungsvorschlag 2", "Verlinkungsvorschlag 3"]
  },
  "summary": "2-3 Sätze Zusammenfassung des Shop-Zustands mit wichtigstem Handlungsbedarf"
}

Wichtig:
- overallScore: Gewichteter Durchschnitt aller Teilbereiche (0-100)
- Generiere genau 5 priorityActions, sortiert nach Wichtigkeit
- Generiere mindestens 10 keywordOpportunities
- Alle Texte auf Deutsch
- Sei konkret und praxisnah, keine allgemeinen Tipps
- module muss einer dieser Werte sein: meta-generator, alt-texts, content-audit, keywords, internal-links, health, products, competitor
- matchingProducts muss exakte Produkttitel aus der Liste enthalten`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        temperature: 0.3,
        responseMimeType: "application/json",
      },
    });

    const result = JSON.parse(response.text);
    trackUsage(session.shop, "shopanalysis");

    // Build critical products list with details from loader products
    const criticalProducts = [];
    if (result.priorityActions) {
      for (const action of result.priorityActions) {
        if (action.affectedProducts > 0) {
          // Find matching products from the input data
          const matchingTitles = result.keywordOpportunities
            ?.flatMap(k => k.matchingProducts || [])
            ?.slice(0, 5) || [];
          const matchedProducts = products
            .filter(p => matchingTitles.some(t => p.title.toLowerCase().includes(t.toLowerCase())))
            .slice(0, 3)
            .map(p => ({
              id: p.numericId,
              title: p.title,
              image: p.image,
              issue: action.title,
              module: action.module,
            }));
          criticalProducts.push(...matchedProducts);
        }
      }
    }

    // Also add products without SEO data
    products.forEach(p => {
      if (!p.seoTitle && !criticalProducts.find(cp => cp.id === p.numericId)) {
        criticalProducts.push({
          id: p.numericId,
          title: p.title,
          image: p.image,
          issue: "Fehlender SEO-Titel",
          module: "meta-generator",
        });
      }
      if (!p.altText && !criticalProducts.find(cp => cp.id === p.numericId && cp.module === "alt-texts")) {
        criticalProducts.push({
          id: p.numericId,
          title: p.title,
          image: p.image,
          issue: "Fehlender Alt-Text",
          module: "alt-texts",
        });
      }
    });

    // Save to database
    const prismaDb = await import("../db.server.js").then(m => m.default);
    try {
      await prismaDb.shopAnalysisReport.create({
        data: {
          shop: session.shop,
          overallScore: result.overallScore || 0,
          criticalProducts: JSON.stringify(criticalProducts.slice(0, 20)),
          fullReport: JSON.stringify(result),
        },
      });
    } catch (saveErr) {
      console.error("Failed to save analysis report:", saveErr);
    }

    return json({ success: true, data: result, criticalProducts: criticalProducts.slice(0, 20) });
  } catch (err) {
    console.error("Shop analysis error:", err);
    return json({ error: `Analyse fehlgeschlagen: ${err.message}` });
  }
};

/* ──────────────────────────────────────────────
   ANALYSE-SCHRITTE (Ladeanzeige)
   ────────────────────────────────────────────── */
const ANALYSIS_STEPS = [
  { label: "Produktdaten werden geladen...", duration: 1500 },
  { label: "SEO-Gesundheit wird analysiert...", duration: 2500 },
  { label: "Content-Qualität wird bewertet...", duration: 2000 },
  { label: "Meta-Titel & Beschreibungen werden geprüft...", duration: 2000 },
  { label: "Interne Verlinkung wird analysiert...", duration: 1800 },
  { label: "Keyword-Empfehlungen werden generiert...", duration: 2200 },
  { label: "Ergebnisse werden zusammengestellt...", duration: 1500 },
];

/* ──────────────────────────────────────────────
   Score-Ring Komponente
   ────────────────────────────────────────────── */
function ScoreRing({ score, size = 160, label }) {
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? "#10b981" : score >= 60 ? "#f59e0b" : score >= 40 ? "#f97316" : "#ef4444";

  return (
    <div style={{ textAlign: "center" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="#1e293b" strokeWidth="10"
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 1.5s ease-out" }}
        />
        <text x={size / 2} y={size / 2 - 8} textAnchor="middle" fill="white" fontSize="36" fontWeight="800">
          {score}
        </text>
        <text x={size / 2} y={size / 2 + 18} textAnchor="middle" fill="#94a3b8" fontSize="13" fontWeight="500">
          von 100
        </text>
      </svg>
      {label && <Text variant="bodySm" tone="subdued">{label}</Text>}
    </div>
  );
}

/* ──────────────────────────────────────────────
   Mini Score Ring
   ────────────────────────────────────────────── */
function MiniScoreRing({ score, size = 64 }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? "#10b981" : score >= 60 ? "#f59e0b" : score >= 40 ? "#f97316" : "#ef4444";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#1e293b" strokeWidth="5" />
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke={color} strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 1s ease-out" }}
      />
      <text x={size / 2} y={size / 2 + 5} textAnchor="middle" fill="white" fontSize="16" fontWeight="700">
        {score}
      </text>
    </svg>
  );
}

/* ──────────────────────────────────────────────
   Module-Link Mapping
   ────────────────────────────────────────────── */
const MODULE_LINKS = {
  "meta-generator": { url: "/app/meta-generator", label: "Meta Generator" },
  "alt-texts": { url: "/app/alt-texts", label: "Alt-Text Optimizer" },
  "content-audit": { url: "/app/content-audit", label: "Content Audit" },
  "keywords": { url: "/app/keywords", label: "Keyword-Recherche" },
  "internal-links": { url: "/app/internal-links", label: "Interne Verlinkung" },
  "health": { url: "/app/health", label: "SEO Health Check" },
  "products": { url: "/app/products", label: "Produkte" },
  "competitor": { url: "/app/competitor", label: "Wettbewerber-Analyse" },
};

const impactBadge = (impact) => {
  if (impact === "high") return <Badge tone="critical">Hohe Priorität</Badge>;
  if (impact === "medium") return <Badge tone="warning">Mittlere Priorität</Badge>;
  return <Badge tone="info">Niedrige Priorität</Badge>;
};

const volumeBadge = (vol) => {
  if (vol === "high") return <Badge tone="success">Hohes Volumen</Badge>;
  if (vol === "medium") return <Badge tone="warning">Mittleres Volumen</Badge>;
  return <Badge tone="info">Niedriges Volumen</Badge>;
};

/* ──────────────────────────────────────────────
   HAUPTKOMPONENTE
   ────────────────────────────────────────────── */
export default function ShopAnalysis() {
  const { products, totalProducts, savedReport } = useLoaderData();
  const fetcher = useFetcher();

  const [currentStep, setCurrentStep] = useState(-1);
  const [canRun, setCanRun] = useState(true);
  const [lastRunDate, setLastRunDate] = useState(null);
  const [daysUntilNext, setDaysUntilNext] = useState(0);

  const isLoading = fetcher.state !== "idle";
  // Use fresh data from action, or fall back to saved report from DB
  const data = fetcher.data?.data || savedReport?.fullReport || null;
  const criticalProducts = fetcher.data?.criticalProducts || savedReport?.criticalProducts || [];
  const error = fetcher.data?.error;

  // Check saved report date (DB-based, not localStorage)
  useEffect(() => {
    if (savedReport?.createdAt) {
      const lastDate = new Date(savedReport.createdAt);
      const now = new Date();
      const diffDays = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
      setLastRunDate(lastDate.toLocaleDateString("de-DE"));
      if (diffDays < 30) {
        setCanRun(false);
        setDaysUntilNext(30 - diffDays);
      }
    } else {
      // Fallback: check localStorage
      try {
        const stored = localStorage.getItem("titan_shop_analysis_last_run");
        if (stored) {
          const lastDate = new Date(stored);
          const now = new Date();
          const diffDays = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
          setLastRunDate(lastDate.toLocaleDateString("de-DE"));
          if (diffDays < 30) {
            setCanRun(false);
            setDaysUntilNext(30 - diffDays);
          }
        }
      } catch {}
    }
  }, [savedReport]);

  // Step animation during loading
  useEffect(() => {
    if (!isLoading) {
      setCurrentStep(-1);
      return;
    }

    let stepIndex = 0;
    setCurrentStep(0);

    const interval = setInterval(() => {
      stepIndex++;
      if (stepIndex < ANALYSIS_STEPS.length) {
        setCurrentStep(stepIndex);
      } else {
        // Stay on last step until response arrives
        setCurrentStep(ANALYSIS_STEPS.length - 1);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isLoading]);

  // Store run date when analysis completes
  useEffect(() => {
    if (data && !isLoading) {
      try {
        localStorage.setItem("titan_shop_analysis_last_run", new Date().toISOString());
        setLastRunDate(new Date().toLocaleDateString("de-DE"));
        setCanRun(false);
        setDaysUntilNext(30);
      } catch {
        // localStorage not available
      }
    }
  }, [data, isLoading]);

  const handleStartAnalysis = useCallback(() => {
    if (!canRun && !data) return;

    const formData = new FormData();
    formData.set("products", JSON.stringify(products));
    fetcher.submit(formData, { method: "post" });
  }, [canRun, data, products, fetcher]);

  return (
    <Page
      title="Vollständige Shop-Analyse"
      subtitle={`${totalProducts} Produkte im Shop, ${products.length} analysierbar`}
      backAction={{ content: "Dashboard", url: "/app" }}
    >
      <BlockStack gap="600">

        {/* Hero */}
        <div className="titan-hero">
          <div className="titan-hero-content">
            <h1>Vollständige Shop-Analyse</h1>
            <p>
              Die umfassende KI-Analyse untersucht alle Produkte deines Shops auf SEO-Gesundheit,
              Content-Qualität, Meta-Tags, interne Verlinkung und Keyword-Chancen.
              Diese Tiefenanalyse kann einmal pro Monat durchgeführt werden.
            </p>
          </div>
        </div>

        {/* Start / Status Card */}
        {!data && !isLoading && (
          <Card>
            <BlockStack gap="400">
              <Text variant="headingSm" as="h2">Analyse starten</Text>
              <Divider />

              {lastRunDate && (
                <Banner tone={canRun ? "success" : "info"}>
                  <p>
                    Letzte Analyse: {lastRunDate}.
                    {!canRun && ` Nächste Analyse in ${daysUntilNext} Tagen möglich.`}
                    {canRun && " Du kannst eine neue Analyse durchführen."}
                  </p>
                </Banner>
              )}

              <Box padding="400">
                <BlockStack gap="300">
                  <Text variant="bodyMd">
                    Die Analyse umfasst {products.length} Produkte und prüft:
                  </Text>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "12px" }}>
                    {[
                      "SEO-Titel & Meta-Descriptions",
                      "Bild Alt-Texte",
                      "Content-Qualität & Länge",
                      "Keyword-Optimierung",
                      "Interne Verlinkungsmöglichkeiten",
                      "GEO-Optimierungspotenzial",
                    ].map((item, i) => (
                      <div key={i} style={{
                        display: "flex", alignItems: "center", gap: "8px",
                        padding: "10px 14px", borderRadius: "10px",
                        background: "linear-gradient(135deg, #f8fafc, #f1f5f9)",
                        border: "1px solid #e2e8f0",
                      }}>
                        <div style={{
                          width: "24px", height: "24px", borderRadius: "50%",
                          background: "linear-gradient(135deg, #6366f1, #06b6d4)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: "white", fontSize: "12px", fontWeight: "700", flexShrink: 0,
                        }}>{i + 1}</div>
                        <Text variant="bodySm" fontWeight="semibold">{item}</Text>
                      </div>
                    ))}
                  </div>
                </BlockStack>
              </Box>

              <InlineStack align="end">
                <Button
                  variant="primary"
                  size="large"
                  onClick={handleStartAnalysis}
                  disabled={!canRun}
                >
                  Analyse starten
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        )}

        {/* Loading Overlay */}
        {isLoading && (
          <Card>
            <div style={{
              padding: "48px 24px", textAlign: "center",
              background: "linear-gradient(180deg, #0f172a, #1e1b4b)",
              borderRadius: "12px", color: "white",
            }}>
              <Spinner size="large" />
              <div style={{ marginTop: "24px", marginBottom: "32px" }}>
                <Text variant="headingMd" as="h2">
                  <span style={{ color: "white" }}>Shop-Analyse läuft...</span>
                </Text>
              </div>

              <div style={{ maxWidth: "480px", margin: "0 auto" }}>
                {ANALYSIS_STEPS.map((step, i) => {
                  const isActive = i === currentStep;
                  const isDone = i < currentStep;
                  return (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: "12px",
                      padding: "10px 16px", marginBottom: "6px",
                      borderRadius: "10px",
                      background: isActive ? "rgba(99, 102, 241, 0.2)" : isDone ? "rgba(16, 185, 129, 0.1)" : "rgba(255,255,255,0.03)",
                      border: isActive ? "1px solid rgba(99, 102, 241, 0.4)" : "1px solid transparent",
                      transition: "all 0.3s ease",
                    }}>
                      <div style={{
                        width: "28px", height: "28px", borderRadius: "50%", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "12px", fontWeight: "700",
                        background: isDone ? "#10b981" : isActive ? "linear-gradient(135deg, #6366f1, #06b6d4)" : "#334155",
                        color: "white",
                      }}>
                        {isDone ? "\u2713" : i + 1}
                      </div>
                      <span style={{
                        color: isActive ? "#a5b4fc" : isDone ? "#6ee7b7" : "#64748b",
                        fontWeight: isActive ? 600 : 400,
                        fontSize: "14px",
                      }}>
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: "24px" }}>
                <ProgressBar
                  progress={Math.max(5, ((currentStep + 1) / ANALYSIS_STEPS.length) * 100)}
                  tone="primary"
                  size="small"
                />
              </div>
            </div>
          </Card>
        )}

        {/* Limit erreicht */}
        {fetcher.data?.limitReached && (
          <Banner tone="warning" title="Tageslimit erreicht">
            <p>{error}</p>
            <div style={{ marginTop: "12px" }}>
              <Button variant="primary" url={fetcher.data.upgradeUrl || "/app/billing"}>Jetzt upgraden</Button>
            </div>
          </Banner>
        )}

        {/* Error */}
        {error && !isLoading && !fetcher.data?.limitReached && (
          <Banner tone="critical" title="Analyse fehlgeschlagen">
            <p>{error}</p>
          </Banner>
        )}

        {/* ═══════════════════════════════════
            RESULTS DASHBOARD
            ═══════════════════════════════════ */}
        {data && !isLoading && (
          <div className="titan-fade-in">
            <BlockStack gap="600">

              {/* Overall Score Card (Dark) */}
              <div style={{
                background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)",
                borderRadius: "16px", padding: "40px 32px",
                border: "1px solid rgba(99, 102, 241, 0.2)",
                boxShadow: "0 0 40px rgba(99, 102, 241, 0.1)",
              }}>
                <div style={{
                  display: "flex", flexWrap: "wrap", alignItems: "center",
                  justifyContent: "center", gap: "48px",
                }}>
                  <ScoreRing score={data.overallScore || 0} size={180} />

                  <div style={{ flex: 1, minWidth: "260px" }}>
                    <h2 style={{
                      color: "white", fontSize: "24px", fontWeight: 700, marginBottom: "12px",
                    }}>
                      {(data.overallScore || 0) >= 80 ? "Ausgezeichnet!" :
                       (data.overallScore || 0) >= 60 ? "Gute Basis, Potenzial vorhanden" :
                       (data.overallScore || 0) >= 40 ? "Deutlicher Optimierungsbedarf" :
                       "Dringender Handlungsbedarf"}
                    </h2>
                    <p style={{ color: "#94a3b8", fontSize: "15px", lineHeight: 1.6 }}>
                      {data.summary || "Analyse abgeschlossen."}
                    </p>
                  </div>
                </div>

                {/* Sub-Scores Row */}
                <div style={{
                  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: "16px", marginTop: "32px",
                }}>
                  {[
                    { label: "SEO Health", score: data.seoHealth?.score || 0 },
                    { label: "Content", score: data.contentQuality?.score || 0 },
                    { label: "Verlinkung", score: data.internalLinking?.score || 0 },
                  ].map((item, i) => (
                    <div key={i} style={{
                      textAlign: "center", padding: "16px",
                      background: "rgba(255,255,255,0.04)", borderRadius: "12px",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}>
                      <MiniScoreRing score={item.score} />
                      <div style={{ color: "#94a3b8", fontSize: "12px", marginTop: "8px", fontWeight: 600 }}>
                        {item.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary Cards Row */}
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px",
              }}>
                {/* SEO Health */}
                <div className="titan-metric-card">
                  <div className="titan-metric-label">SEO-Gesundheit</div>
                  <div className="titan-metric-value">{data.seoHealth?.score || 0}%</div>
                  <div style={{ marginTop: "8px" }}>
                    <Text variant="bodySm" tone="subdued">
                      {data.seoHealth?.healthy || 0} von {data.seoHealth?.total || 0} Produkten gesund
                    </Text>
                  </div>
                  <div style={{ marginTop: "8px" }}>
                    <ProgressBar progress={data.seoHealth?.score || 0} tone={data.seoHealth?.score >= 70 ? "success" : "warning"} size="small" />
                  </div>
                </div>

                {/* Content Quality */}
                <div className="titan-metric-card">
                  <div className="titan-metric-label">Content-Qualität</div>
                  <div className="titan-metric-value">{data.contentQuality?.score || 0}%</div>
                  <div style={{ marginTop: "8px" }}>
                    <Text variant="bodySm" tone="subdued">
                      {data.contentQuality?.good || 0} von {data.contentQuality?.total || 0} Produkten gut
                    </Text>
                  </div>
                  <div style={{ marginTop: "8px" }}>
                    <ProgressBar progress={data.contentQuality?.score || 0} tone={data.contentQuality?.score >= 70 ? "success" : "warning"} size="small" />
                  </div>
                </div>

                {/* Meta Tags */}
                <div className="titan-metric-card">
                  <div className="titan-metric-label">Meta-Tags</div>
                  <div className="titan-metric-value">
                    {(data.metaTags?.titlesComplete || 0) + (data.metaTags?.descriptionsComplete || 0)}
                  </div>
                  <div style={{ marginTop: "8px" }}>
                    <Text variant="bodySm" tone="subdued">
                      Titel: {data.metaTags?.titlesComplete || 0} vollständig, {data.metaTags?.titlesMissing || 0} fehlen
                    </Text>
                    <br />
                    <Text variant="bodySm" tone="subdued">
                      Beschr.: {data.metaTags?.descriptionsComplete || 0} vollständig, {data.metaTags?.descriptionsMissing || 0} fehlen
                    </Text>
                  </div>
                </div>

                {/* Internal Linking */}
                <div className="titan-metric-card">
                  <div className="titan-metric-label">Verlinkung</div>
                  <div className="titan-metric-value">{data.internalLinking?.score || 0}%</div>
                  <div style={{ marginTop: "8px" }}>
                    <Text variant="bodySm" tone="subdued">
                      {data.internalLinking?.opportunities || 0} Verlinkungsmöglichkeiten
                    </Text>
                  </div>
                  <div style={{ marginTop: "8px" }}>
                    <ProgressBar progress={data.internalLinking?.score || 0} tone={data.internalLinking?.score >= 60 ? "success" : "warning"} size="small" />
                  </div>
                </div>
              </div>

              {/* ───── Top 5 Priority Actions ───── */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingSm" as="h2">Top 5 Handlungsempfehlungen</Text>
                    <Badge tone="critical">Priorität</Badge>
                  </InlineStack>
                  <Divider />

                  {(data.priorityActions || []).map((action, i) => {
                    const moduleInfo = MODULE_LINKS[action.module] || { url: "/app", label: action.module };
                    return (
                      <div key={i} className="titan-card-premium" style={{ padding: "20px" }}>
                        <BlockStack gap="300">
                          <InlineStack align="space-between" blockAlign="start" wrap={false}>
                            <InlineStack gap="300" blockAlign="center">
                              <div style={{
                                width: "36px", height: "36px", borderRadius: "50%", flexShrink: 0,
                                background: i === 0 ? "linear-gradient(135deg, #ef4444, #f97316)" :
                                  i === 1 ? "linear-gradient(135deg, #f59e0b, #f97316)" :
                                  "linear-gradient(135deg, #6366f1, #06b6d4)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                color: "white", fontWeight: 800, fontSize: "16px",
                              }}>
                                {action.priority || i + 1}
                              </div>
                              <BlockStack gap="100">
                                <Text variant="bodyMd" fontWeight="bold">{action.title}</Text>
                                <Text variant="bodySm" tone="subdued">{action.description}</Text>
                              </BlockStack>
                            </InlineStack>
                            <div style={{ flexShrink: 0 }}>
                              {impactBadge(action.impact)}
                            </div>
                          </InlineStack>

                          <InlineStack align="space-between" blockAlign="center">
                            <Text variant="bodySm" tone="subdued">
                              Betrifft {action.affectedProducts || 0} Produkte
                            </Text>
                            <Link to={moduleInfo.url}>
                              <Button variant="primary" size="slim">Jetzt umsetzen</Button>
                            </Link>
                          </InlineStack>
                        </BlockStack>
                      </div>
                    );
                  })}
                </BlockStack>
              </Card>

              {/* ───── Critical Products ───── */}
              {criticalProducts.length > 0 && (
                <Card>
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="headingSm" as="h2">Kritische Produkte</Text>
                      <Badge tone="critical">{criticalProducts.length} Produkte</Badge>
                    </InlineStack>
                    <Divider />
                    <Text variant="bodySm" tone="subdued">
                      Diese Produkte haben konkrete SEO-Probleme, die sofort behoben werden sollten.
                    </Text>

                    {criticalProducts.slice(0, 10).map((cp, i) => {
                      const moduleInfo = MODULE_LINKS[cp.module] || { url: "/app", label: cp.module };
                      return (
                        <div key={i} style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "16px",
                          padding: "12px 16px",
                          background: i % 2 === 0 ? "#fafbfc" : "#fff",
                          borderRadius: "10px",
                          border: "1px solid #f1f5f9",
                        }}>
                          <Thumbnail
                            source={cp.image || ""}
                            alt={cp.title}
                            size="small"
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Text variant="bodyMd" fontWeight="semibold" truncate>
                              {cp.title}
                            </Text>
                            <Text variant="bodySm" tone="critical">
                              {cp.issue}
                            </Text>
                          </div>
                          <Link to={moduleInfo.url}>
                            <Button variant="plain" size="slim">Beheben</Button>
                          </Link>
                        </div>
                      );
                    })}
                  </BlockStack>
                </Card>
              )}

              {/* ───── Keyword Opportunities ───── */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingSm" as="h2">Keyword-Chancen</Text>
                    <Badge tone="success">{(data.keywordOpportunities || []).length} Keywords</Badge>
                  </InlineStack>
                  <Divider />

                  {(data.keywordOpportunities || []).map((kw, i) => (
                    <div key={i} style={{
                      padding: "14px 18px", borderRadius: "12px",
                      background: i % 2 === 0 ? "#f8fafc" : "white",
                      border: "1px solid #f1f5f9",
                    }}>
                      <BlockStack gap="200">
                        <InlineStack align="space-between" blockAlign="center">
                          <InlineStack gap="200" blockAlign="center">
                            <Text variant="bodyMd" fontWeight="bold">{kw.keyword}</Text>
                            {volumeBadge(kw.searchVolume)}
                          </InlineStack>
                        </InlineStack>
                        <Text variant="bodySm" tone="subdued">{kw.recommendation}</Text>
                        {kw.currentUsage && (
                          <Text variant="bodySm">Aktuell: {kw.currentUsage}</Text>
                        )}
                        {kw.matchingProducts?.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                            {kw.matchingProducts.map((title, j) => (
                              <span key={j} style={{
                                padding: "3px 10px", borderRadius: "100px",
                                background: "#ede9fe", color: "#4f46e5",
                                fontSize: "12px", fontWeight: 600,
                              }}>{title}</span>
                            ))}
                          </div>
                        )}
                      </BlockStack>
                    </div>
                  ))}

                  <InlineStack align="end">
                    <Link to="/app/keywords">
                      <Button variant="primary">Zur Keyword-Recherche</Button>
                    </Link>
                  </InlineStack>
                </BlockStack>
              </Card>

              {/* ───── Internal Linking Suggestions ───── */}
              {data.internalLinking?.suggestions?.length > 0 && (
                <Card>
                  <BlockStack gap="400">
                    <Text variant="headingSm" as="h2">Verlinkungsvorschläge</Text>
                    <Divider />
                    {data.internalLinking.suggestions.map((suggestion, i) => (
                      <Box key={i} padding="300" background="bg-surface-secondary" borderRadius="200">
                        <Text variant="bodySm">{suggestion}</Text>
                      </Box>
                    ))}
                    <InlineStack align="end">
                      <Link to="/app/internal-links">
                        <Button variant="primary">Zur internen Verlinkung</Button>
                      </Link>
                    </InlineStack>
                  </BlockStack>
                </Card>
              )}

              {/* ───── Issues Lists ───── */}
              {(data.seoHealth?.issues?.length > 0 || data.contentQuality?.issues?.length > 0 || data.metaTags?.issues?.length > 0) && (
                <Card>
                  <BlockStack gap="400">
                    <Text variant="headingSm" as="h2">Erkannte Probleme im Detail</Text>
                    <Divider />

                    {data.seoHealth?.issues?.length > 0 && (
                      <Box>
                        <Text variant="bodySm" fontWeight="bold">SEO-Probleme:</Text>
                        <ul style={{ margin: "8px 0", paddingLeft: "20px" }}>
                          {data.seoHealth.issues.map((issue, i) => (
                            <li key={i} style={{ marginBottom: "4px" }}>
                              <Text variant="bodySm">{issue}</Text>
                            </li>
                          ))}
                        </ul>
                      </Box>
                    )}

                    {data.contentQuality?.issues?.length > 0 && (
                      <Box>
                        <Text variant="bodySm" fontWeight="bold">Content-Probleme:</Text>
                        <ul style={{ margin: "8px 0", paddingLeft: "20px" }}>
                          {data.contentQuality.issues.map((issue, i) => (
                            <li key={i} style={{ marginBottom: "4px" }}>
                              <Text variant="bodySm">{issue}</Text>
                            </li>
                          ))}
                        </ul>
                      </Box>
                    )}

                    {data.metaTags?.issues?.length > 0 && (
                      <Box>
                        <Text variant="bodySm" fontWeight="bold">Meta-Tag-Probleme:</Text>
                        <ul style={{ margin: "8px 0", paddingLeft: "20px" }}>
                          {data.metaTags.issues.map((issue, i) => (
                            <li key={i} style={{ marginBottom: "4px" }}>
                              <Text variant="bodySm">{issue}</Text>
                            </li>
                          ))}
                        </ul>
                      </Box>
                    )}
                  </BlockStack>
                </Card>
              )}

              {/* Re-run hint */}
              <Banner tone="info">
                <p>
                  Diese Analyse wurde am {lastRunDate || new Date().toLocaleDateString("de-DE")} durchgeführt.
                  Eine neue Analyse ist in {daysUntilNext || 30} Tagen möglich.
                  Nutze in der Zwischenzeit die einzelnen Module, um die Empfehlungen umzusetzen.
                </p>
              </Banner>

            </BlockStack>
          </div>
        )}

      </BlockStack>
    </Page>
  );
}
