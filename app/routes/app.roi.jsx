import { json } from "@remix-run/node";
import { useLoaderData, useNavigation, Link } from "@remix-run/react";
import {
  Page, Layout, Card, Text, BlockStack, InlineGrid, Badge, Banner,
  EmptyState, SkeletonPage, SkeletonBodyText, Box, InlineStack, Divider,
  Button, Collapsible, Icon, ProgressBar,
} from "@shopify/polaris";
import { ChevronDownIcon, ChevronUpIcon } from "@shopify/polaris-icons";
import { useState, useCallback, useMemo } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

/**
 * ──────────────────────────────────────────────
 *  CONSTANTS — Industry average benchmarks
 * ──────────────────────────────────────────────
 */
const AVG_CPC_EUR = 0.45;
const AVG_TRAFFIC_INCREASE_PERCENT = 10;
const AVG_CTR_ORGANIC = 3.5;
const AVG_IMPRESSIONS_PER_PRODUCT = 150;
const CONVERSION_RATE = 2.5;
const AVG_ORDER_VALUE_EUR = 65;

/**
 * ──────────────────────────────────────────────
 *  LOADER
 * ──────────────────────────────────────────────
 */
export const loader = async ({ request }) => {
  try {
    const { admin, session } = await authenticate.admin(request);
    const shop = session.shop;

    // Google connection check
    const tokens = await prisma.externalTokens.findUnique({ where: { shop } });
    const googleConnected = !!tokens?.gscRefresh;

    // ── Optimization History ──
    const allOptimizations = await prisma.usageTracker.findMany({
      where: { shop },
      orderBy: { optimizedAt: "desc" },
    });

    const totalOptimizations = allOptimizations.length;

    // Unique products optimized
    const uniqueProductIds = [...new Set(allOptimizations.map((o) => o.productId))];
    const uniqueProductCount = uniqueProductIds.length;

    // ── Timeline: group by week ──
    const weeklyMap = {};
    const dailyMap = {};
    allOptimizations.forEach((opt) => {
      const d = new Date(opt.optimizedAt);
      // Weekly key (ISO week start)
      const dayOfWeek = d.getDay();
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - dayOfWeek);
      const weekKey = weekStart.toISOString().split("T")[0];
      weeklyMap[weekKey] = (weeklyMap[weekKey] || 0) + 1;

      // Daily key
      const dayKey = d.toISOString().split("T")[0];
      dailyMap[dayKey] = (dailyMap[dayKey] || 0) + 1;
    });

    // Last 12 weeks timeline
    const weeklyTimeline = Object.entries(weeklyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([week, count]) => ({ week, count }));

    // Last 30 days timeline
    const dailyTimeline = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-30)
      .map(([day, count]) => ({ day, count }));

    // ── Product count from Shopify ──
    let totalProducts = 0;
    let productsWithGeoScore = 0;
    try {
      const countRes = await admin.graphql(`
        query {
          productsCount { count }
          products(first: 50) {
            nodes {
              id
              title
              handle
              metafield(namespace: "custom", key: "geo_score") { value }
            }
          }
        }
      `);
      const countData = await countRes.json();
      totalProducts = countData.data?.productsCount?.count || 0;
      const prods = countData.data?.products?.nodes || [];
      productsWithGeoScore = prods.filter((p) => p.metafield?.value).length;
    } catch (_) { /* ignore */ }

    const coveragePercent = totalProducts > 0
      ? Math.round((uniqueProductCount / totalProducts) * 100)
      : 0;

    // ── ROI Projections (based on industry averages) ──
    const estimatedMonthlyImpressions = uniqueProductCount * AVG_IMPRESSIONS_PER_PRODUCT;
    const estimatedTrafficIncrease = Math.round(estimatedMonthlyImpressions * (AVG_TRAFFIC_INCREASE_PERCENT / 100));
    const estimatedAdditionalClicks = Math.round(estimatedMonthlyImpressions * (AVG_CTR_ORGANIC / 100) * (AVG_TRAFFIC_INCREASE_PERCENT / 100));
    const estimatedTrafficValue = Math.round(estimatedAdditionalClicks * AVG_CPC_EUR);
    const estimatedRevenueImpact = Math.round(estimatedAdditionalClicks * (CONVERSION_RATE / 100) * AVG_ORDER_VALUE_EUR);

    // ── Recent optimizations with product info ──
    const recentOpts = allOptimizations.slice(0, 10);
    const recentProducts = [];
    for (const opt of recentOpts) {
      try {
        const pRes = await admin.graphql(`
          query getProduct($id: ID!) {
            product(id: $id) {
              title
              handle
              featuredImage { url }
              metafield(namespace: "custom", key: "geo_score") { value }
            }
          }
        `, { variables: { id: opt.productId } });
        const pData = await pRes.json();
        const p = pData.data?.product;
        if (p) {
          recentProducts.push({
            id: opt.productId.replace("gid://shopify/Product/", ""),
            gid: opt.productId,
            title: p.title,
            handle: p.handle,
            thumb: p.featuredImage?.url ? p.featuredImage.url.replace(/\?.*/, "") + "?width=40" : null,
            geoScore: p.metafield?.value ? Number(p.metafield.value) : null,
            optimizedAt: opt.optimizedAt,
          });
        }
      } catch (_) { /* skip */ }
    }

    // ── GSC data if connected ──
    let gscData = null;
    if (googleConnected && uniqueProductIds.length > 0) {
      try {
        const { fetchGscData } = await import("../services/google/api.server");
        const gscProducts = [];
        let gscTotalImpressions = 0;
        let gscTotalClicks = 0;

        for (const pid of uniqueProductIds.slice(0, 20)) {
          try {
            const pRes = await admin.graphql(`
              query getProduct($id: ID!) {
                product(id: $id) { title handle onlineStoreUrl }
              }
            `, { variables: { id: pid } });
            const pData = await pRes.json();
            const product = pData.data?.product;
            if (!product?.onlineStoreUrl) continue;

            const gsc = await fetchGscData(
              shop,
              product.onlineStoreUrl.split("/products/")[0],
              product.onlineStoreUrl,
            );

            gscTotalImpressions += gsc.impressions;
            gscTotalClicks += gsc.clicks;

            gscProducts.push({
              title: product.title,
              handle: product.handle,
              impressions: gsc.impressions,
              clicks: gsc.clicks,
              ctr: gsc.ctr,
              position: gsc.position,
            });
          } catch (_) { /* skip product */ }
        }

        const avgCtr = gscTotalClicks > 0 && gscTotalImpressions > 0
          ? ((gscTotalClicks / gscTotalImpressions) * 100).toFixed(2)
          : "0";

        gscData = {
          products: gscProducts,
          totalImpressions: gscTotalImpressions,
          totalClicks: gscTotalClicks,
          avgCtr,
        };
      } catch (_) { /* GSC fetch failed */ }
    }

    // ── Content versions (before/after data) ──
    const contentVersions = await prisma.contentVersion.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    return json({
      googleConnected,
      totalOptimizations,
      uniqueProductCount,
      totalProducts,
      productsWithGeoScore,
      coveragePercent,
      weeklyTimeline,
      dailyTimeline,
      recentProducts,
      gscData,
      contentVersions: contentVersions.length,
      projections: {
        estimatedMonthlyImpressions,
        estimatedTrafficIncrease,
        estimatedAdditionalClicks,
        estimatedTrafficValue,
        estimatedRevenueImpact,
        avgCpcEur: AVG_CPC_EUR,
        avgTrafficIncrease: AVG_TRAFFIC_INCREASE_PERCENT,
      },
    });
  } catch (error) {
    console.error("ROI loader error:", error);
    return json({
      googleConnected: false, totalOptimizations: 0, uniqueProductCount: 0,
      totalProducts: 0, productsWithGeoScore: 0, coveragePercent: 0,
      weeklyTimeline: [], dailyTimeline: [], recentProducts: [],
      gscData: null, contentVersions: 0,
      projections: {
        estimatedMonthlyImpressions: 0, estimatedTrafficIncrease: 0,
        estimatedAdditionalClicks: 0, estimatedTrafficValue: 0,
        estimatedRevenueImpact: 0, avgCpcEur: 0, avgTrafficIncrease: 0,
      },
      error: "Fehler beim Laden der ROI-Daten.",
    });
  }
};

