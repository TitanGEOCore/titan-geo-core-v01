import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, Link } from "@remix-run/react";
import {
  Page, Card, Text, BlockStack, InlineStack, Button, Banner, Box, Badge, Divider, Spinner, TextField,
} from "@shopify/polaris";
import { useState, useMemo, useEffect } from "react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  try {
  const { admin, session } = await authenticate.admin(request);

  const response = await admin.graphql(`
    query {
      products(first: 80) {
        nodes {
          id
          title
          descriptionHtml
          handle
          featuredImage {
            url
            altText
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
    descriptionHtml: p.descriptionHtml || "",
    handle: p.handle,
    image: p.featuredImage?.url || null,
  }));

  return json({ products, shop: session.shop });
  } catch (error) {
    console.error("Content-audit loader error:", error);
    if (error instanceof Response) throw error;
    return json({ products: [], shop: "", error: error.message });
  }
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "audit") {
    const productId = formData.get("productId");
    const productTitle = formData.get("productTitle");
    const descriptionHtml = formData.get("descriptionHtml");

    // Limit-Check
    const { checkLimit, trackUsage, limitErrorResponse } = await import("../middleware/enforce-limits.server.js");
    const limitResult = await checkLimit(session.shop, "contentaudit");
    if (!limitResult.allowed) {
      return json(limitErrorResponse(limitResult));
    }

    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const prompt = `Du bist ein Content-Qualitäts-Experte für E-Commerce. Analysiere die folgende Produktbeschreibung und bewerte sie umfassend.

Produkt: ${productTitle}
Beschreibung (HTML): ${descriptionHtml || "Keine Beschreibung vorhanden"}

Bewerte folgende Kriterien jeweils von 0-100 und gib für JEDES Kriterium konkrete, umsetzbare Verbesserungsvorschläge:

Generiere exakt dieses JSON-Format (keine Markdown, nur JSON):
{
  "overallScore": 72,
  "scores": {
    "readability": {
      "score": 80,
      "label": "Lesbarkeit",
      "details": "Konkrete Analyse der Lesbarkeit",
      "improvements": ["Konkreter Verbesserungsvorschlag 1", "Konkreter Verbesserungsvorschlag 2"]
    },
    "keywordDensity": {
      "score": 65,
      "label": "Keyword-Dichte",
      "details": "Analyse der Keyword-Integration",
      "improvements": ["Vorschlag 1", "Vorschlag 2"]
    },
    "structure": {
      "score": 70,
      "label": "Struktur",
      "details": "Analyse der Überschriften, Absätze, Listen",
      "improvements": ["Vorschlag 1", "Vorschlag 2"]
    },
    "persuasion": {
      "score": 75,
      "label": "Überzeugungskraft",
      "details": "Analyse des Kaufanreizes",
      "improvements": ["Vorschlag 1", "Vorschlag 2"]
    },
    "seoQuality": {
      "score": 60,
      "label": "SEO-Qualität",
      "details": "Analyse der SEO-Relevanz",
      "improvements": ["Vorschlag 1", "Vorschlag 2"]
    },
    "uniqueness": {
      "score": 82,
      "label": "Einzigartigkeit",
      "details": "Analyse der Originalität",
      "improvements": ["Vorschlag 1", "Vorschlag 2"]
    }
  },
  "issues": [
    {"severity": "high", "message": "Beschreibung einer konkreten Verbesserung", "fix": "Genau so umsetzen: konkretes Beispiel"},
    {"severity": "medium", "message": "Problem", "fix": "Lösung"},
    {"severity": "low", "message": "Hinweis", "fix": "Umsetzung"}
  ],
  "quickWins": [
    "Sofort umsetzbare Verbesserung 1",
    "Sofort umsetzbare Verbesserung 2",
    "Sofort umsetzbare Verbesserung 3"
  ]
}

Antworte ausschließlich auf Deutsch. Sei konkret und praxisnah mit echten Textbeispielen.`;

    try {
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          temperature: 0.3,
          responseMimeType: "application/json",
        },
      });
      const auditResult = JSON.parse(result.text);
      trackUsage(session.shop, "contentaudit");
      return json({ success: true, audit: auditResult, productTitle, productId });
    } catch (e) {
      console.error("Content audit error:", e);
      return json({ success: false, error: "Analyse fehlgeschlagen. Bitte erneut versuchen." });
    }
  }

  return json({ success: false, error: "Unbekannte Aktion" });
};

const scoreColor = (score) => {
  if (score >= 70) return "#10b981";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
};

const scoreLabel = (score) => {
  if (score >= 80) return "Sehr gut";
  if (score >= 70) return "Gut";
  if (score >= 50) return "Verbesserbar";
  if (score >= 30) return "Schwach";
  return "Kritisch";
};

const severityBadge = (severity) => {
  if (severity === "high") return <Badge tone="critical">Kritisch</Badge>;
  if (severity === "medium") return <Badge tone="warning">Mittel</Badge>;
  return <Badge>Niedrig</Badge>;
};

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

/* Score Ring Component */
function ScoreRing({ score, size = 72, label }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = scoreColor(score);

  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ position: "relative", width: size, height: size, margin: "0 auto" }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="#f1f5f9" strokeWidth="6"
          />
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1s ease" }}
          />
        </svg>
        <div style={{
          position: "absolute",
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          fontWeight: 800,
          fontSize: size > 60 ? "18px" : "14px",
          color,
        }}>
          {score}
        </div>
      </div>
      {label && (
        <Text variant="bodySm" fontWeight="semibold" as="p">{label}</Text>
      )}
    </div>
  );
}

export default function ContentAudit() {
  const { products } = useLoaderData();
  const fetcher = useFetcher();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("Alle");
  const [auditedProducts, setAuditedProducts] = useState({});
  const [selectedProductId, setSelectedProductId] = useState(null);

  const isLoading = fetcher.state !== "idle";
  const auditData = fetcher.data;

  /* Store audit results locally */
  useEffect(() => {
    if (auditData?.success && auditData.audit && auditData.productId) {
      const pid = auditData.productId;
      setAuditedProducts(prev => {
        if (prev[pid]) return prev;
        return {
          ...prev,
          [pid]: {
            score: auditData.audit.overallScore,
            audit: auditData.audit,
            title: auditData.productTitle,
          },
        };
      });
    }
  }, [auditData]);

  const getProductStatus = (product) => {
    const audited = auditedProducts[product.id];
    if (!audited) return { label: "Ausstehend", tone: "info", filter: "Nicht analysiert" };
    if (audited.score >= 70) return { label: "Gut", tone: "success", filter: "Gut" };
    if (audited.score >= 40) return { label: "Verbesserbar", tone: "warning", filter: "Verbesserbar" };
    return { label: "Kritisch", tone: "critical", filter: "Kritisch" };
  };

  const statusCounts = useMemo(() => {
    const counts = { Alle: products.length, Kritisch: 0, Verbesserbar: 0, Gut: 0, "Nicht analysiert": 0 };
    products.forEach(p => {
      const status = getProductStatus(p);
      counts[status.filter] = (counts[status.filter] || 0) + 1;
    });
    return counts;
  }, [products, auditedProducts]);

  const filteredProducts = useMemo(() => {
    let result = products;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p => p.title.toLowerCase().includes(q));
    }
    if (activeFilter !== "Alle") {
      result = result.filter(p => getProductStatus(p).filter === activeFilter);
    }
    return result;
  }, [products, searchQuery, activeFilter, auditedProducts]);

  const handleAudit = (product) => {
    setSelectedProductId(product.id);
    const formData = new FormData();
    formData.set("intent", "audit");
    formData.set("productId", product.id);
    formData.set("productTitle", product.title);
    formData.set("descriptionHtml", product.descriptionHtml);
    fetcher.submit(formData, { method: "post" });
  };

  const currentAudit = auditData?.success && auditData.audit ? auditData : null;
  const currentAuditProduct = currentAudit ? products.find(p => p.id === currentAudit.productId) : null;

  return (
    <div className="titan-fade-in">
      <Page
        title="Content Audit"
        subtitle="Qualitätsanalyse deiner Produktbeschreibungen mit KI"
        backAction={{ content: "Dashboard", url: "/app" }}
      >
        <BlockStack gap="600">

          {/* Hero */}
          <div className="titan-hero">
            <div className="titan-hero-content">
              <h1>Content-Qualitätsanalyse</h1>
              <p>
                Analysiere deine Produktbeschreibungen mit KI und erhalte
                detaillierte Bewertungen mit konkreten Verbesserungsvorschlägen.
              </p>
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
                <Text variant="bodySm" fontWeight="bold" tone="subdued">Status:</Text>
                {["Alle", "Kritisch", "Verbesserbar", "Gut", "Nicht analysiert"].map(f => (
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

          {/* Audit Results (if available) */}
          {auditData?.limitReached && (
            <Banner tone="warning" title="Tageslimit erreicht">
              <p>{auditData.error}</p>
              <div style={{ marginTop: "12px" }}>
                <Link to={auditData.upgradeUrl || "/app/billing"}>
                  <Button variant="primary">Jetzt upgraden</Button>
                </Link>
              </div>
            </Banner>
          )}
          {auditData && !auditData.success && auditData.error && !auditData.limitReached && (
            <Banner tone="critical" title="Fehler">{auditData.error}</Banner>
          )}

          {currentAudit && (
            <div className="titan-fade-in">
              <BlockStack gap="500">

                {/* Overall Score Header */}
                <div className="titan-hero" style={{ padding: "24px 32px" }}>
                  <div className="titan-hero-content" style={{ display: "flex", alignItems: "center", gap: "24px", flexWrap: "wrap" }}>
                    <ScoreRing score={currentAudit.audit.overallScore} size={80} />
                    <div>
                      <h1 style={{ fontSize: "20px", marginBottom: "4px" }}>{currentAudit.productTitle}</h1>
                      <p style={{ fontSize: "14px" }}>
                        Gesamt-Score: {currentAudit.audit.overallScore}/100 — {scoreLabel(currentAudit.audit.overallScore)}
                      </p>
                    </div>
                    {currentAuditProduct && (
                      <div style={{ marginLeft: "auto" }}>
                        <Link to={`/app/products/${currentAuditProduct.numericId}`}>
                          <Button variant="primary" size="large">Jetzt optimieren</Button>
                        </Link>
                      </div>
                    )}
                  </div>
                </div>

                {/* Individual Score Rings */}
                <div className="titan-feature-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                  {Object.entries(currentAudit.audit.scores).map(([key, val]) => {
                    const score = typeof val === "object" ? val.score : val;
                    const label = typeof val === "object" ? val.label : key;
                    const details = typeof val === "object" ? val.details : null;
                    const improvements = typeof val === "object" ? val.improvements : null;
                    const labelMap = {
                      readability: "Lesbarkeit",
                      keywordDensity: "Keywords",
                      structure: "Struktur",
                      persuasion: "Überzeugung",
                      seoQuality: "SEO",
                      uniqueness: "Einzigartigkeit",
                    };

                    return (
                      <div key={key} className="titan-feature-card" style={{ padding: "20px", cursor: "default" }}>
                        <ScoreRing score={score} size={64} label={labelMap[key] || label} />
                        <div style={{ marginTop: "8px" }}>
                          <div className="titan-progress-container">
                            <div className="titan-progress-bar" style={{ width: `${score}%`, background: scoreColor(score) }} />
                          </div>
                        </div>
                        {details && (
                          <div style={{ marginTop: "8px" }}>
                            <Text variant="bodySm" tone="subdued">{details}</Text>
                          </div>
                        )}
                        {improvements?.length > 0 && (
                          <BlockStack gap="100">
                            {improvements.map((imp, idx) => (
                              <div key={idx} style={{
                                marginTop: idx === 0 ? "8px" : "0",
                                padding: "6px 8px",
                                background: "#f8fafc",
                                borderRadius: "6px",
                                borderLeft: "3px solid " + scoreColor(score),
                              }}>
                                <Text variant="bodySm">{imp}</Text>
                              </div>
                            ))}
                          </BlockStack>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Issues */}
                {currentAudit.audit.issues?.length > 0 && (
                  <Card>
                    <BlockStack gap="400">
                      <Text variant="headingSm" as="h2">Gefundene Probleme</Text>
                      <Divider />
                      {currentAudit.audit.issues.map((issue, i) => (
                        <div key={i} className="titan-card-premium" style={{ padding: "14px" }}>
                          <BlockStack gap="200">
                            <InlineStack gap="300" blockAlign="center">
                              {severityBadge(issue.severity)}
                              <Text variant="bodyMd" fontWeight="semibold">{issue.message}</Text>
                            </InlineStack>
                            {issue.fix && (
                              <Box background="bg-surface-success" padding="200" borderRadius="200">
                                <InlineStack gap="200" blockAlign="start">
                                  <Text variant="bodySm" fontWeight="semibold" tone="success">Lösung:</Text>
                                  <Text variant="bodySm">{issue.fix}</Text>
                                </InlineStack>
                              </Box>
                            )}
                          </BlockStack>
                        </div>
                      ))}
                    </BlockStack>
                  </Card>
                )}

                {/* Quick Wins */}
                {currentAudit.audit.quickWins?.length > 0 && (
                  <Card>
                    <BlockStack gap="400">
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="headingSm" as="h2">Quick Wins</Text>
                        <Badge tone="success">Sofort umsetzbar</Badge>
                      </InlineStack>
                      <Divider />
                      {currentAudit.audit.quickWins.map((win, i) => (
                        <InlineStack key={i} gap="300" blockAlign="start">
                          <div style={{
                            width: "24px",
                            height: "24px",
                            borderRadius: "50%",
                            background: "linear-gradient(135deg, #6366f1, #06b6d4)",
                            color: "white",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "12px",
                            fontWeight: 800,
                            flexShrink: 0,
                          }}>
                            {i + 1}
                          </div>
                          <Text variant="bodyMd">{win}</Text>
                        </InlineStack>
                      ))}
                      {currentAuditProduct && (
                        <InlineStack align="end">
                          <Link to={`/app/products/${currentAuditProduct.numericId}`}>
                            <Button variant="primary">Jetzt optimieren</Button>
                          </Link>
                        </InlineStack>
                      )}
                    </BlockStack>
                  </Card>
                )}
              </BlockStack>
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <Card>
              <div style={{ textAlign: "center", padding: "48px 0" }}>
                <Spinner size="large" />
                <div style={{ marginTop: "16px" }}>
                  <Text variant="bodyMd" tone="subdued">
                    KI analysiert die Produktbeschreibung detailliert...
                  </Text>
                </div>
              </div>
            </Card>
          )}

          {/* Product Grid */}
          <BlockStack gap="300">
            <Text variant="headingSm" as="h2">
              Produkte ({filteredProducts.length})
            </Text>
            <div className="titan-feature-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
              {filteredProducts.map(product => {
                const status = getProductStatus(product);
                const audited = auditedProducts[product.id];
                const isSelected = selectedProductId === product.id;

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
                    {/* Card Image Area */}
                    <div style={{
                      height: "140px",
                      background: product.image
                        ? `url(${product.image}) center/cover`
                        : "linear-gradient(135deg, #f1f5f9, #e2e8f0)",
                      position: "relative",
                    }}>
                      {/* Status Badge */}
                      <div style={{ position: "absolute", top: "10px", right: "10px" }}>
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </div>
                      {/* Score Ring if audited */}
                      {audited && (
                        <div style={{
                          position: "absolute",
                          bottom: "-20px",
                          left: "16px",
                          background: "white",
                          borderRadius: "50%",
                          padding: "4px",
                          boxShadow: "0 2px 12px rgba(0,0,0,0.1)",
                        }}>
                          <div className={`titan-score-ring ${audited.score >= 70 ? "excellent" : audited.score >= 40 ? "good" : "poor"}`}
                            style={{ width: "48px", height: "48px", fontSize: "14px" }}>
                            {audited.score}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Card Content */}
                    <div style={{ padding: "20px 16px 16px" }}>
                      <BlockStack gap="300">
                        <Text variant="bodyMd" fontWeight="bold">{product.title}</Text>

                        {product.descriptionHtml ? (
                          <Text variant="bodySm" tone="subdued">
                            {product.descriptionHtml.replace(/<[^>]*>/g, "").substring(0, 80)}
                            {product.descriptionHtml.length > 80 ? "..." : ""}
                          </Text>
                        ) : (
                          <Badge tone="warning">Keine Beschreibung</Badge>
                        )}

                        <InlineStack align="end">
                          <Button
                            variant="primary"
                            size="slim"
                            onClick={() => handleAudit(product)}
                            loading={isLoading && selectedProductId === product.id}
                            disabled={isLoading}
                          >
                            {audited ? "Erneut prüfen" : "Audit starten"}
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
      </Page>
    </div>
  );
}
