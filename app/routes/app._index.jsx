import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, Link } from "@remix-run/react";
import {
  Page, BlockStack, Text, Box, Badge, Button, Divider, Banner,
  InlineStack, SkeletonPage, SkeletonBodyText, SkeletonDisplayText,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  // Check onboarding (no server-side redirect — it breaks embedded context)
  const settingsCheck = await prisma.shopSettings.findUnique({ where: { shop } });
  const needsOnboarding = !settingsCheck?.brandVoice;

  // Usage stats
  const usageCount = await prisma.usageTracker.count({ where: { shop } });

  // Check plan from settings or default
  const FREE_LIMIT = 10;

  // Google connection status
  const tokens = await prisma.externalTokens.findUnique({ where: { shop } });
  const googleConnected = !!(tokens?.gscRefresh);

  // Recent optimizations
  const recentOptimizations = await prisma.usageTracker.findMany({
    where: { shop },
    orderBy: { optimizedAt: "desc" },
    take: 5,
  });

  // Unique products optimized
  const uniqueProducts = await prisma.usageTracker.groupBy({
    by: ["productId"],
    where: { shop },
    _count: true,
  });

  // Content versions
  const totalVersions = await prisma.contentVersion.count({ where: { shop } });

  // Fetch product data + GEO scores from Shopify
  let totalProducts = 0;
  let avgGeoScore = 0;
  let productsWithScore = 0;
  let pendingProducts = 0;

  try {
    const response = await admin.graphql(`
      query {
        productsCount { count }
        products(first: 50) {
          nodes {
            metafield(namespace: "custom", key: "geo_score") { value }
          }
        }
      }
    `);
    const data = await response.json();
    totalProducts = data.data?.productsCount?.count || 0;
    const products = data.data?.products?.nodes || [];
    const scores = products
      .map(p => p.metafield?.value ? Number(p.metafield.value) : null)
      .filter(s => s !== null);
    productsWithScore = scores.length;
    avgGeoScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    pendingProducts = totalProducts - productsWithScore;
  } catch (e) {
    console.error("Dashboard product fetch error:", e);
  }

  return json({
    shop,
    needsOnboarding,
    usageCount,
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
  {
    icon: "\u{1F680}",
    iconColor: "purple",
    title: "Produkte optimieren",
    description: "KI-gestützte GEO-Optimierung für maximale AI-Sichtbarkeit",
    href: "/app/products",
    badge: "Free",
    badgeClass: "free",
  },
  {
    icon: "\u{1F50D}",
    iconColor: "blue",
    title: "Keyword-Recherche",
    description: "Relevante Keywords und Suchintentionen entdecken",
    href: "/app/keywords",
    badge: "Free",
    badgeClass: "free",
  },
  {
    icon: "\u{1F3E5}",
    iconColor: "green",
    title: "SEO Health Check",
    description: "Vollständige Analyse deiner Produktseiten",
    href: "/app/health",
    badge: "Free",
    badgeClass: "free",
  },
  {
    icon: "\u{1F5BC}\uFE0F",
    iconColor: "orange",
    title: "Alt-Text Optimizer",
    description: "KI-generierte Bild-Alt-Texte für bessere Barrierefreiheit",
    href: "/app/alt-texts",
    badge: "Free",
    badgeClass: "free",
  },
  {
    icon: "\u{1F3A8}",
    iconColor: "pink",
    title: "Brand Templates",
    description: "Konsistente Inhalte mit wiederverwendbaren Vorlagen",
    href: "/app/templates",
    badge: "Pro",
    badgeClass: "pro",
  },
  {
    icon: "\u{1F4CA}",
    iconColor: "cyan",
    title: "ROI Dashboard",
    description: "Verfolge Impressionen, Klicks und Rankings",
    href: "/app/roi",
    badge: "Pro",
    badgeClass: "pro",
  },
  {
    icon: "\u{1F3C6}",
    iconColor: "orange",
    title: "Wettbewerber-Analyse",
    description: "Vergleiche deine Produkte mit der Konkurrenz",
    href: "/app/competitor",
    badge: "Pro",
    badgeClass: "pro",
  },
  {
    icon: "\u26A1",
    iconColor: "purple",
    title: "Content Audit",
    description: "Qualitätsanalyse aller Produktbeschreibungen",
    href: "/app/content-audit",
    badge: "Pro",
    badgeClass: "pro",
  },
  {
    icon: "\u{1F4DD}",
    iconColor: "blue",
    title: "Meta Generator",
    description: "Bulk Meta-Titel & Beschreibungen generieren",
    href: "/app/meta-generator",
    badge: "Pro",
    badgeClass: "pro",
  },
  {
    icon: "\u{1F517}",
    iconColor: "green",
    title: "Interne Verlinkung",
    description: "Intelligente Verlinkungsvorschläge zwischen Produkten",
    href: "/app/internal-links",
    badge: "Pro",
    badgeClass: "pro",
  },
  {
    icon: "\u{1F4C8}",
    iconColor: "cyan",
    title: "Ranking Tracker",
    description: "Keyword-Positionen verfolgen und überwachen",
    href: "/app/ranking-tracker",
    badge: "Enterprise",
    badgeClass: "enterprise",
  },
  {
    icon: "\u{1F30D}",
    iconColor: "pink",
    title: "Multi-Language",
    description: "Mehrsprachige Optimierung für internationale Märkte",
    href: "/app/multi-lang",
    badge: "Enterprise",
    badgeClass: "enterprise",
  },
];

export default function Dashboard() {
  const data = useLoaderData();
  const navigate = useNavigate();

  // Client-side onboarding redirect (preserves embedded context)
  if (data.needsOnboarding) {
    return (
      <Page>
        <Banner tone="info" title="Onboarding erforderlich">
          <p>Richte zuerst deine Brand DNA ein, um die App nutzen zu können.</p>
        </Banner>
        <div style={{ marginTop: "16px" }}>
          <Button variant="primary" onClick={() => navigate("/app/onboarding")}>
            Jetzt einrichten
          </Button>
        </div>
      </Page>
    );
  }

  return (
    <div className="titan-fade-in">
      <Page>
        <BlockStack gap="600">

          {/* ===== HERO SECTION ===== */}
          <div className="titan-hero" style={{ padding: "32px 28px" }}>
            <div className="titan-hero-content">
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                <span style={{ fontSize: "32px" }}>{"\u26A1"}</span>
                <h1>Titan GEO Core</h1>
              </div>
              <p>
                Deine KI-gestützte Kommandozentrale für Generative Engine Optimization.
                Maximiere die Sichtbarkeit deiner Produkte in ChatGPT, Perplexity, Gemini und allen AI-Suchmaschinen.
              </p>
              <div style={{ marginTop: "16px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <span className="titan-badge free">{"\u2713"} Gemini 2.5 Flash</span>
                <span className="titan-badge pro">{"\u2713"} GEO-Optimierung</span>
                <span className="titan-badge new">{"\u2713"} JSON-LD Schema</span>
              </div>
            </div>
          </div>

          {/* ===== QUICK STATS ROW ===== */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", gap: "20px" }}>
            <div className="titan-metric-card titan-slide-up titan-stagger-1">
              <div className="titan-metric-label">Total Optimierungen</div>
              <div className="titan-metric-value">{data.usageCount}</div>
              <div className="titan-metric-subtitle">
                {data.usageCount >= data.freeLimit
                  ? "Limit erreicht — Upgrade nötig"
                  : `${data.freeLimit - data.usageCount} von ${data.freeLimit} verbleibend`}
              </div>
            </div>
            <div className="titan-metric-card titan-slide-up titan-stagger-2">
              <div className="titan-metric-label">{"\u00D8"} GEO Score</div>
              <div className="titan-metric-value">
                {data.avgGeoScore > 0 ? `${data.avgGeoScore}/100` : "\u2014"}
              </div>
              <div className="titan-metric-subtitle">
                {data.productsWithScore > 0
                  ? `${data.productsWithScore} Produkte bewertet`
                  : "Noch keine Analyse"}
              </div>
            </div>
            <div className="titan-metric-card titan-slide-up titan-stagger-3">
              <div className="titan-metric-label">Produkte</div>
              <div className="titan-metric-value">{data.totalProducts}</div>
              <div className="titan-metric-subtitle">
                {data.pendingProducts > 0
                  ? `${data.pendingProducts} warten auf Optimierung`
                  : "Alle optimiert!"}
              </div>
            </div>
            <div className="titan-metric-card titan-slide-up titan-stagger-4">
              <div className="titan-metric-label">Google Status</div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                <span
                  className={`titan-status-dot ${data.googleConnected ? "online" : "offline"}`}
                />
                <span style={{
                  fontSize: "20px",
                  fontWeight: 800,
                  color: data.googleConnected ? "#10b981" : "#94a3b8"
                }}>
                  {data.googleConnected ? "Verbunden" : "Offline"}
                </span>
              </div>
              <div className="titan-metric-subtitle">
                {data.googleConnected ? "Search Console aktiv" : "Für ROI-Tracking verbinden"}
              </div>
            </div>
          </div>

          {/* ===== FEATURE MODULES GRID ===== */}
          <div>
            <div className="titan-section-header">
              <span className="titan-section-title">Feature-Module</span>
              <span style={{ fontSize: "13px", color: "#94a3b8" }}>
                {features.length} Module verfügbar
              </span>
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
                  <div style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a", marginBottom: "6px" }}>
                    {f.title}
                  </div>
                  <div style={{ fontSize: "13px", color: "#64748b", lineHeight: "1.5" }}>
                    {f.description}
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* ===== PLAN BANNER ===== */}
          <div className="titan-plan-banner">
            <div>
              <div style={{ fontSize: "12px", opacity: 0.7, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>
                Aktueller Plan
              </div>
              <div style={{ fontSize: "22px", fontWeight: 800 }}>
                Starter (Kostenlos)
              </div>
              <div style={{ fontSize: "14px", opacity: 0.8, marginTop: "4px" }}>
                {data.usageCount} / {data.freeLimit} Optimierungen verbraucht
              </div>
            </div>
            <Link to="/app/billing" className="titan-plan-banner-cta">
              Auf Pro upgraden — $39.99/Monat
            </Link>
          </div>

          {/* ===== RECENT ACTIVITY FEED ===== */}
          <div>
            <div className="titan-section-header">
              <span className="titan-section-title">Letzte Aktivitäten</span>
              <span style={{ fontSize: "13px", color: "#94a3b8" }}>
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
                        <div style={{ fontWeight: 600, fontSize: "14px", color: "#0f172a" }}>
                          GEO-Optimierung durchgeführt
                        </div>
                        <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
                          Produkt-ID: {opt.productId.replace("gid://shopify/Product/", "")}
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize: "12px", color: "#94a3b8", whiteSpace: "nowrap" }}>
                      {new Date(opt.optimizedAt).toLocaleDateString("de-DE", {
                        day: "2-digit", month: "2-digit", year: "numeric",
                        hour: "2-digit", minute: "2-digit"
                      })}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ padding: "40px 20px", textAlign: "center" }}>
                  <div style={{ fontSize: "36px", marginBottom: "12px" }}>{"\u{1F680}"}</div>
                  <div style={{ fontWeight: 600, color: "#475569", marginBottom: "8px" }}>
                    Noch keine Optimierungen
                  </div>
                  <div style={{ fontSize: "13px", color: "#94a3b8", marginBottom: "16px" }}>
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
