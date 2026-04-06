import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import {
  Page, Card, Text, BlockStack, InlineStack, Badge, Box, Divider,
  ProgressBar, Banner, Button, Collapsible, Icon, InlineGrid, Tooltip,
} from "@shopify/polaris";
import { ChevronDownIcon, ChevronUpIcon } from "@shopify/polaris-icons";
import { useState, useCallback, useMemo } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

/**
 * ──────────────────────────────────────────────
 *  LOADER — Server-side SEO Health Analysis
 * ──────────────────────────────────────────────
 */
export const loader = async ({ request }) => {
  try {
    const { admin, session } = await authenticate.admin(request);
    const shop = session.shop;

    // Fetch products with all relevant SEO data
    const response = await admin.graphql(`
      query {
        productsCount { count }
        products(first: 50) {
          nodes {
            id
            title
            handle
            descriptionHtml
            tags
            seo { title description }
            featuredMedia {
              preview { image { altText url } }
            }
            media(first: 20) {
              nodes {
                ... on MediaImage {
                  image { altText url }
                }
              }
            }
            metafield_score: metafield(namespace: "custom", key: "geo_score") { value }
            metafield_data: metafield(namespace: "custom", key: "geo_data") { value }
          }
        }
      }
    `);

    const data = await response.json();
    const products = data.data?.products?.nodes || [];
    const totalProducts = data.data?.productsCount?.count || 0;

    // ── Check Definitions (14 checks across 5 categories) ──
    const checks = {
      // META-DATEN (4 checks)
      seoTitles: {
        pass: [], fail: [], label: "SEO-Titel gesetzt",
        description: "Jedes Produkt sollte einen eigenen SEO-Titel haben.",
        category: "meta", severity: "critical", autoFixable: true, fixRoute: "/app/meta-generator",
      },
      titleLength: {
        pass: [], fail: [], label: "Titel-Laenge optimal (50-60 Zeichen)",
        description: "Titel zwischen 50-60 Zeichen werden in Suchergebnissen vollstaendig angezeigt.",
        category: "meta", severity: "warning", autoFixable: true, fixRoute: "/app/meta-generator",
      },
      seoDescriptions: {
        pass: [], fail: [], label: "Meta-Description gesetzt",
        description: "Meta-Descriptions verbessern die Klickrate in Suchergebnissen.",
        category: "meta", severity: "critical", autoFixable: true, fixRoute: "/app/meta-generator",
      },
      metaLength: {
        pass: [], fail: [], label: "Meta-Description optimal (120-160 Zeichen)",
        description: "Google zeigt 120-160 Zeichen an. Zu kurz = verschenktes Potenzial, zu lang = abgeschnitten.",
        category: "meta", severity: "warning", autoFixable: true, fixRoute: "/app/meta-generator",
      },

      // BILDER & MEDIEN (2 checks)
      altTexts: {
        pass: [], fail: [], label: "Hauptbild Alt-Text vorhanden",
        description: "Alt-Texte sind essenziell fuer Barrierefreiheit und Bilder-SEO.",
        category: "bilder", severity: "critical", autoFixable: true, fixRoute: "/app/alt-texts",
      },
      allImagesAlt: {
        pass: [], fail: [], label: "Alle Produktbilder mit Alt-Text",
        description: "Jedes einzelne Produktbild sollte einen beschreibenden Alt-Text haben.",
        category: "bilder", severity: "warning", autoFixable: true, fixRoute: "/app/alt-texts",
      },

      // CONTENT-QUALITAET (4 checks)
      descriptions: {
        pass: [], fail: [], label: "Produktbeschreibung vorhanden",
        description: "Produkte ohne Beschreibung haben kaum Chancen auf Rankings.",
        category: "content", severity: "critical", autoFixable: false,
      },
      descriptionLength: {
        pass: [], fail: [], label: "Beschreibung mindestens 300 Woerter",
        description: "Laengere, ausfuehrliche Beschreibungen ranken deutlich besser.",
        category: "content", severity: "warning", autoFixable: true, fixRoute: "/app/content-audit",
      },
      hasHeadings: {
        pass: [], fail: [], label: "H1/H2-Ueberschriften in Beschreibung",
        description: "Strukturierte Inhalte mit Ueberschriften werden von Suchmaschinen bevorzugt.",
        category: "content", severity: "warning", autoFixable: true, fixRoute: "/app/content-audit",
      },
      keywordDensity: {
        pass: [], fail: [], label: "Keyword im Titel und Beschreibung",
        description: "Das Hauptkeyword (Produkttitel-Woerter) sollte in der Beschreibung vorkommen.",
        category: "content", severity: "info", autoFixable: true, fixRoute: "/app/content-audit",
      },

      // TECHNISCHES SEO (2 checks)
      urlStructure: {
        pass: [], fail: [], label: "URL-Handle SEO-freundlich",
        description: "Kurze, lesbare URLs ohne Sonderzeichen oder lange Zahlenfolgen.",
        category: "technik", severity: "warning", autoFixable: false,
      },
      mobileFriendly: {
        pass: [], fail: [], label: "Mobilfreundliche Indikatoren",
        description: "Beschreibungen ohne ueberlange Woerter oder grosse Inline-Styles.",
        category: "technik", severity: "info", autoFixable: false,
      },

      // GEO-OPTIMIERUNG (2 checks)
      geoOptimized: {
        pass: [], fail: [], label: "GEO-optimiert (Score vorhanden)",
        description: "Produkte mit GEO-Score wurden fuer KI-Suchmaschinen optimiert.",
        category: "geo", severity: "critical", autoFixable: true, fixRoute: "/app/products",
      },
      jsonLd: {
        pass: [], fail: [], label: "Schema-Markup / JSON-LD Daten",
        description: "Strukturierte Daten helfen Suchmaschinen, Produktinformationen zu verstehen.",
        category: "geo", severity: "warning", autoFixable: true, fixRoute: "/app/products",
      },
    };

    // ── Analyze each product ──
    products.forEach((p) => {
      const numericId = p.id.replace("gid://shopify/Product/", "");
      const thumb = p.featuredMedia?.preview?.image?.url
        ? p.featuredMedia.preview.image.url.replace(/\?.*/, "") + "?width=40&height=40"
        : null;
      const productRef = { id: numericId, gid: p.id, title: p.title, thumb };

      const seoTitle = p.seo?.title;
      const seoDesc = p.seo?.description;
      const descHtml = p.descriptionHtml || "";
      const descText = descHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      const wordCount = descText ? descText.split(/\s+/).length : 0;
      const altText = p.featuredMedia?.preview?.image?.altText;
      const geoScore = p.metafield_score?.value;
      const geoData = p.metafield_data?.value;
      const handle = p.handle || "";

      // 1. SEO Title set
      seoTitle
        ? checks.seoTitles.pass.push(productRef)
        : checks.seoTitles.fail.push({ ...productRef, detail: "Kein SEO-Titel definiert" });

      // 2. Title length (50-60 ideal)
      const titleLen = (seoTitle || p.title || "").length;
      titleLen >= 50 && titleLen <= 60
        ? checks.titleLength.pass.push(productRef)
        : checks.titleLength.fail.push({ ...productRef, detail: `${titleLen} Zeichen (optimal: 50-60)` });

      // 3. Meta description set
      seoDesc
        ? checks.seoDescriptions.pass.push(productRef)
        : checks.seoDescriptions.fail.push({ ...productRef, detail: "Keine Meta-Description" });

      // 4. Meta description length (120-160)
      if (seoDesc && seoDesc.length >= 120 && seoDesc.length <= 160) {
        checks.metaLength.pass.push(productRef);
      } else {
        const len = seoDesc ? seoDesc.length : 0;
        checks.metaLength.fail.push({ ...productRef, detail: `${len} Zeichen (optimal: 120-160)` });
      }

      // 5. Main image alt text
      altText
        ? checks.altTexts.pass.push(productRef)
        : checks.altTexts.fail.push({ ...productRef, detail: "Hauptbild ohne Alt-Text" });

      // 6. All images alt texts
      const allMedia = p.media?.nodes || [];
      const missingAlt = allMedia.filter((m) => !m.image?.altText).length;
      missingAlt === 0 && allMedia.length > 0
        ? checks.allImagesAlt.pass.push(productRef)
        : checks.allImagesAlt.fail.push({ ...productRef, detail: `${missingAlt} von ${allMedia.length} Bildern ohne Alt-Text` });

      // 7. Description present
      descText.length > 20
        ? checks.descriptions.pass.push(productRef)
        : checks.descriptions.fail.push({ ...productRef, detail: "Keine oder zu kurze Beschreibung" });

      // 8. Description length (min 300 words)
      wordCount >= 300
        ? checks.descriptionLength.pass.push(productRef)
        : checks.descriptionLength.fail.push({ ...productRef, detail: `${wordCount} Woerter (mindestens 300 empfohlen)` });

      // 9. H1/H2 headings
      /<h[12][^>]*>/i.test(descHtml)
        ? checks.hasHeadings.pass.push(productRef)
        : checks.hasHeadings.fail.push({ ...productRef, detail: "Keine Ueberschriften in der Beschreibung" });

      // 10. Keyword density — product title words appear in description
      const titleWords = p.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      const descLower = descText.toLowerCase();
      const matchedKeywords = titleWords.filter((w) => descLower.includes(w));
      const keywordRatio = titleWords.length > 0 ? matchedKeywords.length / titleWords.length : 0;
      keywordRatio >= 0.5
        ? checks.keywordDensity.pass.push(productRef)
        : checks.keywordDensity.fail.push({ ...productRef, detail: `Nur ${matchedKeywords.length}/${titleWords.length} Titelwoerter in der Beschreibung` });

      // 11. URL structure
      const urlOk = handle.length >= 3 && handle.length < 80 && !handle.includes("--")
        && !/[^a-z0-9-]/.test(handle) && !/\d{6,}/.test(handle);
      urlOk
        ? checks.urlStructure.pass.push(productRef)
        : checks.urlStructure.fail.push({ ...productRef, detail: `Handle: /${handle}` });

      // 12. Mobile-friendly indicators (no excessively long words, no large inline styles)
      const hasLongWords = /\S{45,}/.test(descText);
      const hasLargeInline = /style="[^"]{200,}"/i.test(descHtml);
      !hasLongWords && !hasLargeInline
        ? checks.mobileFriendly.pass.push(productRef)
        : checks.mobileFriendly.fail.push({ ...productRef, detail: hasLongWords ? "Ueberlange Woerter gefunden" : "Grosse Inline-Styles" });

      // 13. GEO optimized
      geoScore
        ? checks.geoOptimized.pass.push(productRef)
        : checks.geoOptimized.fail.push({ ...productRef, detail: "Noch nicht GEO-optimiert" });

      // 14. JSON-LD / Schema markup
      geoData
        ? checks.jsonLd.pass.push(productRef)
        : checks.jsonLd.fail.push({ ...productRef, detail: "Keine strukturierten Daten" });
    });

    // ── Serialize ──
    const serializedChecks = {};
    for (const [key, check] of Object.entries(checks)) {
      serializedChecks[key] = {
        label: check.label,
        description: check.description,
        category: check.category,
        severity: check.severity,
        autoFixable: check.autoFixable || false,
        fixRoute: check.fixRoute || null,
        passCount: check.pass.length,
        failCount: check.fail.length,
        failedProducts: check.fail.slice(0, 30),
        totalFailed: check.fail.length,
      };
    }

    // ── Category Scores ──
    const categories = {
      meta: { label: "Meta-Daten", icon: "M", color: "#6366f1", checks: [] },
      bilder: { label: "Bilder & Medien", icon: "B", color: "#06b6d4", checks: [] },
      content: { label: "Content-Qualitaet", icon: "C", color: "#10b981", checks: [] },
      technik: { label: "Technisches SEO", icon: "T", color: "#f59e0b", checks: [] },
      geo: { label: "GEO-Optimierung", icon: "G", color: "#8b5cf6", checks: [] },
    };

    for (const [key, check] of Object.entries(serializedChecks)) {
      if (categories[check.category]) {
        categories[check.category].checks.push(key);
      }
    }

    for (const [catKey, cat] of Object.entries(categories)) {
      const catChecks = cat.checks.map((k) => serializedChecks[k]);
      const total = catChecks.reduce((s, c) => s + c.passCount + c.failCount, 0);
      const pass = catChecks.reduce((s, c) => s + c.passCount, 0);
      categories[catKey].score = total > 0 ? Math.round((pass / total) * 100) : 0;
      categories[catKey].total = total;
      categories[catKey].pass = pass;
      categories[catKey].criticalFails = catChecks
        .filter((c) => c.severity === "critical")
        .reduce((s, c) => s + c.failCount, 0);
    }

    // ── Overall Score (weighted: critical=3, warning=2, info=1) ──
    let weightedTotal = 0;
    let weightedPass = 0;
    for (const check of Object.values(serializedChecks)) {
      const weight = check.severity === "critical" ? 3 : check.severity === "warning" ? 2 : 1;
      weightedTotal += (check.passCount + check.failCount) * weight;
      weightedPass += check.passCount * weight;
    }
    const healthScore = weightedTotal > 0 ? Math.round((weightedPass / weightedTotal) * 100) : 0;

    // ── Statistics ──
    const totalCritical = Object.values(serializedChecks)
      .filter((c) => c.severity === "critical")
      .reduce((s, c) => s + c.failCount, 0);
    const totalWarnings = Object.values(serializedChecks)
      .filter((c) => c.severity === "warning")
      .reduce((s, c) => s + c.failCount, 0);
    const autoFixableCount = Object.values(serializedChecks)
      .reduce((sum, c) => sum + (c.autoFixable ? c.failCount : 0), 0);

    // Google connection + Brand DNA
    const tokens = await prisma.externalTokens.findUnique({ where: { shop } });
    const googleConnected = !!tokens?.gscRefresh;
    const settings = await prisma.shopSettings.findUnique({ where: { shop } });
    const brandDnaConfigured = !!settings?.brandVoice;

    // Usage limit info for display
    let limitInfo = null;
    try {
      const { checkLimit } = await import("../middleware/enforce-limits.server.js");
      const auditLimit = await checkLimit(shop, "audit");
      limitInfo = { remaining: auditLimit.remaining, limit: auditLimit.limit, allowed: auditLimit.allowed };
    } catch (_) { /* ignore */ }

    return json({
      healthScore,
      checks: serializedChecks,
      categories,
      totalProducts,
      analyzedProducts: products.length,
      googleConnected,
      brandDnaConfigured,
      totalCritical,
      totalWarnings,
      autoFixableCount,
      limitInfo,
    });
  } catch (error) {
    console.error("Health loader error:", error);
    return json({
      healthScore: 0, checks: {}, categories: {},
      totalProducts: 0, analyzedProducts: 0,
      googleConnected: false, brandDnaConfigured: false,
      totalCritical: 0, totalWarnings: 0, autoFixableCount: 0, limitInfo: null,
      error: "Fehler beim Laden der Gesundheitsdaten. Bitte versuche es erneut.",
    });
  }
};