/**
 * ──────────────────────────────────────────────
 *  METRIC CARD — Enhanced version
 * ──────────────────────────────────────────────
 */
function MetricCardEnhanced({ title, value, subtitle, icon, color = "#6366f1", prefix, suffix }) {
  return (
    <Card>
      <BlockStack gap="200">
        <InlineStack gap="200" blockAlign="center">
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: `${color}12`, display: "flex",
            alignItems: "center", justifyContent: "center",
            fontSize: "14px", fontWeight: 700, color,
            border: `1px solid ${color}20`,
          }}>
            {icon}
          </div>
          <Text variant="bodySm" as="p" tone="subdued">{title}</Text>
        </InlineStack>
        <Text variant="headingXl" as="p" fontWeight="bold">
          {prefix}{value}{suffix}
        </Text>
        {subtitle && (
          <Text variant="bodySm" as="p" tone="subdued">{subtitle}</Text>
        )}
      </BlockStack>
    </Card>
  );
}

/**
 * ──────────────────────────────────────────────
 *  CSS BAR CHART — Weekly optimization timeline
 * ──────────────────────────────────────────────
 */
function BarChart({ data, labelKey, valueKey, height = 160 }) {
  const maxVal = Math.max(...data.map((d) => d[valueKey]), 1);

  return (
    <div style={{
      display: "flex", alignItems: "flex-end", gap: "4px",
      height: height, padding: "0 4px",
    }}>
      {data.map((item, idx) => {
        const barHeight = Math.max(4, (item[valueKey] / maxVal) * (height - 28));
        const isLast = idx === data.length - 1;
        const label = item[labelKey];
        const shortLabel = typeof label === "string" && label.length > 5
          ? label.slice(5) // remove year prefix for display
          : label;

        return (
          <div
            key={idx}
            style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "flex-end", gap: "4px",
            }}
            title={`${label}: ${item[valueKey]} Optimierungen`}
          >
            <Text variant="bodySm" fontWeight="medium" tone={isLast ? "success" : "subdued"}>
              {item[valueKey] > 0 ? item[valueKey] : ""}
            </Text>
            <div style={{
              width: "100%", maxWidth: 40,
              height: barHeight,
              borderRadius: "6px 6px 2px 2px",
              background: isLast
                ? "linear-gradient(180deg, #6366f1, #818cf8)"
                : "linear-gradient(180deg, #e2e8f0, #cbd5e1)",
              transition: "height 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
              minHeight: 4,
            }} />
            <Text variant="bodySm" tone="subdued" alignment="center">
              {shortLabel}
            </Text>
          </div>
        );
      })}
    </div>
  );
}

