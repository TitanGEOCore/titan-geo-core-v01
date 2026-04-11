import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useFetcher } from "@remix-run/react";
import {
  Page, Card, Text, BlockStack, InlineStack, Badge, Button, Banner,
  EmptyState, Box, TextField, Select, Spinner, Modal, ProgressBar,
  Divider, Tag,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useState, useEffect, useMemo, useCallback } from "react";
import { authenticate } from "../shopify.server";
import { getUsageStats } from "../services/shopify/mutations.server";
import { getEffectivePlan } from "../middleware/plan-check.server.js";
import { PLAN_LIMITS } from "../config/limits.server.js";
import prisma from "../db.server.js";

export const loader = async ({ request }) => {
  try {
    const { admin, session } = await authenticate.admin(request);
    const shop = session.shop;
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor");
    const direction = url.searchParams.get("direction") || "next";

    let plan = "Starter";
    let planLimits = PLAN_LIMITS.Starter;
    let bulkAllowed = false;
    try {
      plan = await getEffectivePlan(shop, prisma);
      planLimits = PLAN_LIMITS[plan] || PLAN_LIMITS.Starter;
      bulkAllowed = planLimits.bulkOperationsAllowed === true;
    } catch (e) { console.error("Plan check error:", e); }

    const variables = cursor
      ? direction === "next" ? { first: 25, after: cursor } : { last: 25, before: cursor }
      : { first: 25 };

    const response = await admin.graphql(
      `#graphql
      query getProducts($first: Int, $last: Int, $after: String, $before: String) {
        products(first: $first, last: $last, after: $after, before: $before) {
          pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
          nodes {
            id title handle status updatedAt vendor productType
            featuredImage { url altText }
            metafield(namespace: "custom", key: "geo_score") { value }
            seo { title description }
            totalVariants
          }
        }
      }`,
      { variables },
    );

    const data = await response.json();
    const products = data.data?.products?.nodes || [];
    const pageInfo = data.data?.products?.pageInfo || {};

    let usage = { used: 0, limit: 5, remaining: 5 };
    try { usage = await getUsageStats(shop); } catch (e) { /* fallback */ }

    return json({
      products: products.map((p) => ({
        id: p.id.replace("gid://shopify/Product/", ""),
        shopifyId: p.id,
        title: p.title,
        handle: p.handle,
        status: p.status,
        updatedAt: p.updatedAt,
        vendor: p.vendor || "",
        productType: p.productType || "",
        image: p.featuredImage?.url || null,
        imageAlt: p.featuredImage?.altText || "",
        geoScore: p.metafield?.value ? Number(p.metafield.value) : null,
        seoTitle: p.seo?.title || "",
        seoDesc: p.seo?.description || "",
        variants: p.totalVariants || 1,
      })),
      pageInfo, plan,
      usageCount: usage.used, freeLimit: usage.limit,
      usageRemaining: usage.remaining, limitReached: usage.remaining === 0,
      bulkAllowed,
    });
  } catch (error) {
    console.error("Products loader error:", error);
    return json({
      error: "Fehler beim Laden der Produkte.", products: [], pageInfo: {},
      plan: "Starter", usageCount: 0, freeLimit: 5, usageRemaining: 5,
      limitReached: false, bulkAllowed: false,
    });
  }
};

