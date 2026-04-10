import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, Link } from "@remix-run/react";
import {
  Page, Card, Text, BlockStack, InlineStack, InlineGrid, Button,
  TextField, Badge, Banner, Spinner, Box, Divider, Thumbnail,
} from "@shopify/polaris";
import { ClipboardIcon } from "@shopify/polaris-icons";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useState, useCallback, useMemo } from "react";
import { authenticate } from "../shopify.server";

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
          description
          productType
          tags
          featuredImage {
            url
            altText
          }
        }
      }
    }
  `, { variables });
  const data = await response.json();
  const products = data.data?.products?.nodes?.map(p => ({
    id: p.id,
    numericId: p.id.replace("gid://shopify/Product/", ""),
    title: p.title,
    description: p.description || "",
    productType: p.productType || "",
    tags: p.tags || [],
    image: p.featuredImage?.url || null,
    hasAltText: !!(p.featuredImage?.altText),
  })) || [];
  
  const pageInfo = data.data?.products?.pageInfo || {
    hasNextPage: false,
    hasPreviousPage: false,
    startCursor: null,
    endCursor: null
  };

  return json({ products, pageInfo, shop: session.shop });
  } catch (error) {
    console.error("Keywords loader error:", error);
    if (error instanceof Response) throw error;
    return json({ products: [], pageInfo: {}, shop: "", error: error.message });
  }
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const productId = formData.get("productId");
  const productTitle = formData.get("productTitle");
  const productDescription = formData.get("productDescription");
  const productType = formData.get("productType");
  const productTags = formData.get("productTags");
  const allProductTitles = formData.get("allProductTitles");

  // Limit-Check
  const { checkLimit, trackUsage, limitErrorResponse } = await import("../middleware/enforce-limits.server.js");
  const limitResult = await checkLimit(session.shop, "keywords");
  if (!limitResult.allowed) {
    return json(limitErrorResponse(limitResult));
  }

  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const prompt = `Du bist ein erstklassiger SEO- und GEO-Experte (Generative Engine Optimization) für den deutschsprachigen E-Commerce-Markt. Analysiere das folgende Produkt und generiere umfassende, aktuelle und praxisnahe Keyword-Vorschläge.

Produkt: ${productTitle}
Beschreibung: ${productDescription || "Keine Beschreibung"}
Produkttyp: ${productType || "Nicht angegeben"}
Tags: ${productTags || "Keine Tags"}

Alle Produkte im Shop (für Keyword-Produkt-Matching):
${allProductTitles || productTitle}

Erstelle exakt dieses JSON-Format (keine Markdown, nur JSON):
{
  "primaryKeywords": [
    {
      "keyword": "exaktes Keyword",
      "volume": "high|medium|low",
      "placement": "title|description|meta|alt-text|h1|h2",
      "exampleUsage": "Konkreter Beispielsatz, wie das Keyword im genannten Placement eingebaut wird",
      "intent": "transactional|informational|navigational",
      "matchingProducts": ["Exakter Produkttitel aus der Shop-Liste, auf den dieses Keyword passt"]
    }
  ],
  "longTailKeywords": [
    {
      "keyword": "langes spezifisches Keyword",
      "volume": "high|medium|low",
      "placement": "description|meta|blog|faq",
      "exampleUsage": "Konkreter Beispielsatz für das Placement",
      "intent": "transactional|informational",
      "matchingProducts": ["Produkttitel"]
    }
  ],
  "questionKeywords": [
    {
      "keyword": "Frage-Keyword als vollständige Frage",
      "volume": "medium|low",
      "placement": "faq|blog|description",
      "exampleUsage": "Antwort-Beispiel für FAQ-Bereich oder Produktbeschreibung",
      "intent": "informational",
      "matchingProducts": ["Produkttitel"]
    }
  ],
  "semanticKeywords": [
    {
      "keyword": "semantisch verwandter Begriff",
      "volume": "high|medium|low",
      "placement": "description|alt-text|meta|blog",
      "exampleUsage": "Beispiel, wie der semantische Begriff natürlich eingebaut wird",
      "relationship": "synonym|related|broader|narrower",
      "matchingProducts": ["Produkttitel"]
    }
  ],
  "competitorGap": [
    {
      "keyword": "Keyword das Wettbewerber nutzen aber der Shop vermutlich nicht",
      "volume": "high|medium|low",
      "reason": "Kurze Erklärung warum dieses Keyword fehlt und wichtig ist",
      "placement": "title|description|meta|blog",
      "exampleUsage": "Beispiel für die Umsetzung",
      "matchingProducts": ["Produkttitel"]
    }
  ],
  "metaTitleSuggestion": "Optimierter Meta-Title Vorschlag mit Hauptkeyword (max 60 Zeichen)",
  "metaDescriptionSuggestion": "Optimierte Meta-Description mit Keywords (max 155 Zeichen)"
}