/**
 * ──────────────────────────────────────────────
 *  ANIMATED SVG SCORE RING
 * ──────────────────────────────────────────────
 */
function ScoreRing({ score, size = 120, strokeWidth = 8, label, showPercent = true }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444";
  const bgTrack = score >= 80 ? "#d1fae533" : score >= 50 ? "#fef3c733" : "#fee2e233";
  const fontSize = size > 100 ? "28px" : size > 60 ? "18px" : "13px";

  return (
    <div style={{ textAlign: "center", flexShrink: 0 }}>
      <div style={{ position: "relative", width: size, height: size, margin: "0 auto" }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={bgTrack} strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={color} strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{
              transition: "stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)",
              filter: `drop-shadow(0 0 8px ${color}50)`,
            }}
          />
        </svg>
        {showPercent && (
          <div style={{
            position: "absolute", top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            fontWeight: 800, fontSize, color, lineHeight: 1,
          }}>
            {score}<span style={{ fontSize: "0.5em", opacity: 0.7 }}>%</span>
          </div>
        )}
      </div>
      {label && (
        <Text variant="bodySm" fontWeight="semibold" as="p" tone="subdued">{label}</Text>
      )}
    </div>
  );
}

/**
 * ──────────────────────────────────────────────
 *  SEVERITY BADGE
 * ──────────────────────────────────────────────
 */