/* -- Detail Label Row -- */
function DetailRow({ label, value, mono }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0" }}>
      <span style={{ fontSize: "11px", fontWeight: 600, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.4px" }}>{label}</span>
      <span style={{ fontSize: "12px", fontWeight: 500, color: "#18181b", maxWidth: "60%", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: mono ? "monospace" : "inherit" }}>{value || "\u2014"}</span>
    </div>
  );
}

/* ===================================
   VIBE & AUDIENCE OPTIONS
   =================================== */
const VIBE_OPTIONS = [
  "Luxuri\u00f6s", "Premium", "Hochwertig", "Minimalistisch",
  "Praktisch", "Robust", "Nachhaltig", "Eco-Friendly",
  "Verspielt", "Modern", "Klassisch", "Innovativ",
  "G\u00fcnstig", "Preis-Leistung", "Professionell", "Handgemacht",
];
const AUDIENCE_OPTIONS = [
  { label: "-- Zielgruppe w\u00e4hlen --", value: "" },
  { label: "Frauen 18-35", value: "Frauen 18-35" },
  { label: "Frauen 35-55", value: "Frauen 35-55" },
  { label: "M\u00e4nner 18-35", value: "M\u00e4nner 18-35" },
  { label: "M\u00e4nner 35-55", value: "M\u00e4nner 35-55" },
  { label: "Eltern & Familien", value: "Eltern & Familien" },
  { label: "Teenager & Gen Z", value: "Teenager & Gen Z" },
  { label: "Senioren 55+", value: "Senioren 55+" },
  { label: "B2B / Unternehmen", value: "B2B / Unternehmen" },
  { label: "Fitness & Sport", value: "Fitness & Sport" },
  { label: "Technik-Enthusiasten", value: "Technik-Enthusiasten" },
  { label: "Luxus-K\u00e4ufer", value: "Luxus-K\u00e4ufer" },
  { label: "Alle / Allgemein", value: "Alle / Allgemein" },
];
const QUIZ_STEPS = [
  { title: "Was ist dieses Produkt?", subtitle: "Beschreibe es in 1\u20132 S\u00e4tzen \u2014 die KI baut daraus professionellen Content." },
  { title: "USP & Features", subtitle: "Was macht es einzigartig? Material, Qualit\u00e4t, Vorteile?" },
  { title: "Zielgruppe & Vibe", subtitle: "F\u00fcr wen ist es und wie soll es wirken?" },
];

/* ===================================
   MAIN COMPONENT
   =================================== */
export default function Products() {
  const {
    products, pageInfo, plan, usageCount, freeLimit,
    usageRemaining, limitReached, bulkAllowed,
  } = useLoaderData();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const optimizeFetcher = useFetcher();
  const [optimizingId, setOptimizingId] = useState(null);
  const [searchValue, setSearchValue] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name");

  // -- Context Builder State --
  const [builderActive, setBuilderActive] = useState(false);
  const [builderProductId, setBuilderProductId] = useState(null);
  const [builderProductTitle, setBuilderProductTitle] = useState("");
  const [builderStep, setBuilderStep] = useState(0);
  const [builderData, setBuilderData] = useState({ description: "", usp: "", audience: "", keywords: "" });
  const [selectedVibes, setSelectedVibes] = useState([]);

  // -- Stats --
  const totalProducts = products.length;
  const scoredProducts = products.filter((p) => p.geoScore !== null);
  const excellentCount = products.filter((p) => p.geoScore >= 70).length;
  const mediumCount = products.filter((p) => p.geoScore !== null && p.geoScore >= 40 && p.geoScore < 70).length;
  const criticalCount = products.filter((p) => p.geoScore !== null && p.geoScore < 40).length;
  const pendingCount = products.filter((p) => p.geoScore === null).length;
  const averageScore = scoredProducts.length > 0
    ? Math.round(scoredProducts.reduce((s, p) => s + p.geoScore, 0) / scoredProducts.length) : 0;

  // -- Filter & Sort --
  const filteredProducts = useMemo(() => {
    let r = [...products];
    if (searchValue.trim()) {
      const q = searchValue.toLowerCase();
      r = r.filter((p) => p.title.toLowerCase().includes(q) || p.handle.toLowerCase().includes(q) || p.vendor.toLowerCase().includes(q));
    }
    if (statusFilter === "optimized") r = r.filter((p) => p.geoScore !== null && p.geoScore >= 40);
    else if (statusFilter === "excellent") r = r.filter((p) => p.geoScore !== null && p.geoScore >= 70);
    else if (statusFilter === "pending") r = r.filter((p) => p.geoScore === null || p.geoScore < 40);
    if (sortBy === "score_desc") r.sort((a, b) => (b.geoScore ?? -1) - (a.geoScore ?? -1));
    else if (sortBy === "score_asc") r.sort((a, b) => (a.geoScore ?? -1) - (b.geoScore ?? -1));
    else if (sortBy === "name") r.sort((a, b) => a.title.localeCompare(b.title));
    else if (sortBy === "date") r.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    return r;
  }, [products, searchValue, statusFilter, sortBy]);

  // -- Fetcher Effects --
  useEffect(() => {
    if (optimizeFetcher.state !== "idle") return;
    const d = optimizeFetcher.data;
    if (!d) return;
    if (d.success) {
      shopify.toast.show(`GEO Score: ${d.geoScore}/100 \u2014 deployed!`);
      setOptimizingId(null);
      setBuilderActive(false);
      resetBuilder();
    } else if (d.status === "NEEDS_CONTEXT") {
      // Auto-open the Context Builder for this product
      const pid = optimizingId;
      const prod = products.find((p) => p.shopifyId === pid);
      setBuilderProductId(pid);
      setBuilderProductTitle(d.productTitle || prod?.title || "Produkt");
      setBuilderStep(0);
      setBuilderActive(true);
      setOptimizingId(null);
    } else if (d.error) {
      shopify.toast.show(d.error, { isError: true });
      setOptimizingId(null);
    } else if (d.requiresUpgrade) {
      shopify.toast.show("Limit erreicht \u2014 bitte upgraden.", { isError: true });
      setOptimizingId(null);
    }
  }, [optimizeFetcher.data, optimizeFetcher.state]);

  const handleOptimize = useCallback((shopifyId) => {
    setOptimizingId(shopifyId);
    optimizeFetcher.submit(
      { productId: shopifyId },
      { method: "post", action: "/app/api/optimize" },
    );
  }, []);

  // -- Context Builder: open manually --
  const openBuilder = useCallback((product) => {
    setBuilderProductId(product.shopifyId);
    setBuilderProductTitle(product.title);
    setBuilderStep(0);
    setBuilderData({ description: "", usp: "", audience: "", keywords: "" });
    setSelectedVibes([]);
    setBuilderActive(true);
  }, []);

  const resetBuilder = () => {
    setBuilderData({ description: "", usp: "", audience: "", keywords: "" });
    setSelectedVibes([]);
    setBuilderStep(0);
    setBuilderProductId(null);
    setBuilderProductTitle("");
  };

  // -- Context Builder: submit with manualContext --
  const handleBuilderSubmit = () => {
    if (!builderProductId) return;
    setOptimizingId(builderProductId);
    const payload = JSON.stringify({
      description: builderData.description,
      usp: builderData.usp,
      audience: builderData.audience,
      vibe: selectedVibes.join(", "),
      keywords: builderData.keywords,
    });
    optimizeFetcher.submit(
      { productId: builderProductId, manualContext: payload },
      { method: "post", action: "/app/api/optimize" },
    );
  };

  const builderProgress = ((builderStep + 1) / QUIZ_STEPS.length) * 100;
  const canProceed = builderStep === 0 ? builderData.description.length > 10
    : builderStep === 1 ? builderData.usp.length > 5
    : selectedVibes.length > 0;
  const isOptimizing = optimizeFetcher.state !== "idle";

  // -- Helpers --
  const scoreColor = (s) => s === null ? "#e4e4e7" : s >= 70 ? "#09090b" : s >= 40 ? "#3f3f46" : "#a1a1aa";
  const scoreTone = (s) => s === null ? "info" : s >= 70 ? "success" : s >= 40 ? "warning" : "critical";
  const scoreLabel = (s) => s === null ? "Ausstehend" : s >= 70 ? "Exzellent" : s >= 40 ? "Teiloptimiert" : "Kritisch";
  const usagePct = Math.min((usageCount / freeLimit) * 100, 100);

  if (products.length === 0) {
    return (
      <Page title="GEO Produkt-Zentrale" backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}>
        <Card><EmptyState heading="Keine Produkte gefunden" image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png">
          <p>F\u00fcge Produkte zu deinem Store hinzu, um sie zu optimieren.</p>
        </EmptyState></Card>
      </Page>
    );
  }

  return (
    <Page
      title="GEO Produkt-Zentrale"
      subtitle={`${totalProducts} Produkte | ${plan}`}
      backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
    >
      <BlockStack gap="600">

        {limitReached && (
          <Banner title="Optimierungslimit erreicht" tone="warning" action={{ content: "Jetzt upgraden", url: "/app/billing" }}>
            <p>Du hast alle {freeLimit} Optimierungen verbraucht.</p>
          </Banner>
        )}

        {/* === ANALYTICS HERO === */}
        <div style={{
          background: "linear-gradient(135deg, #09090b 0%, #18181b 40%, #27272a 100%)",
          borderRadius: "20px", padding: "32px", color: "white",
          boxShadow: "0 8px 32px rgba(9, 9, 11, 0.4)",
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "32px", alignItems: "center" }}>
            {/* Score Ring */}
            <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
              <div style={{ position: "relative", width: "100px", height: "100px" }}>
                <svg width="100" height="100" style={{ transform: "rotate(-90deg)" }}>
                  <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
                  <circle cx="50" cy="50" r="42" fill="none"
                    stroke={scoredProducts.length ? "#ffffff" : "rgba(255,255,255,0.15)"}
                    strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={`${(averageScore / 100) * 263.9} 263.9`}
                    style={{ transition: "stroke-dasharray 1s ease" }}
                  />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: "30px", fontWeight: 800, color: "#ffffff" }}>
                    {scoredProducts.length > 0 ? averageScore : "\u2014"}
                  </span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: "11px", opacity: 0.5, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>Durchschnitt</div>
                <div style={{ fontSize: "20px", fontWeight: 700, lineHeight: 1.2 }}>GEO Score</div>
                <div style={{ fontSize: "12px", opacity: 0.4, marginTop: "4px" }}>{scoredProducts.length}/{totalProducts} analysiert</div>
              </div>
            </div>

            {/* Distribution */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
              {[
                { label: "Exzellent", sub: "70+", count: excellentCount, color: "#09090b", bg: "rgba(255,255,255,0.12)" },
                { label: "Teiloptimiert", sub: "40\u201369", count: mediumCount, color: "#3f3f46", bg: "rgba(255,255,255,0.08)" },
                { label: "Kritisch", sub: "< 40", count: criticalCount, color: "#a1a1aa", bg: "rgba(255,255,255,0.05)" },
                { label: "Ausstehend", sub: "Kein Score", count: pendingCount, color: "#e4e4e7", bg: "rgba(255,255,255,0.03)" },
              ].map((s) => (
                <div key={s.label} style={{ background: s.bg, borderRadius: "14px", padding: "16px", border: "1px solid rgba(255,255,255,0.08)", textAlign: "center" }}>
                  <div style={{ fontSize: "32px", fontWeight: 800, color: "#fafafa", lineHeight: 1 }}>{s.count}</div>
                  <div style={{ fontSize: "11px", fontWeight: 600, marginTop: "6px", opacity: 0.8, color: "#d4d4d8" }}>{s.label}</div>
                  <div style={{ fontSize: "9px", opacity: 0.4, marginTop: "2px", color: "#a1a1aa" }}>{s.sub}</div>
                  <div style={{ marginTop: "10px", height: "3px", borderRadius: "2px", background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                    <div style={{ width: `${totalProducts > 0 ? (s.count / totalProducts) * 100 : 0}%`, height: "100%", background: "#d4d4d8", borderRadius: "2px" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Usage */}
          <div style={{ marginTop: "24px", paddingTop: "18px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ fontSize: "11px", opacity: 0.4, textTransform: "uppercase", letterSpacing: "0.5px" }}>Kontingent</span>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#d4d4d8" }}>{usageCount} / {freeLimit}</span>
            </div>
            <div style={{ height: "5px", borderRadius: "3px", background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
              <div style={{ width: `${usagePct}%`, height: "100%", borderRadius: "3px", background: "linear-gradient(90deg, #a1a1aa, #ffffff)", transition: "width 0.6s ease" }} />
            </div>
          </div>
        </div>

        {!bulkAllowed && (
          <Banner tone="info" title="Bulk-Automatisierung" action={{ content: "Upgrade", url: "/app/billing" }}>
            <p>Optimiere alle Produkte gleichzeitig \u2014 ein Pro-Feature.</p>
          </Banner>
        )}

        {/* === SEARCH === */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 180px 180px", gap: "12px", background: "#ffffff", borderRadius: "14px", padding: "16px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", border: "1px solid #e4e4e7" }}>
          <TextField label="Suche" value={searchValue} onChange={setSearchValue} placeholder="Produkt, Handle oder Vendor..." clearButton onClearButtonClick={() => setSearchValue("")} autoComplete="off" labelHidden />
          <Select label="Status" labelHidden options={[
            { label: "Alle Status", value: "all" },
            { label: "Exzellent (70+)", value: "excellent" },
            { label: "Optimiert (40+)", value: "optimized" },
            { label: "Ausstehend", value: "pending" },
          ]} value={statusFilter} onChange={setStatusFilter} />
          <Select label="Sortierung" labelHidden options={[
            { label: "Name A-Z", value: "name" },
            { label: "Score hoch \u2192 niedrig", value: "score_desc" },
            { label: "Score niedrig \u2192 hoch", value: "score_asc" },
            { label: "Zuletzt bearbeitet", value: "date" },
          ]} value={sortBy} onChange={setSortBy} />
        </div>

        {(searchValue || statusFilter !== "all") && (
          <InlineStack gap="200" blockAlign="center">
            <Text variant="bodySm" as="span" tone="subdued">{filteredProducts.length} von {totalProducts} Produkten</Text>
            <Button variant="plain" size="slim" onClick={() => { setSearchValue(""); setStatusFilter("all"); }}>Filter zur\u00fccksetzen</Button>
          </InlineStack>
        )}

        {/* === PRODUCT GRID === */}
        {filteredProducts.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "20px" }}>
            {filteredProducts.map((product) => {
              const isOpt = optimizingId === product.shopifyId && optimizeFetcher.state !== "idle";
              const sc = product.geoScore;
              const seoTitleLen = (product.seoTitle || product.title).length;
              const seoDescLen = (product.seoDesc || "").length;

              return (
                <div key={product.id} style={{
                  background: "#ffffff", borderRadius: "16px", overflow: "hidden",
                  border: "1px solid #e4e4e7", boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.02)",
                  display: "flex", flexDirection: "column",
                }}>
                  {/* Image Header */}
                  <div style={{
                    height: "160px", position: "relative", borderBottom: "1px solid #e4e4e7",
                    background: product.image ? `url(${product.image}) center/cover no-repeat` : "linear-gradient(135deg, #f4f4f5, #e4e4e7)",
                  }}>
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.6) 100%)" }} />
                    <div style={{ position: "absolute", top: "12px", left: "12px" }}>
                      <Badge tone={product.status === "ACTIVE" ? "success" : "info"}>{product.status === "ACTIVE" ? "Aktiv" : product.status}</Badge>
                    </div>
                    <div style={{ position: "absolute", top: "10px", right: "10px" }}>
                      <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: sc !== null ? (sc >= 70 ? "#09090b" : sc >= 40 ? "#3f3f46" : "#a1a1aa") : "#e4e4e7", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
                        <span style={{ fontSize: "16px", fontWeight: 800, color: sc !== null ? (sc >= 70 ? "#ffffff" : sc >= 40 ? "#ffffff" : "#ffffff") : "#a1a1aa" }}>{sc !== null ? sc : "\u2014"}</span>
                      </div>
                    </div>
                    <div style={{ position: "absolute", bottom: "12px", left: "14px", right: "14px" }}>
                      <div style={{ fontSize: "15px", fontWeight: 700, color: "white", textShadow: "0 1px 3px rgba(0,0,0,0.5)", lineHeight: 1.3, maxHeight: "40px", overflow: "hidden" }}>{product.title}</div>
                    </div>
                  </div>

                  {/* Body */}
                  <div style={{ padding: "16px 18px", flex: 1, display: "flex", flexDirection: "column", gap: "12px" }}>
                    {/* Score Bar */}
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                        <span style={{ fontSize: "11px", fontWeight: 700, color: scoreColor(sc), textTransform: "uppercase", letterSpacing: "0.5px" }}>{scoreLabel(sc)}</span>
                        <span style={{ fontSize: "11px", fontWeight: 600, color: "#a1a1aa" }}>{sc !== null ? `${sc}/100` : "N/A"}</span>
                      </div>
                      <div style={{ height: "6px", borderRadius: "3px", background: "#f4f4f5", overflow: "hidden" }}>
                        <div style={{ width: sc !== null ? `${sc}%` : "0%", height: "100%", borderRadius: "3px", background: sc !== null ? "linear-gradient(90deg, #3f3f46, #09090b)" : "transparent", transition: "width 0.6s ease" }} />
                      </div>
                    </div>

                    {/* Metadata */}
                    <div style={{ borderTop: "1px solid #f4f4f5", paddingTop: "10px" }}>
                      <DetailRow label="Handle" value={`/${product.handle}`} mono />
                      {product.vendor && <DetailRow label="Vendor" value={product.vendor} />}
                      {product.productType && <DetailRow label="Typ" value={product.productType} />}
                      <DetailRow label="Varianten" value={`${product.variants}`} />
                      <DetailRow label="Aktualisiert" value={new Date(product.updatedAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })} />
                    </div>

                    {/* SEO Indicators */}
                    <div style={{ borderTop: "1px solid #f4f4f5", paddingTop: "10px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                      {[
                        { ok: seoTitleLen > 0 && seoTitleLen <= 60, warn: seoTitleLen > 60, label: "Titel", sub: `${seoTitleLen} Z.` },
                        { ok: seoDescLen >= 50 && seoDescLen <= 160, warn: seoDescLen > 0 && (seoDescLen < 50 || seoDescLen > 160), label: "Meta", sub: `${seoDescLen} Z.` },
                        { ok: sc !== null, warn: false, label: "GEO", sub: sc !== null ? "Aktiv" : "Fehlt" },
                      ].map((ind) => (
                        <div key={ind.label} style={{ textAlign: "center" }}>
                          <div style={{ width: "28px", height: "28px", borderRadius: "8px", margin: "0 auto 4px", background: ind.ok ? "#09090b" : ind.warn ? "#a1a1aa" : "#e4e4e7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", color: ind.ok ? "#ffffff" : ind.warn ? "#ffffff" : "#52525b" }}>
                            {ind.ok ? "\u2713" : ind.warn ? "!" : "\u2717"}
                          </div>
                          <div style={{ fontSize: "9px", fontWeight: 600, color: "#52525b", textTransform: "uppercase" }}>{ind.label}</div>
                          <div style={{ fontSize: "9px", color: "#a1a1aa" }}>{ind.sub}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ flex: 1 }} />

                    {/* Actions */}
                    <div style={{ borderTop: "1px solid #f4f4f5", paddingTop: "14px", display: "flex", flexDirection: "column", gap: "8px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                        <Button variant="primary" size="large" fullWidth onClick={() => handleOptimize(product.shopifyId)} loading={isOpt} disabled={isOpt || limitReached}>
                          {isOpt ? "Optimiert..." : "Optimieren"}
                        </Button>
                        <Button size="large" fullWidth onClick={() => navigate(`/app/products/${product.id}`)}>
                          Details
                        </Button>
                      </div>
                      {/* Context Builder Button */}
                      <button
                        type="button"
                        onClick={() => openBuilder(product)}
                        style={{
                          width: "100%", padding: "10px", borderRadius: "10px", cursor: "pointer",
                          border: "1px dashed #a1a1aa", background: "#f4f4f5",
                          color: "#18181b", fontSize: "12px", fontWeight: 600,
                          display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                          transition: "all 0.2s ease",
                        }}
                      >
                        KI Content Builder starten
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Card><Box padding="800"><BlockStack gap="300" inlineAlign="center">
            <Text variant="headingSm" as="p" alignment="center">Keine Produkte gefunden</Text>
            <Button onClick={() => { setSearchValue(""); setStatusFilter("all"); }}>Filter zur\u00fccksetzen</Button>
          </BlockStack></Box></Card>
        )}

        {/* Pagination */}
        {(pageInfo.hasPreviousPage || pageInfo.hasNextPage) && (
          <div style={{ display: "flex", justifyContent: "center", gap: "16px", padding: "12px 0" }}>
            {pageInfo.hasPreviousPage && <Button url={`/app/products?cursor=${pageInfo.startCursor}&direction=prev`}>Vorherige</Button>}
            <Text variant="bodySm" as="span" tone="subdued">Seite</Text>
            {pageInfo.hasNextPage && <Button url={`/app/products?cursor=${pageInfo.endCursor}&direction=next`}>N\u00e4chste</Button>}
          </div>
        )}
      </BlockStack>

      {/* ===================================
          CONTEXT BUILDER MODAL
         =================================== */}
      <Modal
        open={builderActive}
        onClose={() => { setBuilderActive(false); resetBuilder(); }}
        title={`KI Content Builder \u2014 ${builderProductTitle}`}
        large
        primaryAction={
          builderStep < QUIZ_STEPS.length - 1
            ? { content: "Weiter \u2192", onAction: () => setBuilderStep((s) => s + 1), disabled: !canProceed }
            : { content: isOptimizing ? "KI optimiert..." : "Jetzt optimieren & deployen", onAction: handleBuilderSubmit, loading: isOptimizing, disabled: !canProceed }
        }
        secondaryActions={[
          ...(builderStep > 0 ? [{ content: "\u2190 Zur\u00fcck", onAction: () => setBuilderStep((s) => s - 1) }] : []),
          { content: "Abbrechen", onAction: () => { setBuilderActive(false); resetBuilder(); } },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="500">
            {/* Progress Header */}
            <div style={{
              background: "#f4f4f5", borderRadius: "12px", padding: "16px 20px",
              border: "1px solid #e4e4e7",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <div style={{ display: "flex", gap: "8px" }}>
                  {QUIZ_STEPS.map((_, i) => (
                    <div key={i} style={{
                      width: "32px", height: "32px", borderRadius: "50%",
                      background: i <= builderStep ? "#09090b" : "#ffffff",
                      color: i <= builderStep ? "#ffffff" : "#a1a1aa",
                      border: i <= builderStep ? "none" : "2px solid #e4e4e7",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "13px", fontWeight: 700,
                      transition: "all 0.3s ease",
                    }}>
                      {i < builderStep ? "\u2713" : i + 1}
                    </div>
                  ))}
                </div>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "#18181b" }}>{Math.round(builderProgress)}%</span>
              </div>
              <ProgressBar progress={builderProgress} size="small" tone="primary" />
            </div>

            {/* Step Title */}
            <BlockStack gap="100">
              <Text variant="headingLg" as="h2">{QUIZ_STEPS[builderStep]?.title}</Text>
              <Text variant="bodyMd" tone="subdued">{QUIZ_STEPS[builderStep]?.subtitle}</Text>
            </BlockStack>

            <Divider />

            {/* Step 0: Description + Keywords */}
            {builderStep === 0 && (
              <BlockStack gap="400">
                <div style={{
                  background: "#f4f4f5", borderRadius: "10px", padding: "14px 16px",
                  border: "1px solid #e4e4e7", display: "flex", gap: "10px", alignItems: "flex-start",
                }}>
                  <span style={{ fontSize: "20px", flexShrink: 0 }}>{"\uD83D\uDCA1"}</span>
                  <div>
                    <Text variant="bodySm" fontWeight="semibold" as="p">Warum braucht die KI diese Info?</Text>
                    <Text variant="bodySm" tone="subdued" as="p">
                      Je mehr Kontext du gibst, desto besser wird der generierte Content.
                      Die KI erstellt daraus SEO-optimierte Titel, Beschreibungen und strukturierte Daten.
                    </Text>
                  </div>
                </div>
                <TextField
                  label="Was ist dieses Produkt?"
                  placeholder="z.B. Ein handgefertigter Lederg\u00fcrtel aus italienischem Vollnarbenleder mit Messingschnalle"
                  value={builderData.description}
                  onChange={(v) => setBuilderData((d) => ({ ...d, description: v }))}
                  multiline={3} autoComplete="off"
                  helpText={`${builderData.description.length} Zeichen \u2014 mindestens 10 ben\u00f6tigt`}
                />
                <TextField
                  label="Wichtige Keywords (optional)"
                  placeholder="z.B. Lederg\u00fcrtel, Herreng\u00fcrtel, handgemacht, italienisches Leder"
                  value={builderData.keywords}
                  onChange={(v) => setBuilderData((d) => ({ ...d, keywords: v }))}
                  autoComplete="off"
                  helpText="Kommagetrennte Suchbegriffe, die Kunden verwenden w\u00fcrden"
                />
              </BlockStack>
            )}

            {/* Step 1: USP & Features */}
            {builderStep === 1 && (
              <BlockStack gap="400">
                <div style={{
                  background: "#f4f4f5", borderRadius: "10px", padding: "14px 16px",
                  border: "1px solid #e4e4e7", display: "flex", gap: "10px", alignItems: "flex-start",
                }}>
                  <span style={{ fontSize: "20px", flexShrink: 0 }}>{"\uD83C\uDFAF"}</span>
                  <div>
                    <Text variant="bodySm" fontWeight="semibold" as="p">USP = Dein Wettbewerbsvorteil</Text>
                    <Text variant="bodySm" tone="subdued" as="p">
                      Was macht dein Produkt besser als die Konkurrenz? Material, Herstellung, Haltbarkeit, Design?
                    </Text>
                  </div>
                </div>
                <TextField
                  label="USP \u2014 Was macht dieses Produkt besonders?"
                  placeholder="z.B. Handgen\u00e4ht in einer Manufaktur in der Toskana. 5mm dick. H\u00e4lt ein Leben lang."
                  value={builderData.usp}
                  onChange={(v) => setBuilderData((d) => ({ ...d, usp: v }))}
                  multiline={4} autoComplete="off"
                  helpText="Material, Qualit\u00e4t, Besonderheiten, Vorteile"
                />
              </BlockStack>
            )}

            {/* Step 2: Audience & Vibe */}
            {builderStep === 2 && (
              <BlockStack gap="400">
                <Select
                  label="Prim\u00e4re Zielgruppe"
                  options={AUDIENCE_OPTIONS}
                  value={builderData.audience}
                  onChange={(v) => setBuilderData((d) => ({ ...d, audience: v }))}
                />
                <BlockStack gap="200">
                  <Text variant="bodyMd" fontWeight="semibold">Wie soll das Produkt wirken? (1\u20134 w\u00e4hlen)</Text>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {VIBE_OPTIONS.map((vibe) => {
                      const sel = selectedVibes.includes(vibe);
                      return (
                        <button key={vibe} type="button" onClick={() => {
                          setSelectedVibes((prev) => sel ? prev.filter((v) => v !== vibe) : prev.length < 4 ? [...prev, vibe] : prev);
                        }} style={{
                          padding: "8px 16px", borderRadius: "20px", cursor: "pointer",
                          border: sel ? "2px solid #09090b" : "1px solid #e4e4e7",
                          background: sel ? "#09090b" : "#ffffff",
                          color: sel ? "#ffffff" : "#3f3f46",
                          fontSize: "13px", fontWeight: sel ? 700 : 400,
                          transition: "all 0.15s ease",
                        }}>
                          {sel && "\u2713 "}{vibe}
                        </button>
                      );
                    })}
                  </div>
                  {selectedVibes.length > 0 && (
                    <InlineStack gap="100">
                      <Text variant="bodySm" tone="subdued">Gew\u00e4hlt:</Text>
                      {selectedVibes.map((v) => <Tag key={v} onRemove={() => setSelectedVibes((p) => p.filter((x) => x !== v))}>{v}</Tag>)}
                    </InlineStack>
                  )}
                </BlockStack>

                {/* Preview of what will be sent */}
                <div style={{
                  background: "#f4f4f5", borderRadius: "10px", padding: "14px 16px",
                  border: "1px solid #e4e4e7", marginTop: "8px",
                }}>
                  <Text variant="bodySm" fontWeight="semibold" as="p" tone="subdued">Zusammenfassung f\u00fcr die KI:</Text>
                  <div style={{ marginTop: "8px", fontSize: "12px", color: "#3f3f46", lineHeight: 1.6 }}>
                    <div><strong>Produkt:</strong> {builderProductTitle}</div>
                    <div><strong>Beschreibung:</strong> {builderData.description || "\u2014"}</div>
                    <div><strong>USP:</strong> {builderData.usp || "\u2014"}</div>
                    <div><strong>Zielgruppe:</strong> {builderData.audience || "\u2014"}</div>
                    <div><strong>Vibe:</strong> {selectedVibes.join(", ") || "\u2014"}</div>
                    {builderData.keywords && <div><strong>Keywords:</strong> {builderData.keywords}</div>}
                  </div>
                </div>
              </BlockStack>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