Generiere mindestens 6 Primary Keywords, 6 Long-Tail Keywords, 5 Question Keywords, 5 Semantic Keywords und 4 Competitor Gap Keywords. Alle auf Deutsch, aktuell und relevant für 2025/2026. matchingProducts soll exakte Produkttitel aus der Shop-Liste enthalten, auf die das Keyword am besten passt (1-3 Produkte pro Keyword).`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        temperature: 0.35,
        responseMimeType: "application/json",
      },
    });

    const result = JSON.parse(response.text);
    trackUsage(session.shop, "keywords");
    return json({ success: true, data: result, analyzedProductId: productId });
  } catch (err) {
    console.error("Keyword research error:", err);
    return json({ success: false, error: `Keyword-Recherche fehlgeschlagen: ${err.message}` });
  }
};

/* Helpers */
const volumeBadge = (vol) => {
  if (vol === "high") return <Badge tone="success">Hohes Volumen</Badge>;
  if (vol === "medium") return <Badge tone="warning">Mittleres Volumen</Badge>;
  return <Badge tone="info">Niedriges Volumen</Badge>;
};

const volumeScore = (vol) => {
  if (vol === "high") return 3;
  if (vol === "medium") return 2;
  return 1;
};

const placementLabel = (p) => {
  const map = {
    title: "Produkt-Titel",
    description: "Produktbeschreibung",
    meta: "Meta-Tags",
    "alt-text": "Bild Alt-Text",
    h1: "H1 Überschrift",
    h2: "H2 Überschrift",
    blog: "Blog-Beitrag",
    faq: "FAQ-Bereich",
  };
  return map[p] || p;
};

const intentLabel = (i) => {
  if (i === "transactional") return "Kauf-Absicht";
  if (i === "informational") return "Informations-Suche";
  return "Navigation";
};

const relationshipLabel = (r) => {
  const map = { synonym: "Synonym", related: "Verwandt", broader: "Oberbegriff", narrower: "Unterbegriff" };
  return map[r] || r;
};

/* Filter Chip */
function FilterChip({ label, active, onClick, count }) {
  return (
    <button
      onClick={onClick}
      className={active ? "titan-filter-chip-active" : "titan-filter-chip"}
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
      {count !== undefined && (
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

/* Product Card for selection */
function ProductSelectCard({ product, selected, onClick }) {
  const isSelected = selected === product.id;
  return (
    <div
      onClick={() => onClick(product.id)}
      className="titan-card-premium"
      style={{
        padding: "16px",
        cursor: "pointer",
        border: isSelected ? "2px solid #6366f1" : "1px solid rgba(99, 102, 241, 0.08)",
        background: isSelected ? "linear-gradient(145deg, #f5f3ff 0%, #ede9fe 100%)" : undefined,
        position: "relative",
      }}
    >
      <InlineStack gap="300" blockAlign="center" wrap={false}>
        <Thumbnail
          source={product.image || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png"}
          alt={product.title}
          size="small"
        />
        <BlockStack gap="100">
          <Text variant="bodySm" fontWeight="bold">{product.title}</Text>
          {product.productType && (
            <Text variant="bodySm" tone="subdued">{product.productType}</Text>
          )}
        </BlockStack>
        {isSelected && (
          <div style={{
            position: "absolute",
            top: "8px",
            right: "8px",
            background: "linear-gradient(135deg, #6366f1, #06b6d4)",
            color: "white",
            borderRadius: "50%",
            width: "22px",
            height: "22px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "12px",
            fontWeight: 800,
          }}>
            ✓
          </div>
        )}
      </InlineStack>
    </div>
  );
}

/* Keyword Card with product matching */
function KeywordCard({ kw, products, category }) {
  const matchingProducts = useMemo(() => {
    if (!kw.matchingProducts?.length) return [];
    return kw.matchingProducts.map(title => {
      const found = products.find(p =>
        p.title.toLowerCase() === title.toLowerCase() ||
        p.title.toLowerCase().includes(title.toLowerCase()) ||
        title.toLowerCase().includes(p.title.toLowerCase())
      );
      return found ? { ...found, matchedTitle: title } : { title, matchedTitle: title, numericId: null };
    });
  }, [kw.matchingProducts, products]);

  return (
    <div className="titan-card-premium" style={{ padding: "18px", marginBottom: "10px" }}>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center" wrap={false}>
          <InlineStack gap="200" blockAlign="center">
            <Text variant="bodyMd" fontWeight="bold">{kw.keyword}</Text>
          </InlineStack>
          <InlineStack gap="200">
            {volumeBadge(kw.volume)}
            {kw.intent && <Badge>{intentLabel(kw.intent)}</Badge>}
            {kw.relationship && <Badge tone="info">{relationshipLabel(kw.relationship)}</Badge>}
          </InlineStack>
        </InlineStack>

        <Divider />

        <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
          <Box>
            <BlockStack gap="100">
              <Text variant="bodySm" fontWeight="semibold" tone="subdued">Wo platzieren:</Text>
              <Badge tone="info">{placementLabel(kw.placement)}</Badge>
            </BlockStack>
          </Box>
          <Box>
            <BlockStack gap="100">
              <Text variant="bodySm" fontWeight="semibold" tone="subdued">So einsetzen:</Text>
              <Box background="bg-surface-secondary" padding="200" borderRadius="200">
                <Text variant="bodySm" as="i">{kw.exampleUsage}</Text>
              </Box>
            </BlockStack>
          </Box>
        </InlineGrid>

        {kw.reason && (
          <Box background="bg-surface-warning" padding="200" borderRadius="200">
            <Text variant="bodySm" tone="caution">{kw.reason}</Text>
          </Box>
        )}

        {/* Product Matching */}
        {matchingProducts.length > 0 && (
          <Box>
            <Text variant="bodySm" fontWeight="semibold" tone="subdued" as="p">Anwenden auf:</Text>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "8px" }}>
              {matchingProducts.map((mp, idx) => (
                <div key={idx} style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "10px",
                  padding: "6px 12px",
                }}>
                  {mp.image && (
                    <img
                      src={mp.image}
                      alt={mp.title}
                      style={{ width: "24px", height: "24px", borderRadius: "6px", objectFit: "cover" }}
                    />
                  )}
                  <Text variant="bodySm" fontWeight="semibold">{mp.title}</Text>
                  {mp.numericId && (
                    <Link to={`/app/products/${mp.numericId}`} style={{ textDecoration: "none" }}>
                      <Button size="slim" variant="primary">Direkt anwenden</Button>
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </Box>
        )}
      </BlockStack>
    </div>
  );
}

/* Main Component */
export default function Keywords() {
  const { products, pageInfo } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [selectedProduct, setSelectedProduct] = useState("");
  const [customQuery, setCustomQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [productSearch, setProductSearch] = useState("");

  /* Filter state */
  const [activeFilters, setActiveFilters] = useState(new Set(["Primary", "Long-Tail", "Fragen", "Semantisch", "Lücken"]));
  const [keywordSearch, setKeywordSearch] = useState("");
  const [sortBy, setSortBy] = useState("relevanz");

  const isLoading = fetcher.state !== "idle";
  const data = fetcher.data?.data;

  const selectedProductData = products.find(p => p.id === selectedProduct);

  const filteredProducts = useMemo(() => {
    if (!productSearch) return products;
    const q = productSearch.toLowerCase();
    return products.filter(p =>
      p.title.toLowerCase().includes(q) ||
      (p.productType && p.productType.toLowerCase().includes(q))
    );
  }, [products, productSearch]);

  const toggleFilter = (filter) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(filter)) {
        next.delete(filter);
      } else {
        next.add(filter);
      }
      return next;
    });
  };

  const handleResearch = () => {
    if (!selectedProduct && !customQuery) return;

    const formData = new FormData();
    formData.set("productId", selectedProduct || "");
    formData.set("productTitle", selectedProductData?.title || customQuery);
    formData.set("productDescription", selectedProductData?.description || "");
    formData.set("productType", selectedProductData?.productType || "");
    formData.set("productTags", selectedProductData?.tags?.join(", ") || "");
    formData.set("allProductTitles", products.map(p => p.title).join("\n"));
    fetcher.submit(formData, { method: "post" });
  };

  const handleCopyAll = useCallback(() => {
    if (!data) return;
    const lines = [];
    lines.push("=== PRIMÄRE KEYWORDS ===");
    (data.primaryKeywords || []).forEach(k => {
      lines.push(`${k.keyword} | Volumen: ${k.volume} | Platzierung: ${k.placement}`);
      lines.push(`  Beispiel: ${k.exampleUsage}`);
      if (k.matchingProducts?.length) lines.push(`  Produkte: ${k.matchingProducts.join(", ")}`);
    });
    lines.push("\n=== LONG-TAIL KEYWORDS ===");
    (data.longTailKeywords || []).forEach(k => {
      lines.push(`${k.keyword} | Volumen: ${k.volume} | Platzierung: ${k.placement}`);
      lines.push(`  Beispiel: ${k.exampleUsage}`);
      if (k.matchingProducts?.length) lines.push(`  Produkte: ${k.matchingProducts.join(", ")}`);
    });
    lines.push("\n=== FRAGE-KEYWORDS ===");
    (data.questionKeywords || []).forEach(k => {
      lines.push(`${k.keyword} | Platzierung: ${k.placement}`);
      lines.push(`  Antwort: ${k.exampleUsage}`);
      if (k.matchingProducts?.length) lines.push(`  Produkte: ${k.matchingProducts.join(", ")}`);
    });
    lines.push("\n=== SEMANTISCHE KEYWORDS ===");
    (data.semanticKeywords || []).forEach(k => {
      lines.push(`${k.keyword} | Beziehung: ${k.relationship} | Platzierung: ${k.placement}`);
      lines.push(`  Beispiel: ${k.exampleUsage}`);
      if (k.matchingProducts?.length) lines.push(`  Produkte: ${k.matchingProducts.join(", ")}`);
    });
    lines.push("\n=== WETTBEWERBER-LÜCKEN ===");
    (data.competitorGap || []).forEach(k => {
      lines.push(`${k.keyword} | Volumen: ${k.volume} | Platzierung: ${k.placement}`);
      lines.push(`  Grund: ${k.reason}`);
      lines.push(`  Beispiel: ${k.exampleUsage}`);
      if (k.matchingProducts?.length) lines.push(`  Produkte: ${k.matchingProducts.join(", ")}`);
    });
    if (data.metaTitleSuggestion) {
      lines.push(`\n=== META-TITLE VORSCHLAG ===\n${data.metaTitleSuggestion}`);
    }
    if (data.metaDescriptionSuggestion) {
      lines.push(`\n=== META-DESCRIPTION VORSCHLAG ===\n${data.metaDescriptionSuggestion}`);
    }
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      shopify.toast.show("Alle Keywords in die Zwischenablage kopiert!");
    });
  }, [data, shopify]);

  /* Sort + filter keywords */
  const sortKeywords = useCallback((keywords) => {
    if (!keywords) return [];
    let filtered = keywords;
    if (keywordSearch) {
      const q = keywordSearch.toLowerCase();
      filtered = filtered.filter(kw => kw.keyword.toLowerCase().includes(q));
    }
    if (sortBy === "volumen") {
      filtered = [...filtered].sort((a, b) => volumeScore(b.volume) - volumeScore(a.volume));
    }
    if (sortBy === "schwierigkeit") {
      filtered = [...filtered].sort((a, b) => volumeScore(a.volume) - volumeScore(b.volume));
    }
    return filtered;
  }, [keywordSearch, sortBy]);

  const counts = data ? {
    primary: data.primaryKeywords?.length || 0,
    longTail: data.longTailKeywords?.length || 0,
    fragen: data.questionKeywords?.length || 0,
    semantisch: data.semanticKeywords?.length || 0,
    luecken: data.competitorGap?.length || 0,
  } : {};

  const totalKeywords = counts.primary + counts.longTail + counts.fragen + counts.semantisch + counts.luecken || 0;

  return (
    <Page
      title="KI Keyword-Recherche"
      subtitle="Finde die besten Keywords für deine Produkte mit Gemini KI"
      backAction={{ content: "Zurück", url: "/app" }}
    >
      <BlockStack gap="600">

        {/* Hero Banner */}
        <div className="titan-hero">
          <div className="titan-hero-content">
            <h1>Intelligente Keyword-Analyse</h1>
            <p>
              Wähle ein Produkt aus deinem Shop und erhalte sofort relevante, aktuelle
              Keywords mit konkreten Platzierungsempfehlungen, Beispielsätzen und Produkt-Matching.
            </p>
          </div>
        </div>

        {/* Product Grid Selection */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="headingSm" as="h2">Produkt auswählen</Text>
              {selectedProductData && (
                <Badge tone="success">{selectedProductData.title}</Badge>
              )}
            </InlineStack>

            <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
              <TextField
                label="Produkte durchsuchen"
                labelHidden
                value={productSearch}
                onChange={setProductSearch}
                placeholder="Produkt suchen..."
                autoComplete="off"
                prefix={<span style={{ color: "#94a3b8" }}>🔍</span>}
              />
              <TextField
                label="Eigenes Keyword/Thema"
                labelHidden
                value={customQuery}
                onChange={(val) => { setCustomQuery(val); setSelectedProduct(""); }}
                placeholder="Oder eigenes Keyword/Thema eingeben..."
                autoComplete="off"
              />
            </InlineGrid>

            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: "10px",
              maxHeight: "320px",
              overflowY: "auto",
              padding: "4px",
            }}>
              {filteredProducts.map(p => (
                <ProductSelectCard
                  key={p.id}
                  product={p}
                  selected={selectedProduct}
                  onClick={(id) => { setSelectedProduct(id); setCustomQuery(""); }}
                />
              ))}
            </div>

            <InlineStack align="end" gap="200">
              <Button
                variant="primary"
                onClick={handleResearch}
                loading={isLoading}
                disabled={!selectedProduct && !customQuery}
                size="large"
              >
                {isLoading ? "Analysiere mit KI..." : "Keywords recherchieren"}
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>

        {/* Limit Reached */}
        {fetcher.data?.limitReached && (
          <Banner tone="warning" title="Tageslimit erreicht">
            <p>{fetcher.data.error}</p>
            <div style={{ marginTop: "12px" }}>
              <Link to={fetcher.data.upgradeUrl || "/app/billing"}>
                <Button variant="primary">Jetzt upgraden</Button>
              </Link>
            </div>
          </Banner>
        )}

        {/* Error */}
        {fetcher.data?.error && !fetcher.data?.limitReached && (
          <Banner tone="critical" title="Fehler">
            <p>{fetcher.data.error}</p>
          </Banner>
        )}

        {/* Loading */}
        {isLoading && (
          <Card>
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <Spinner size="large" />
              <div style={{ marginTop: "16px" }}>
                <Text variant="bodyMd" tone="subdued">
                  Gemini KI analysiert Keywords, findet passende Produkte und generiert Empfehlungen...
                </Text>
              </div>
            </div>
          </Card>
        )}

        {/* Results */}
        {data && !isLoading && (
          <div className="titan-fade-in">
            <BlockStack gap="500">

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
                  {/* Filter Pills */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                    <Text variant="bodySm" fontWeight="bold" tone="subdued">Filter:</Text>
                    <FilterChip
                      label="Primary"
                      active={activeFilters.has("Primary")}
                      onClick={() => toggleFilter("Primary")}
                      count={counts.primary}
                    />
                    <FilterChip
                      label="Long-Tail"
                      active={activeFilters.has("Long-Tail")}
                      onClick={() => toggleFilter("Long-Tail")}
                      count={counts.longTail}
                    />
                    <FilterChip
                      label="Fragen"
                      active={activeFilters.has("Fragen")}
                      onClick={() => toggleFilter("Fragen")}
                      count={counts.fragen}
                    />
                    <FilterChip
                      label="Semantisch"
                      active={activeFilters.has("Semantisch")}
                      onClick={() => toggleFilter("Semantisch")}
                      count={counts.semantisch}
                    />
                    <FilterChip
                      label="Lücken"
                      active={activeFilters.has("Lücken")}
                      onClick={() => toggleFilter("Lücken")}
                      count={counts.luecken}
                    />

                    <div style={{ marginLeft: "auto", display: "flex", gap: "8px", alignItems: "center" }}>
                      <Badge tone="success">{totalKeywords} Keywords</Badge>
                      <Button
                        onClick={handleCopyAll}
                        icon={ClipboardIcon}
                        variant={copied ? "primary" : "secondary"}
                        size="slim"
                      >
                        {copied ? "Kopiert!" : "Kopieren"}
                      </Button>
                    </div>
                  </div>

                  {/* Search + Sort */}
                  <InlineGrid columns={{ xs: 1, md: "2fr 1fr" }} gap="300">
                    <TextField
                      label="Keywords filtern"
                      labelHidden
                      value={keywordSearch}
                      onChange={setKeywordSearch}
                      placeholder="Keywords durchsuchen..."
                      autoComplete="off"
                    />
                    <div style={{ display: "flex", gap: "6px" }}>
                      {["relevanz", "volumen", "schwierigkeit"].map(s => (
                        <button
                          key={s}
                          onClick={() => setSortBy(s)}
                          style={{
                            flex: 1,
                            padding: "6px 10px",
                            borderRadius: "8px",
                            border: sortBy === s ? "2px solid #6366f1" : "1px solid #e2e8f0",
                            background: sortBy === s ? "#ede9fe" : "white",
                            color: sortBy === s ? "#4f46e5" : "#64748b",
                            fontWeight: sortBy === s ? 700 : 500,
                            fontSize: "12px",
                            cursor: "pointer",
                            transition: "all 0.2s ease",
                            textTransform: "capitalize",
                          }}
                        >
                          {s === "relevanz" ? "Relevanz" : s === "volumen" ? "Volumen" : "Schwierigkeit"}
                        </button>
                      ))}
                    </div>
                  </InlineGrid>
                </BlockStack>
              </div>

              {/* Meta Suggestions */}
              {(data.metaTitleSuggestion || data.metaDescriptionSuggestion) && (
                <Card>
                  <BlockStack gap="300">
                    <Text variant="headingSm" as="h2">Meta-Tag Vorschläge</Text>
                    <Divider />
                    {data.metaTitleSuggestion && (
                      <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                        <BlockStack gap="100">
                          <Text variant="bodySm" fontWeight="semibold" tone="subdued">Meta-Title (max. 60 Zeichen):</Text>
                          <Text variant="bodyMd" fontWeight="bold">{data.metaTitleSuggestion}</Text>
                          <Text variant="bodySm" tone="subdued">{data.metaTitleSuggestion.length} Zeichen</Text>
                        </BlockStack>
                      </Box>
                    )}
                    {data.metaDescriptionSuggestion && (
                      <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                        <BlockStack gap="100">
                          <Text variant="bodySm" fontWeight="semibold" tone="subdued">Meta-Description (max. 155 Zeichen):</Text>
                          <Text variant="bodyMd">{data.metaDescriptionSuggestion}</Text>
                          <Text variant="bodySm" tone="subdued">{data.metaDescriptionSuggestion.length} Zeichen</Text>
                        </BlockStack>
                      </Box>
                    )}
                    {selectedProductData && (
                      <InlineStack align="end">
                        <Link to={`/app/products/${selectedProductData.numericId}`}>
                          <Button variant="primary">Meta-Tags jetzt anpassen</Button>
                        </Link>
                      </InlineStack>
                    )}
                  </BlockStack>
                </Card>
              )}

              {/* Primary Keywords */}
              {activeFilters.has("Primary") && data.primaryKeywords?.length > 0 && (
                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <InlineStack gap="200" blockAlign="center">
                        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981" }} />
                        <Text variant="headingSm" as="h2">Primäre Keywords</Text>
                        <Badge tone="success">{data.primaryKeywords.length}</Badge>
                      </InlineStack>
                      <Text variant="bodySm" tone="subdued">Wichtigste Keywords für Titel und Hauptbeschreibung</Text>
                    </InlineStack>
                    <Divider />
                    {sortKeywords(data.primaryKeywords).map((kw, i) => (
                      <KeywordCard key={`primary-${i}`} kw={kw} products={products} category="primary" />
                    ))}
                  </BlockStack>
                </Card>
              )}

              {/* Long-Tail Keywords */}
              {activeFilters.has("Long-Tail") && data.longTailKeywords?.length > 0 && (
                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <InlineStack gap="200" blockAlign="center">
                        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#f59e0b" }} />
                        <Text variant="headingSm" as="h2">Long-Tail Keywords</Text>
                        <Badge tone="warning">{data.longTailKeywords.length}</Badge>
                      </InlineStack>
                      <Text variant="bodySm" tone="subdued">Spezifische Suchbegriffe mit hoher Kaufabsicht</Text>
                    </InlineStack>
                    <Divider />
                    {sortKeywords(data.longTailKeywords).map((kw, i) => (
                      <KeywordCard key={`longtail-${i}`} kw={kw} products={products} category="longtail" />
                    ))}
                  </BlockStack>
                </Card>
              )}

              {/* Question Keywords */}
              {activeFilters.has("Fragen") && data.questionKeywords?.length > 0 && (
                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <InlineStack gap="200" blockAlign="center">
                        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#06b6d4" }} />
                        <Text variant="headingSm" as="h2">Frage-Keywords</Text>
                        <Badge tone="info">{data.questionKeywords.length}</Badge>
                      </InlineStack>
                      <Text variant="bodySm" tone="subdued">Perfekt für FAQ-Bereiche und GEO-Optimierung</Text>
                    </InlineStack>
                    <Divider />
                    {sortKeywords(data.questionKeywords).map((kw, i) => (
                      <KeywordCard key={`question-${i}`} kw={kw} products={products} category="question" />
                    ))}
                  </BlockStack>
                </Card>
              )}

              {/* Semantic Keywords */}
              {activeFilters.has("Semantisch") && data.semanticKeywords?.length > 0 && (
                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <InlineStack gap="200" blockAlign="center">
                        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#8b5cf6" }} />
                        <Text variant="headingSm" as="h2">Semantische Keywords</Text>
                        <Badge>{data.semanticKeywords.length}</Badge>
                      </InlineStack>
                      <Text variant="bodySm" tone="subdued">Verwandte Begriffe für natürlichen Content</Text>
                    </InlineStack>
                    <Divider />
                    {sortKeywords(data.semanticKeywords).map((kw, i) => (
                      <KeywordCard key={`semantic-${i}`} kw={kw} products={products} category="semantic" />
                    ))}
                  </BlockStack>
                </Card>
              )}

              {/* Competitor Gap */}
              {activeFilters.has("Lücken") && data.competitorGap?.length > 0 && (
                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <InlineStack gap="200" blockAlign="center">
                        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#ef4444" }} />
                        <Text variant="headingSm" as="h2">Wettbewerber-Keyword-Lücken</Text>
                        <Badge tone="critical">{data.competitorGap.length}</Badge>
                      </InlineStack>
                      <Text variant="bodySm" tone="subdued">Keywords die du vermutlich noch nicht nutzt</Text>
                    </InlineStack>
                    <Divider />
                    <Banner tone="warning" title="Keyword-Lücken erkannt">
                      <p>Diese Keywords werden von Wettbewerbern genutzt, fehlen aber wahrscheinlich in deinem Shop.</p>
                    </Banner>
                    {sortKeywords(data.competitorGap).map((kw, i) => (
                      <KeywordCard key={`gap-${i}`} kw={kw} products={products} category="gap" />
                    ))}
                  </BlockStack>
                </Card>
              )}

            </BlockStack>
          </div>
        )}
      </BlockStack>

      {/* Pagination */}
      {(pageInfo.hasPreviousPage || pageInfo.hasNextPage) && (
        <BlockStack gap="300" align="center">
          <InlineStack gap="300" blockAlign="center">
            {pageInfo.hasPreviousPage && (
              <Button 
                url={`/app/keywords?cursor=${pageInfo.startCursor}&direction=prev`}
              >
                ← Vorherige Seite
              </Button>
            )}
            <Text variant="bodySm" as="span" tone="subdued">
              Seite
            </Text>
            {pageInfo.hasNextPage && (
              <Button 
                url={`/app/keywords?cursor=${pageInfo.endCursor}&direction=next`}
              >
                Nächste Seite →
              </Button>
            )}
          </InlineStack>
        </BlockStack>
      )}
    </Page>
  );
}