function SeverityBadge({ severity }) {
  const map = {
    critical: { tone: "critical", label: "Kritisch" },
    warning: { tone: "warning", label: "Warnung" },
    info: { tone: "info", label: "Info" },
  };
  const s = map[severity] || map.info;
  return <Badge tone={s.tone} size="small">{s.label}</Badge>;
}

/**
 * ──────────────────────────────────────────────
 *  PRODUCT ROW — Shows a failing product with thumbnail
 * ──────────────────────────────────────────────
 */
function ProductRow({ product, check }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "6px 0", gap: "12px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
        {product.thumb && (
          <img
            src={product.thumb}
            alt=""
            style={{
              width: 32, height: 32, borderRadius: 6, objectFit: "cover",
              border: "1px solid #e2e8f0", flexShrink: 0,
            }}
          />
        )}
        <div style={{ minWidth: 0 }}>
          <Link to={`/app/products/${product.id}`} style={{ textDecoration: "none", color: "inherit" }}>
            <Text variant="bodySm" fontWeight="medium" truncate>{product.title}</Text>
          </Link>
          {product.detail && (
            <Text variant="bodySm" tone="subdued">{product.detail}</Text>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
        {check.autoFixable && check.fixRoute && (
          <Link to={check.fixRoute}>
            <Button size="slim" variant="primary" tone="success">Fix</Button>
          </Link>
        )}
        <Link to={`/app/products/${product.id}`}>
          <Button size="slim" variant="plain">Anzeigen</Button>
        </Link>
      </div>
    </div>
  );
}

/**
 * ──────────────────────────────────────────────
 *  CHECK ROW — Expandable single check
 * ──────────────────────────────────────────────
 */
function CheckRow({ checkKey, check }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  const total = check.passCount + check.failCount;
  const percentage = total > 0 ? Math.round((check.passCount / total) * 100) : 0;
  const tone = percentage >= 80 ? "success" : percentage >= 50 ? "warning" : "critical";
  const hasFailed = check.failedProducts.length > 0;

  const severityColor = check.severity === "critical" ? "#ef4444"
    : check.severity === "warning" ? "#f59e0b" : "#6366f1";

  return (
    <Box>
      <div
        onClick={hasFailed ? toggle : undefined}
        style={{
          cursor: hasFailed ? "pointer" : "default",
          padding: "10px 12px",
          borderRadius: "10px",
          borderLeft: `3px solid ${severityColor}`,
          background: open ? "rgba(99, 102, 241, 0.03)" : "transparent",
          transition: "background 0.2s",
        }}
        role={hasFailed ? "button" : undefined}
        tabIndex={hasFailed ? 0 : undefined}
        onKeyDown={hasFailed ? (e) => { if (e.key === "Enter" || e.key === " ") toggle(); } : undefined}
      >
        <InlineStack align="space-between" blockAlign="center" wrap={false}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <InlineStack gap="200" blockAlign="center" wrap={false}>
              {hasFailed && (
                <Icon source={open ? ChevronUpIcon : ChevronDownIcon} />
              )}
              <div style={{ minWidth: 0 }}>
                <InlineStack gap="200" blockAlign="center">
                  <Text variant="bodyMd" fontWeight="medium">{check.label}</Text>
                  <SeverityBadge severity={check.severity} />
                  {check.autoFixable && hasFailed && (
                    <Badge tone="info" size="small">Auto-Fix</Badge>
                  )}
                </InlineStack>
                <Text variant="bodySm" tone="subdued">{check.description}</Text>
              </div>
            </InlineStack>
          </div>
          <InlineStack gap="300" blockAlign="center" wrap={false}>
            <div style={{ width: "100px" }}>
              <ProgressBar progress={percentage} tone={tone} size="small" />
            </div>
            <div style={{ minWidth: "42px", textAlign: "right" }}>
              <Badge tone={tone}>{percentage}%</Badge>
            </div>
          </InlineStack>
        </InlineStack>
      </div>

      {hasFailed && (
        <Collapsible open={open} id={`check-${checkKey}`}>
          <Box paddingBlockStart="200" paddingInlineStart="800" paddingBlockEnd="200">
            <BlockStack gap="100">
              {check.failedProducts.map((product) => (
                <ProductRow key={product.id} product={product} check={check} />
              ))}
              {check.totalFailed > check.failedProducts.length && (
                <Text variant="bodySm" tone="subdued">
                  ... und {check.totalFailed - check.failedProducts.length} weitere Produkte
                </Text>
              )}
              {check.autoFixable && check.fixRoute && (
                <Box paddingBlockStart="200">
                  <Link to={check.fixRoute}>
                    <Button size="slim" variant="primary">
                      Alle {check.totalFailed} Probleme beheben
                    </Button>
                  </Link>
                </Box>
              )}
            </BlockStack>
          </Box>
        </Collapsible>
      )}
    </Box>
  );
}

/**
 * ──────────────────────────────────────────────
 *  CATEGORY SECTION — Expandable category card
 * ──────────────────────────────────────────────
 */
function CategorySection({ catKey, category, checks }) {
  const [open, setOpen] = useState(category.score < 80);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  const tone = category.score >= 80 ? "success" : category.score >= 50 ? "warning" : "critical";
  const categoryChecks = category.checks.map((k) => ({ key: k, ...checks[k] }));

  return (
    <Card>
      <BlockStack gap="400">
        <div
          onClick={toggle}
          style={{ cursor: "pointer", padding: "4px 0" }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") toggle(); }}
        >
          <InlineStack align="space-between" blockAlign="center" wrap={false}>
            <InlineStack gap="300" blockAlign="center">
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: `${category.color}15`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: "15px", color: category.color,
                border: `1px solid ${category.color}30`,
              }}>
                {category.icon}
              </div>
              <div>
                <InlineStack gap="200" blockAlign="center">
                  <Text variant="headingSm" as="h2">{category.label}</Text>
                  <Badge tone={tone}>{category.score}%</Badge>
                  {category.criticalFails > 0 && (
                    <Badge tone="critical" size="small">{category.criticalFails} kritisch</Badge>
                  )}
                </InlineStack>
                <Text variant="bodySm" tone="subdued">
                  {category.pass} von {category.total} Pruefungen bestanden
                </Text>
              </div>
            </InlineStack>
            <InlineStack gap="200" blockAlign="center">
              <ScoreRing score={category.score} size={48} strokeWidth={5} />
              <Icon source={open ? ChevronUpIcon : ChevronDownIcon} />
            </InlineStack>
          </InlineStack>
        </div>
        <Collapsible open={open} id={`cat-${catKey}`}>
          <BlockStack gap="100">
            <Divider />
            {categoryChecks.map((check) => (
              <CheckRow key={check.key} checkKey={check.key} check={check} />
            ))}
          </BlockStack>
        </Collapsible>
      </BlockStack>
    </Card>
  );
}

