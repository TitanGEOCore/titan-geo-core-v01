import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, Link } from "@remix-run/react";
import {
  Page, BlockStack, Text, Box, Badge, Button, Divider, Banner,
  InlineStack, Card,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getEffectivePlan } from "../middleware/plan-check.server.js";
import { PLAN_LIMITS } from "../config/limits.server.js";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const settingsCheck = await prisma.shopSettings.findUnique({ where: { shop } });
  const needsOnboarding = !settingsCheck?.brandVoice;

  // Parallel DB queries
  const [usageCount, currentPlan, tokens, recentOptimizations, uniqueProducts, totalVersions] = await Promise.all([
    prisma.usageTracker.count({ where: { shop } }),
    getEffectivePlan(shop, prisma),
    prisma.externalTokens.findUnique({ where: { shop } }),
    prisma.usageTracker.findMany({ where: { shop }, orderBy: { optimizedAt: "desc" }, take: 5 }),
    prisma.usageTracker.groupBy({ by: ["productId"], where: { shop }, _count: true }),
    prisma.contentVersion.count({ where: { shop } }),
  ]);

  const planLimits = PLAN_LIMITS[currentPlan] || PLAN_LIMITS.Starter;
  const geoLimit = planLimits.geo_optimization === -1 ? Infinity : planLimits.geo_optimization;
  const FREE_LIMIT = geoLimit === Infinity ? 999 : geoLimit;
  const googleConnected = !!(tokens?.gscRefresh);

  // Fetch product count + GEO scores in a single paginated pass (max 250 for speed)
  let totalProducts = 0;
  let avgGeoScore = 0;
  let productsWithScore = 0;
  let pendingProducts = 0;

  try {
    const countResponse = await admin.graphql(`query { productsCount { count } }`);
    const countData = await countResponse.json();
    totalProducts = countData.data?.productsCount?.count || 0;

    // Single batch fetch for scores (250 is enough for dashboard overview)
    const response = await admin.graphql(`
      query {
        products(first: 250) {
          nodes {
            metafield(namespace: "custom", key: "geo_score") { value }
          }
        }
      }
    `);
    const data = await response.json();
    const allScores = (data.data?.products?.nodes || [])
      .map(p => p.metafield?.value ? Number(p.metafield.value) : null)
      .filter(s => s !== null);

    productsWithScore = allScores.length;
    avgGeoScore = allScores.length > 0
      ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
      : 0;
    pendingProducts = totalProducts - productsWithScore;
  } catch (e) {
    console.error("Dashboard product fetch error:", e);
  }

  return json({
    shop,
    needsOnboarding,
    usageCount,
    currentPlan,
    freeLimit: FREE_LIMIT,
    googleConnected,
    recentOptimizations,
    uniqueProductsCount: uniqueProducts.length,
    totalVersions,
    totalProducts,
    productsWithScore,
    avgGeoScore,
    pendingProducts,
  });
};

const features = [
  { icon: "\u{1F680}", iconColor: "purple", title: "Produkte optimieren", description: "KI-gest\u00fctzte GEO-Optimierung f\u00fcr maximale AI-Sichtbarkeit", href: "/app/products", badge: "Free", badgeClass: "free" },
  { icon: "\u{1F50D}", iconColor: "blue", title: "Keyword-Recherche", description: "Relevante Keywords und Suchintentionen entdecken", href: "/app/keywords", badge: "Free", badgeClass: "free" },
  { icon: "\u{1F3E5}", iconColor: "green", title: "SEO Health Check", description: "Vollst\u00e4ndige Analyse deiner Produktseiten", href: "/app/health", badge: "Free", badgeClass: "free" },
  { icon: "\u{1F5BC}\uFE0F", iconColor: "orange", title: "Alt-Text Optimizer", description: "KI-generierte Bild-Alt-Texte f\u00fcr bessere Barrierefreiheit", href: "/app/alt-texts", badge: "Free", badgeClass: "free" },
  { icon: "\u{1F3A8}", iconColor: "pink", title: "Brand Templates", description: "Konsistente Inhalte mit wiederverwendbaren Vorlagen", href: "/app/templates", badge: "Pro", badgeClass: "pro" },
  { icon: "\u{1F4CA}", iconColor: "cyan", title: "ROI Dashboard", description: "Verfolge Impressionen, Klicks und Rankings", href: "/app/roi", badge: "Pro", badgeClass: "pro" },
  { icon: "\u{1F3C6}", iconColor: "orange", title: "Wettbewerber-Analyse", description: "Vergleiche deine Produkte mit der Konkurrenz", href: "/app/competitor", badge: "Pro", badgeClass: "pro" },
  { icon: "\u26A1", iconColor: "purple", title: "Content Audit", description: "Qualit\u00e4tsanalyse aller Produktbeschreibungen", href: "/app/content-audit", badge: "Pro", badgeClass: "pro" },
  { icon: "\u{1F4DD}", iconColor: "blue", title: "Meta Generator", description: "Bulk Meta-Titel & Beschreibungen generieren", href: "/app/meta-generator", badge: "Pro", badgeClass: "pro" },
  { icon: "\u{1F517}", iconColor: "green", title: "Interne Verlinkung", description: "Intelligente Verlinkungsvorschl\u00e4ge zwischen Produkten", href: "/app/internal-links", badge: "Pro", badgeClass: "pro" },
  { icon: "\u{1F4C8}", iconColor: "cyan", title: "Ranking Tracker", description: "Keyword-Positionen verfolgen und \u00fcberwachen", href: "/app/ranking-tracker", badge: "Enterprise", badgeClass: "enterprise" },
  { icon: "\u{1F30D}", iconColor: "pink", title: "Multi-Language", description: "Mehrsprachige Optimierung f\u00fcr internationale M\u00e4rkte", href: "/app/multi-lang", badge: "Enterprise", badgeClass: "enterprise" },
];