/**
 * ──────────────────────────────────────────────
 *  PROGRESS RING — Small animated ring
 * ──────────────────────────────────────────────
 */
function ProgressRing({ value, max, size = 80, color = "#6366f1" }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={8} />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={8}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)" }}
        />
      </svg>
      <div style={{
        position: "absolute", top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        fontWeight: 800, fontSize: "16px", color,
      }}>
        {pct}%
      </div>
    </div>
  );
}

/**
 * ──────────────────────────────────────────────
 *  HORIZONTAL PROGRESS BAR — CSS-only chart
 * ──────────────────────────────────────────────
 */
function HorizontalBar({ label, value, maxValue, color = "#6366f1", suffix = "" }) {
  const pct = maxValue > 0 ? Math.min(100, (value / maxValue) * 100) : 0;
  return (
    <div style={{ marginBottom: 8 }}>
      <InlineStack align="space-between" blockAlign="center">
        <Text variant="bodySm">{label}</Text>
        <Text variant="bodySm" fontWeight="semibold">{value.toLocaleString("de-DE")}{suffix}</Text>
      </InlineStack>
      <div style={{
        height: 8, borderRadius: 4, background: "#f1f5f9",
        marginTop: 4, overflow: "hidden",
      }}>
        <div style={{
          height: "100%", borderRadius: 4,
          background: `linear-gradient(90deg, ${color}, ${color}cc)`,
          width: `${pct}%`,
          transition: "width 1s cubic-bezier(0.4, 0, 0.2, 1)",
        }} />
      </div>
    </div>
  );
}