/**
 * ──────────────────────────────────────────────
 *  STAT CARD — Mini metric display
 * ──────────────────────────────────────────────
 */
function StatCard({ value, label, color, icon }) {
  return (
    <Card>
      <BlockStack gap="200" inlineAlign="center">
        <div style={{
          width: 40, height: 40, borderRadius: 12,
          background: `${color}12`, display: "flex",
          alignItems: "center", justifyContent: "center",
          fontSize: "20px", fontWeight: 700, color,
        }}>
          {icon}
        </div>
        <Text variant="headingLg" as="p" fontWeight="bold" alignment="center">{value}</Text>
        <Text variant="bodySm" tone="subdued" alignment="center">{label}</Text>
      </BlockStack>
    </Card>
  );
}

/**
 * ──────────────────────────────────────────────
 *  MAIN COMPONENT
 * ──────────────────────────────────────────────
 */
export default function Health() {
  const {
    healthScore, checks, categories, totalProducts, analyzedProducts,
    googleConnected, brandDnaConfigured, totalCritical, totalWarnings,
    autoFixableCount, limitInfo, error,
  } = useLoaderData();

  const gradeLabel = useMemo(() => {
    if (healthScore >= 90) return { text: "Exzellent", emoji: "A+", color: "#10b981" };
    if (healthScore >= 80) return { text: "Sehr gut", emoji: "A", color: "#10b981" };
    if (healthScore >= 70) return { text: "Gut", emoji: "B", color: "#22c55e" };
    if (healthScore >= 50) return { text: "Verbesserbar", emoji: "C", color: "#f59e0b" };
    if (healthScore >= 30) return { text: "Schwach", emoji: "D", color: "#f97316" };
    return { text: "Kritisch", emoji: "F", color: "#ef4444" };
  }, [healthScore]);

  if (error) {
    return (
      <Page title="SEO Gesundheitscheck" backAction={{ content: "Dashboard", url: "/app" }}>
        <Banner tone="critical" title="Fehler">
          <p>{error}</p>
        </Banner>
      </Page>
    );
  }

  return (
    <div className="titan-dark">
      <Page
        title="SEO Gesundheitscheck"
        subtitle={`${analyzedProducts} von ${totalProducts} Produkten analysiert — ${Object.keys(checks).length} Pruefungen`}
        backAction={{ content: "Dashboard", url: "/app" }}
      >
        <BlockStack gap="600">

          {/* ── Hero Score Card ── */}
          <Card>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              gap: "40px", flexWrap: "wrap", padding: "12px 0",
            }}>
              <ScoreRing score={healthScore} size={160} strokeWidth={12} />
              <BlockStack gap="300">
                <InlineStack gap="200" blockAlign="center">
                  <Text variant="headingXl" as="h1">
                    SEO-Health-Score
                  </Text>
                  <div style={{
                    background: `${gradeLabel.color}18`, color: gradeLabel.color,
                    fontWeight: 800, fontSize: "16px", padding: "4px 12px",
                    borderRadius: 8, border: `1px solid ${gradeLabel.color}30`,
                  }}>
                    {gradeLabel.emoji}
                  </div>
                </InlineStack>
                <Text variant="headingMd" as="p" tone="subdued">
                  {gradeLabel.text} — Dein Store schneidet{" "}
                  {healthScore >= 80 ? "stark" : healthScore >= 50 ? "solide" : "unterdurchschnittlich"} ab
                </Text>
                <Text variant="bodyMd" tone="subdued">
                  Basierend auf {Object.keys(checks).length} SEO-Faktoren ueber {analyzedProducts} Produkte,
                  gewichtet nach Prioritaet (kritisch, Warnung, Info).
                </Text>
                {autoFixableCount > 0 && (
                  <InlineStack gap="200">
                    <Link to="/app/products">
                      <Button variant="primary">
                        {autoFixableCount} Probleme automatisch beheben
                      </Button>
                    </Link>
                  </InlineStack>
                )}
              </BlockStack>
            </div>
          </Card>

          {/* ── Quick Stats ── */}
          <InlineGrid columns={{ xs: 2, sm: 4 }} gap="400">
            <StatCard value={Object.keys(checks).length} label="Pruefungen" color="#6366f1" icon="P" />
            <StatCard value={totalCritical} label="Kritische Fehler" color="#ef4444" icon="!" />
            <StatCard value={totalWarnings} label="Warnungen" color="#f59e0b" icon="W" />
            <StatCard value={autoFixableCount} label="Auto-Fix moeglich" color="#10b981" icon="F" />
          </InlineGrid>

          {/* ── Category Score Overview ── */}
          {categories && Object.keys(categories).length > 0 && (
            <Card>
              <BlockStack gap="400">
                <Text variant="headingSm" as="h2">Kategorie-Uebersicht</Text>
                <Divider />
                <InlineGrid columns={{ xs: 2, sm: 3, md: 5 }} gap="400">
                  {Object.entries(categories).map(([key, cat]) => (
                    <div key={key} style={{
                      textAlign: "center", padding: "12px 8px",
                      borderRadius: 12, background: `${cat.color}06`,
                      border: `1px solid ${cat.color}15`,
                      transition: "all 0.2s",
                    }}>
                      <BlockStack gap="200" inlineAlign="center">
                        <ScoreRing score={cat.score} size={64} strokeWidth={5} />
                        <Text variant="bodySm" fontWeight="semibold" alignment="center">
                          {cat.label}
                        </Text>
                        <Text variant="bodySm" tone="subdued" alignment="center">
                          {cat.pass} / {cat.total} bestanden
                        </Text>
                      </BlockStack>
                    </div>
                  ))}
                </InlineGrid>
              </BlockStack>
            </Card>
          )}

          {/* ── Limit Info ── */}
          {limitInfo && limitInfo.limit > 0 && (
            <Banner tone={limitInfo.remaining > 0 ? "info" : "warning"}>
              <p>
                KI-basierte Checks: {limitInfo.remaining === Infinity ? "Unbegrenzt" : `${limitInfo.remaining} von ${limitInfo.limit}`} verbleibend heute.
                {!limitInfo.allowed && " Limit erreicht — "}
                {!limitInfo.allowed && <Link to="/app/billing">Jetzt upgraden</Link>}
              </p>
            </Banner>
          )}

          {/* ── Setup Checks ── */}
          <Card>
            <BlockStack gap="400">
              <Text variant="headingSm" as="h2">Grundkonfiguration</Text>
              <Divider />
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text fontWeight="medium">Brand DNA konfiguriert</Text>
                  <Text variant="bodySm" tone="subdued">
                    Definiert den Tonfall und Stil fuer KI-Optimierungen
                  </Text>
                </BlockStack>
                <InlineStack gap="200">
                  <Badge tone={brandDnaConfigured ? "success" : "critical"}>
                    {brandDnaConfigured ? "Aktiv" : "Fehlt"}
                  </Badge>
                  {!brandDnaConfigured && (
                    <Link to="/app/settings#brand-dna">
                      <Button size="slim">Einrichten</Button>
                    </Link>
                  )}
                </InlineStack>
              </InlineStack>
              <Divider />
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text fontWeight="medium">Google Search Console</Text>
                  <Text variant="bodySm" tone="subdued">
                    Ermoeglicht ROI-Tracking und echte Ranking-Daten
                  </Text>
                </BlockStack>
                <InlineStack gap="200">
                  <Badge tone={googleConnected ? "success" : "warning"}>
                    {googleConnected ? "Verbunden" : "Nicht verbunden"}
                  </Badge>
                  {!googleConnected && (
                    <Link to="/app/settings#google">
                      <Button size="slim">Verbinden</Button>
                    </Link>
                  )}
                </InlineStack>
              </InlineStack>
            </BlockStack>
          </Card>

          {/* ── Detailed Checks by Category ── */}
          {categories && Object.entries(categories).map(([catKey, category]) => (
            <CategorySection
              key={catKey}
              catKey={catKey}
              category={category}
              checks={checks}
            />
          ))}

          {/* ── Quick Actions ── */}
          <Card>
            <BlockStack gap="400">
              <Text variant="headingSm" as="h2">Schnellaktionen</Text>
              <Divider />
              <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="300">
                {[
                  { to: "/app/meta-generator", title: "Meta-Daten Generator", desc: "Fehlende Titel und Beschreibungen generieren", color: "#6366f1" },
                  { to: "/app/alt-texts", title: "Alt-Text Generator", desc: "Bild-Alt-Texte mit KI generieren", color: "#06b6d4" },
                  { to: "/app/content-audit", title: "Content Audit", desc: "Beschreibungen analysieren und verbessern", color: "#10b981" },
                  { to: "/app/products", title: "GEO-Optimierung", desc: "Produkte fuer KI-Suche optimieren", color: "#8b5cf6" },
                ].map((action) => (
                  <Link key={action.to} to={action.to} style={{ textDecoration: "none" }}>
                    <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                      <BlockStack gap="200">
                        <div style={{
                          width: 8, height: 8, borderRadius: 4,
                          background: action.color,
                        }} />
                        <Text variant="bodyMd" fontWeight="semibold">{action.title}</Text>
                        <Text variant="bodySm" tone="subdued">{action.desc}</Text>
                      </BlockStack>
                    </Box>
                  </Link>
                ))}
              </InlineGrid>
            </BlockStack>
          </Card>

          {/* ── Footer Banner ── */}
          <Banner tone="info">
            <p>
              Der Gesundheitscheck analysiert die ersten {analyzedProducts} von {totalProducts} Produkten.
              Alle Pruefungen basieren auf aktuellen SEO-Best-Practices und GEO-Optimierungsstandards.
              {totalProducts > analyzedProducts && " Upgrade auf Pro fuer eine vollstaendige Analyse aller Produkte."}
            </p>
          </Banner>
        </BlockStack>
      </Page>
    </div>
  );
}