export default function Dashboard() {
  const data = useLoaderData();
  const navigate = useNavigate();

  if (data.needsOnboarding) {
    return (
      <Page>
        <div className="titan-fade-in" style={{ maxWidth: 540, margin: "80px auto", textAlign: "center" }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: "#09090b", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", fontSize: 28 }}>
            <span style={{ filter: "grayscale(1) brightness(2)" }}>{"\u{1F680}"}</span>
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#09090b", marginBottom: 8, letterSpacing: "-0.5px" }}>Onboarding erforderlich</h2>
          <p style={{ color: "#52525b", fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
            Richte zuerst deine Brand DNA ein, um die App nutzen zu k\u00f6nnen.
          </p>
          <Button variant="primary" onClick={() => navigate("/app/onboarding")}>
            Jetzt einrichten
          </Button>
        </div>
      </Page>
    );
  }

  const planLabel = data.currentPlan === "Starter" ? "Starter (Kostenlos)" : data.currentPlan;
  const planCta = data.currentPlan === "Starter"
    ? { text: "Auf Pro upgraden \u2014 $39.99/Monat", show: true }
    : data.currentPlan === "Growth"
      ? { text: "Auf Pro upgraden", show: true }
      : { text: "", show: false };

  return (
    <div className="titan-fade-in">
      <Page>
        <BlockStack gap="600">

          {/* ===== HERO ===== */}
          <div className="titan-hero">
            <div className="titan-hero-content">
              <InlineStack align="space-between" wrap={false}>
                <div>
                  <h1 className="titan-hero" style={{ background: "transparent", padding: 0, margin: "0 0 8px", border: "none" }}>Titan GEO Core</h1>
                  <p style={{ fontSize: 14, color: "#a1a1aa", margin: 0, lineHeight: 1.6, maxWidth: 600 }}>
                    Deine KI-gest\u00fctzte Kommandozentrale f\u00fcr Generative Engine Optimization.
                    Maximiere die Sichtbarkeit deiner Produkte in ChatGPT, Perplexity, Gemini und allen AI-Suchmaschinen.
                  </p>
                </div>
              </InlineStack>
              <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: 100, background: "rgba(255,255,255,0.06)", color: "#d4d4d8", border: "1px solid rgba(255,255,255,0.08)", letterSpacing: "0.3px", textTransform: "uppercase" }}>Gemini 2.5 Flash</span>
                <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: 100, background: "rgba(255,255,255,0.06)", color: "#d4d4d8", border: "1px solid rgba(255,255,255,0.08)", letterSpacing: "0.3px", textTransform: "uppercase" }}>GEO-Optimierung</span>
                <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: 100, background: "rgba(255,255,255,0.06)", color: "#d4d4d8", border: "1px solid rgba(255,255,255,0.08)", letterSpacing: "0.3px", textTransform: "uppercase" }}>JSON-LD Schema</span>
              </div>
            </div>
          </div>

          {/* ===== QUICK STATS ===== */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", gap: "20px" }}>
            <div className="titan-metric-card">
              <div className="titan-metric-label">Total Optimierungen</div>
              <div className="titan-metric-value">{data.usageCount}</div>
              <div className="titan-metric-subtitle">
                {data.currentPlan === "Pro" || data.currentPlan === "Enterprise" || data.currentPlan === "Admin"
                  ? "Unbegrenzt verf\u00fcgbar"
                  : data.usageCount >= data.freeLimit
                    ? "Limit erreicht \u2014 Upgrade n\u00f6tig"
                    : `${Math.max(0, data.freeLimit - data.usageCount)} von ${data.freeLimit} verbleibend`}
              </div>
            </div>
            <div className="titan-metric-card">
              <div className="titan-metric-label">\u00D8 GEO Score</div>
              <div className="titan-metric-value">
                {data.avgGeoScore > 0 ? `${data.avgGeoScore}/100` : "\u2014"}
              </div>
              <div className="titan-metric-subtitle">
                {data.productsWithScore > 0 ? `${data.productsWithScore} Produkte bewertet` : "Noch keine Analyse"}
              </div>
            </div>
            <div className="titan-metric-card">
              <div className="titan-metric-label">Produkte</div>
              <div className="titan-metric-value">{data.totalProducts}</div>
              <div className="titan-metric-subtitle">
                {data.pendingProducts > 0 ? `${data.pendingProducts} warten auf Optimierung` : "Alle optimiert!"}
              </div>
            </div>
            <div className="titan-metric-card">
              <div className="titan-metric-label">Google Status</div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                <span className={`titan-status-dot ${data.googleConnected ? "online" : "offline"}`} />
                <span style={{ fontSize: "20px", fontWeight: 800, color: data.googleConnected ? "#09090b" : "#a1a1aa" }}>
                  {data.googleConnected ? "Verbunden" : "Offline"}
                </span>
              </div>
              <div className="titan-metric-subtitle">
                {data.googleConnected ? "Search Console aktiv" : "F\u00fcr ROI-Tracking verbinden"}
              </div>
            </div>
          </div>

          {/* ===== FEATURE MODULES ===== */}
          <div>
            <div className="titan-section-header">
              <span className="titan-section-title">Feature-Module</span>
              <span style={{ fontSize: 13, color: "#a1a1aa" }}>{features.length} Module verf\u00fcgbar</span>
            </div>
            <div className="titan-feature-grid">
              {features.map((f, i) => (
                <Link
                  key={f.href}
                  to={f.href}
                  className={`titan-feature-card titan-slide-up titan-stagger-${(i % 6) + 1}`}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <div className="titan-feature-card-header">
                    <div className={`titan-feature-icon ${f.iconColor}`}>
                      {f.icon}
                    </div>
                    <span className={`titan-badge ${f.badgeClass}`}>{f.badge}</span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#09090b", marginBottom: 6 }}>
                    {f.title}
                  </div>
                  <div style={{ fontSize: 13, color: "#52525b", lineHeight: 1.5 }}>
                    {f.description}
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* ===== PLAN BANNER — Dynamic ===== */}
          <div className="titan-plan-banner">
            <div>
              <div style={{ fontSize: 11, opacity: 0.5, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 4 }}>
                Aktueller Plan
              </div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{planLabel}</div>
              <div style={{ fontSize: 14, opacity: 0.6, marginTop: 4 }}>
                {data.currentPlan === "Pro" || data.currentPlan === "Enterprise" || data.currentPlan === "Admin"
                  ? `${data.usageCount} Optimierungen durchgef\u00fchrt`
                  : `${data.usageCount} / ${data.freeLimit} Optimierungen verbraucht`}
              </div>
            </div>
            {planCta.show && (
              <Link to="/app/billing" className="titan-plan-banner-cta">
                {planCta.text}
              </Link>
            )}
          </div>

          {/* ===== ACTIVITY FEED ===== */}
          <div>
            <div className="titan-section-header">
              <span className="titan-section-title">Letzte Aktivit\u00e4ten</span>
              <span style={{ fontSize: 13, color: "#a1a1aa" }}>
                {data.totalVersions} Versionen gespeichert
              </span>
            </div>
            <div className="titan-activity-feed">
              {data.recentOptimizations.length > 0 ? (
                data.recentOptimizations.map((opt) => (
                  <div key={opt.id} className="titan-activity-item">
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <div className="titan-activity-dot" />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14, color: "#09090b" }}>
                          GEO-Optimierung durchgef\u00fchrt
                        </div>
                        <div style={{ fontSize: 12, color: "#a1a1aa", marginTop: 2 }}>
                          {opt.module || "Optimierung"} {opt.productId ? `#${opt.productId.replace("gid://shopify/Product/", "")}` : ""}
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: "#a1a1aa", whiteSpace: "nowrap" }}>
                      {new Date(opt.optimizedAt).toLocaleDateString("de-DE", {
                        day: "2-digit", month: "2-digit", year: "numeric",
                        hour: "2-digit", minute: "2-digit"
                      })}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ padding: "48px 20px", textAlign: "center" }}>
                  <div style={{ width: 56, height: 56, borderRadius: 16, background: "#f4f4f5", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 24 }}>
                    <span style={{ filter: "grayscale(1)" }}>{"\u{1F680}"}</span>
                  </div>
                  <div style={{ fontWeight: 600, color: "#3f3f46", marginBottom: 8 }}>
                    Noch keine Optimierungen
                  </div>
                  <div style={{ fontSize: 13, color: "#a1a1aa", marginBottom: 16 }}>
                    Starte jetzt deine erste GEO-Optimierung
                  </div>
                  <Button variant="primary" url="/app/products">Erste Optimierung starten</Button>
                </div>
              )}
            </div>
          </div>

        </BlockStack>
      </Page>
    </div>
  );
}