/**
 * ──────────────────────────────────────────────
 *  MAIN COMPONENT
 * ──────────────────────────────────────────────
 */
export default function ROI() {
  const {
    googleConnected, totalOptimizations, uniqueProductCount, totalProducts,
    productsWithGeoScore, coveragePercent, weeklyTimeline, dailyTimeline,
    recentProducts, gscData, contentVersions, projections, error,
  } = useLoaderData();

  const navigation = useNavigation();
  const [showProjectionDetails, setShowProjectionDetails] = useState(false);
  const [showTimeline, setShowTimeline] = useState(true);

  if (navigation.state === "loading") {
    return (
      <SkeletonPage title="ROI Dashboard">
        <Layout>
          <Layout.Section>
            <Card><SkeletonBodyText lines={12} /></Card>
          </Layout.Section>
        </Layout>
      </SkeletonPage>
    );
  }

  if (error) {
    return (
      <Page title="ROI Dashboard" backAction={{ content: "Dashboard", url: "/app" }}>
        <Banner tone="critical" title="Fehler"><p>{error}</p></Banner>
      </Page>
    );
  }

  // No optimizations yet — show onboarding-style page
  if (totalOptimizations === 0) {
    return (
      <Page title="ROI Dashboard" subtitle="Return on Investment deiner SEO-Optimierungen" backAction={{ content: "Dashboard", url: "/app" }}>
        <BlockStack gap="600">
          <Card>
            <EmptyState
              heading="Starte mit deiner ersten Optimierung"
              action={{ content: "Produkte optimieren", url: "/app/products" }}
              secondaryAction={!googleConnected ? { content: "Google verbinden", url: "/app/settings#google" } : undefined}
            >
              <p>
                Optimiere deine Produkte für KI-Suchmaschinen und verfolge hier den
                geschätzten ROI. Basierend auf Branchen-Durchschnittswerten berechnen wir
                den Wert jeder Optimierung.
              </p>
            </EmptyState>
          </Card>

          {/* Show what they'd get */}
          <Card>
            <BlockStack gap="400">
              <Text variant="headingSm" as="h2">Was du hier sehen wirst</Text>
              <Divider />
              <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
                {[
                  { title: "Optimierungs-Übersicht", desc: "Gesamtzahl und Abdeckung deiner Optimierungen" },
                  { title: "Traffic-Projektionen", desc: "Geschätzter Traffic-Zuwachs basierend auf Branchen-Daten" },
                  { title: "Umsatz-Prognose", desc: "Hochrechnung des erwarteten Mehrumsatzes" },
                  { title: "Zeitlicher Verlauf", desc: "Wöchentliche Optimierungs-Aktivität im Diagramm" },
                ].map((item) => (
                  <Box key={item.title} padding="300" background="bg-surface-secondary" borderRadius="200">
                    <BlockStack gap="100">
                      <Text variant="bodyMd" fontWeight="semibold">{item.title}</Text>
                      <Text variant="bodySm" tone="subdued">{item.desc}</Text>
                    </BlockStack>
                  </Box>
                ))}
              </InlineGrid>
            </BlockStack>
          </Card>
        </BlockStack>
      </Page>
    );
  }

  const maxWeekly = weeklyTimeline.length > 0 ? Math.max(...weeklyTimeline.map((w) => w.count)) : 1;

  return (
      <Page
        title="ROI Dashboard"
        subtitle="Return on Investment deiner GEO-Optimierungen"
        backAction={{ content: "Dashboard", url: "/app" }}
      >
        <BlockStack gap="600">

          {/* ── Google CTA Banner ── */}
          {!googleConnected && (
            <Banner
              tone="warning"
              title="Google Search Console verbinden"
              action={{ content: "Google verbinden", url: "/app/settings#google" }}
            >
              <p>
                Verbinde Google Search Console fürechte Impressionen, Klicks und Ranking-Daten.
                Ohne Google-Verbindung siehst du nur geschätzte Werte basierend auf Branchen-Durchschnittswerten.
              </p>
            </Banner>
          )}

          {/* ── Key Metrics ── */}
          <InlineGrid columns={{ xs: 2, sm: 4 }} gap="400">
            <MetricCardEnhanced
              title="Optimierungen gesamt"
              value={totalOptimizations.toLocaleString("de-DE")}
              subtitle={`${uniqueProductCount} Produkte optimiert`}
              icon="O"
              color="#6366f1"
            />
            <MetricCardEnhanced
              title="Geschätzter Traffic-Zuwachs"
              value={`+${projections.estimatedAdditionalClicks.toLocaleString("de-DE")}`}
              subtitle="Zusätzliche Klicks / Monat"
              icon="T"
              color="#06b6d4"
            />
            <MetricCardEnhanced
              title="Geschätzter Umsatz-Impact"
              value={projections.estimatedRevenueImpact.toLocaleString("de-DE")}
              prefix=""
              suffix=" EUR"
              subtitle="Pro Monat (Projektion)"
              icon="U"
              color="#10b981"
            />
            <MetricCardEnhanced
              title="Optimierungs-Abdeckung"
              value={`${coveragePercent}%`}
              subtitle={`${uniqueProductCount} von ${totalProducts} Produkten`}
              icon="A"
              color="#8b5cf6"
            />
          </InlineGrid>

          {/* ── Coverage Progress ── */}
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingSm" as="h2">Optimierungs-Abdeckung</Text>
                <Badge tone={coveragePercent >= 80 ? "success" : coveragePercent >= 40 ? "warning" : "critical"}>
                  {coveragePercent}%
                </Badge>
              </InlineStack>
              <ProgressBar progress={coveragePercent} tone={coveragePercent >= 80 ? "success" : coveragePercent >= 40 ? "warning" : "critical"} size="small" />
              <InlineGrid columns={{ xs: 1, sm: 3 }} gap="300">
                <HorizontalBar label="GEO-optimiert" value={productsWithGeoScore} maxValue={totalProducts} color="#10b981" />
                <HorizontalBar label="Mindestens 1x optimiert" value={uniqueProductCount} maxValue={totalProducts} color="#6366f1" />
                <HorizontalBar label="Noch ausstehend" value={Math.max(0, totalProducts - uniqueProductCount)} maxValue={totalProducts} color="#ef4444" />
              </InlineGrid>
              {coveragePercent < 100 && (
                <InlineStack gap="200">
                  <Link to="/app/products">
                    <Button variant="primary">
                      Weitere {totalProducts - uniqueProductCount} Produkte optimieren
                    </Button>
                  </Link>
                </InlineStack>
              )}
            </BlockStack>
          </Card>

          {/* ── ROI Projections ── */}
          <Card>
            <BlockStack gap="400">
              <div
                onClick={() => setShowProjectionDetails((v) => !v)}
                style={{ cursor: "pointer" }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setShowProjectionDetails((v) => !v); }}
              >
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <Text variant="headingSm" as="h2">ROI-Projektion</Text>
                    <Badge tone="info">Geschätzt</Badge>
                  </InlineStack>
                  <Icon source={showProjectionDetails ? ChevronUpIcon : ChevronDownIcon} />
                </InlineStack>
              </div>
              <Divider />

              {/* Main projection summary */}
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "16px",
              }}>
                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="200">
                    <Text variant="bodySm" tone="subdued">Monatliche Impressionen</Text>
                    <Text variant="headingLg" fontWeight="bold">
                      {projections.estimatedMonthlyImpressions.toLocaleString("de-DE")}
                    </Text>
                    <Text variant="bodySm" tone="subdued">
                      ~{AVG_IMPRESSIONS_PER_PRODUCT} pro optimiertem Produkt
                    </Text>
                  </BlockStack>
                </Box>
                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="200">
                    <Text variant="bodySm" tone="subdued">Traffic-Wert (CPC-Basis)</Text>
                    <Text variant="headingLg" fontWeight="bold">
                      {projections.estimatedTrafficValue.toLocaleString("de-DE")} EUR / Monat
                    </Text>
                    <Text variant="bodySm" tone="subdued">
                      Bei durchschn. {AVG_CPC_EUR.toFixed(2)} EUR CPC
                    </Text>
                  </BlockStack>
                </Box>
                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="200">
                    <Text variant="bodySm" tone="subdued">Umsatz-Projektion</Text>
                    <Text variant="headingLg" fontWeight="bold" tone="success">
                      +{projections.estimatedRevenueImpact.toLocaleString("de-DE")} EUR / Monat
                    </Text>
                    <Text variant="bodySm" tone="subdued">
                      Bei {CONVERSION_RATE}% CR und {AVG_ORDER_VALUE_EUR} EUR AOV
                    </Text>
                  </BlockStack>
                </Box>
              </div>

              <Collapsible open={showProjectionDetails} id="projection-details">
                <Box paddingBlockStart="300">
                  <BlockStack gap="300">
                    <Text variant="headingSm" as="h3">Berechnungsgrundlage</Text>
                    <div style={{
                      background: "#f8fafc", borderRadius: 12, padding: 16,
                      border: "1px solid #e2e8f0",
                    }}>
                      <BlockStack gap="200">
                        <InlineStack align="space-between">
                          <Text variant="bodySm">Optimierte Produkte</Text>
                          <Text variant="bodySm" fontWeight="semibold">{uniqueProductCount}</Text>
                        </InlineStack>
                        <InlineStack align="space-between">
                          <Text variant="bodySm">Durchschn. Impressionen / Produkt / Monat</Text>
                          <Text variant="bodySm" fontWeight="semibold">{AVG_IMPRESSIONS_PER_PRODUCT}</Text>
                        </InlineStack>
                        <InlineStack align="space-between">
                          <Text variant="bodySm">Geschätzter Traffic-Zuwachs durch Optimierung</Text>
                          <Text variant="bodySm" fontWeight="semibold">+{AVG_TRAFFIC_INCREASE_PERCENT}%</Text>
                        </InlineStack>
                        <InlineStack align="space-between">
                          <Text variant="bodySm">Organische CTR (Branchendurchschnitt)</Text>
                          <Text variant="bodySm" fontWeight="semibold">{AVG_CTR_ORGANIC}%</Text>
                        </InlineStack>
                        <InlineStack align="space-between">
                          <Text variant="bodySm">Durchschn. CPC (Google Ads Referenz)</Text>
                          <Text variant="bodySm" fontWeight="semibold">{AVG_CPC_EUR.toFixed(2)} EUR</Text>
                        </InlineStack>
                        <InlineStack align="space-between">
                          <Text variant="bodySm">Conversion-Rate (E-Commerce Durchschnitt)</Text>
                          <Text variant="bodySm" fontWeight="semibold">{CONVERSION_RATE}%</Text>
                        </InlineStack>
                        <InlineStack align="space-between">
                          <Text variant="bodySm">Durchschn. Bestellwert (AOV)</Text>
                          <Text variant="bodySm" fontWeight="semibold">{AVG_ORDER_VALUE_EUR} EUR</Text>
                        </InlineStack>
                        <Divider />
                        <InlineStack align="space-between">
                          <Text variant="bodySm" fontWeight="bold">Resultat: Geschätzter Mehrumsatz</Text>
                          <Text variant="bodySm" fontWeight="bold" tone="success">
                            +{projections.estimatedRevenueImpact.toLocaleString("de-DE")} EUR / Monat
                          </Text>
                        </InlineStack>
                      </BlockStack>
                    </div>
                    <Text variant="bodySm" tone="subdued">
                      Hinweis: Projektionen basieren auf Branchen-Durchschnittswerten fürE-Commerce.
                      Tatsaechliche Ergebnisse können je nach Branche, Wettbewerb und Suchvolumen variieren.
                      Verbinde Google Search Console fürechte Performance-Daten.
                    </Text>
                  </BlockStack>
                </Box>
              </Collapsible>
            </BlockStack>
          </Card>

          {/* ── Weekly Timeline Chart ── */}
          {weeklyTimeline.length > 1 && (
            <Card>
              <BlockStack gap="400">
                <div
                  onClick={() => setShowTimeline((v) => !v)}
                  style={{ cursor: "pointer" }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setShowTimeline((v) => !v); }}
                >
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingSm" as="h2">Optimierungs-Verlauf (Wöchentlich)</Text>
                    <InlineStack gap="200" blockAlign="center">
                      <Badge>{weeklyTimeline.reduce((s, w) => s + w.count, 0)} gesamt</Badge>
                      <Icon source={showTimeline ? ChevronUpIcon : ChevronDownIcon} />
                    </InlineStack>
                  </InlineStack>
                </div>
                <Collapsible open={showTimeline} id="timeline-chart">
                  <Box paddingBlockStart="200">
                    <BarChart data={weeklyTimeline} labelKey="week" valueKey="count" height={180} />
                    <Box paddingBlockStart="200">
                      <Text variant="bodySm" tone="subdued" alignment="center">
                        Optimierungen pro Woche (letzte {weeklyTimeline.length} Wochen)
                      </Text>
                    </Box>
                  </Box>
                </Collapsible>
              </BlockStack>
            </Card>
          )}

          {/* ── Recent Optimizations ── */}
          {recentProducts.length > 0 && (
            <Card>
              <BlockStack gap="400">
                <Text variant="headingSm" as="h2">Letzte Optimierungen</Text>
                <Divider />
                <BlockStack gap="200">
                  {recentProducts.map((product, idx) => (
                    <div key={`${product.id}-${idx}`} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "8px 0", borderBottom: idx < recentProducts.length - 1 ? "1px solid #f1f5f9" : "none",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: 0 }}>
                        {product.thumb && (
                          <img
                            src={product.thumb}
                            alt=""
                            style={{
                              width: 36, height: 36, borderRadius: 8,
                              objectFit: "cover", border: "1px solid #e2e8f0",
                            }}
                          />
                        )}
                        <div style={{ minWidth: 0 }}>
                          <Link to={`/app/products/${product.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                            <Text variant="bodyMd" fontWeight="medium" truncate>{product.title}</Text>
                          </Link>
                          <Text variant="bodySm" tone="subdued">
                            {new Date(product.optimizedAt).toLocaleDateString("de-DE", {
                              day: "2-digit", month: "2-digit", year: "numeric",
                              hour: "2-digit", minute: "2-digit",
                            })}
                          </Text>
                        </div>
                      </div>
                      <InlineStack gap="200" blockAlign="center">
                        {product.geoScore !== null && (
                          <Badge tone={product.geoScore >= 70 ? "success" : product.geoScore >= 40 ? "warning" : "critical"}>
                            Score: {product.geoScore}
                          </Badge>
                        )}
                        <Link to={`/app/products/${product.id}`}>
                          <Button size="slim" variant="plain">Anzeigen</Button>
                        </Link>
                      </InlineStack>
                    </div>
                  ))}
                </BlockStack>
              </BlockStack>
            </Card>
          )}

          {/* ── GSC Real Data (if connected) ── */}
          {gscData && gscData.products.length > 0 && (
            <Card>
              <BlockStack gap="400">
                <InlineStack gap="200" blockAlign="center">
                  <Text variant="headingSm" as="h2">Google Search Console Daten</Text>
                  <Badge tone="success">Echte Daten</Badge>
                </InlineStack>
                <Divider />

                <InlineGrid columns={{ xs: 1, sm: 3 }} gap="300">
                  <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                    <BlockStack gap="100">
                      <Text variant="bodySm" tone="subdued">Impressionen (28 Tage)</Text>
                      <Text variant="headingLg" fontWeight="bold">
                        {gscData.totalImpressions.toLocaleString("de-DE")}
                      </Text>
                    </BlockStack>
                  </Box>
                  <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                    <BlockStack gap="100">
                      <Text variant="bodySm" tone="subdued">Klicks (28 Tage)</Text>
                      <Text variant="headingLg" fontWeight="bold" tone="success">
                        {gscData.totalClicks.toLocaleString("de-DE")}
                      </Text>
                    </BlockStack>
                  </Box>
                  <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                    <BlockStack gap="100">
                      <Text variant="bodySm" tone="subdued">Durchschn. CTR</Text>
                      <Text variant="headingLg" fontWeight="bold">
                        {gscData.avgCtr}%
                      </Text>
                    </BlockStack>
                  </Box>
                </InlineGrid>

                {/* Per-product GSC bars */}
                <BlockStack gap="200">
                  {gscData.products.slice(0, 10).map((p, idx) => (
                    <HorizontalBar
                      key={idx}
                      label={p.title.length > 40 ? p.title.slice(0, 40) + "..." : p.title}
                      value={p.clicks}
                      maxValue={Math.max(...gscData.products.map((x) => x.clicks), 1)}
                      color="#6366f1"
                      suffix=" Klicks"
                    />
                  ))}
                </BlockStack>
              </BlockStack>
            </Card>
          )}

          {/* ── What-If Scenario ── */}
          <Card>
            <BlockStack gap="400">
              <Text variant="headingSm" as="h2">Was wäre wenn: 100% Abdeckung</Text>
              <Divider />
              <Text variant="bodyMd" tone="subdued">
                Wenn alle {totalProducts} Produkte optimiert wären (statt aktuell {uniqueProductCount}):
              </Text>
              <InlineGrid columns={{ xs: 1, sm: 3 }} gap="300">
                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="100">
                    <Text variant="bodySm" tone="subdued">Monatliche Impressionen</Text>
                    <Text variant="headingLg" fontWeight="bold">
                      {(totalProducts * AVG_IMPRESSIONS_PER_PRODUCT).toLocaleString("de-DE")}
                    </Text>
                    <Text variant="bodySm" tone="success">
                      +{((totalProducts - uniqueProductCount) * AVG_IMPRESSIONS_PER_PRODUCT).toLocaleString("de-DE")} mehr
                    </Text>
                  </BlockStack>
                </Box>
                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="100">
                    <Text variant="bodySm" tone="subdued">Geschätzter Mehrumsatz</Text>
                    <Text variant="headingLg" fontWeight="bold" tone="success">
                      +{Math.round(
                        totalProducts * AVG_IMPRESSIONS_PER_PRODUCT *
                        (AVG_CTR_ORGANIC / 100) * (AVG_TRAFFIC_INCREASE_PERCENT / 100) *
                        (CONVERSION_RATE / 100) * AVG_ORDER_VALUE_EUR
                      ).toLocaleString("de-DE")} EUR
                    </Text>
                    <Text variant="bodySm" tone="subdued">Pro Monat (Projektion)</Text>
                  </BlockStack>
                </Box>
                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="100">
                    <Text variant="bodySm" tone="subdued">Traffic-Wert</Text>
                    <Text variant="headingLg" fontWeight="bold">
                      {Math.round(
                        totalProducts * AVG_IMPRESSIONS_PER_PRODUCT *
                        (AVG_CTR_ORGANIC / 100) * (AVG_TRAFFIC_INCREASE_PERCENT / 100) * AVG_CPC_EUR
                      ).toLocaleString("de-DE")} EUR
                    </Text>
                    <Text variant="bodySm" tone="subdued">CPC-Äquivalent / Monat</Text>
                  </BlockStack>
                </Box>
              </InlineGrid>
              {coveragePercent < 100 && (
                <InlineStack gap="200">
                  <Link to="/app/products">
                    <Button variant="primary">Alle Produkte optimieren</Button>
                  </Link>
                </InlineStack>
              )}
            </BlockStack>
          </Card>

          {/* ── Footer Info ── */}
          <Banner tone="info">
            <p>
              {googleConnected
                ? "Die GSC-Daten umfassen die letzten 28 Tage. Es kann bis zu 48 Stunden dauern, bis neue Optimierungen sichtbar sind."
                : "Alle Projektionen basieren auf Branchen-Durchschnittswerten. Fürechte Performance-Daten verbinde Google Search Console in den Einstellungen."
              }
              {" "}Geschätzte Werte dienen als Orientierung und können von tatsächlichen Ergebnissen abweichen.
            </p>
          </Banner>
        </BlockStack>
      </Page>
  );
}
