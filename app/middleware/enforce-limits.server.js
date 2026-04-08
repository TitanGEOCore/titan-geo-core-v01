/**
 * Enforce Limits Middleware für Titan GEO Core
 *
 * Vereint Plan-Check und Usage-Limits in einer einfachen API.
 * Nutzt die bestehende In-Memory-Lösung aus usage-limits.server.js
 * und die Plan-Ermittlung aus plan-check.server.js.
 */

import { checkUsageLimit, incrementUsage } from "./usage-limits.server.js";
import { getEffectivePlan } from "./plan-check.server.js";
import prisma from "../db.server.js";

// Feature-Mapping: Kurzform -> usage-limits Feature-Key
const FEATURE_MAP = {
  optimize: "geo_optimization",
  keywords: "keyword_research",
  audit: "content_audit",
  contentaudit: "content_audit",
  competitor: "competitor_analysis",
  alttext: "alt_text_generation",
  meta: "meta_generation",
  metagenerator: "meta_generation",
  translate: "multi_language",
  multilang: "multi_language",
  links: "internal_linking",
  internallinks: "internal_linking",
  rankingtracker: "ranking_tracker",
  shopanalysis: "shop_analysis",
  templates: "template_generation",
};

// Plan-spezifische Limits (überschreibt die Standard-Limits aus usage-limits.server.js)
const PLAN_LIMITS = {
  Starter: { optimize: 5, keywords: 3, audit: 3, contentaudit: 3, competitor: 0, alttext: 5, meta: 10, metagenerator: 10, translate: 0, multilang: 0, links: 0, internallinks: 0, rankingtracker: 3, shopanalysis: 3, templates: 3 },
  Growth:  { optimize: 50, keywords: 20, audit: 20, contentaudit: 20, competitor: 5, alttext: 30, meta: 50, metagenerator: 50, translate: 0, multilang: 0, links: 10, internallinks: 10, rankingtracker: 25, shopanalysis: 20, templates: 20 },
  Pro:     { optimize: -1, keywords: -1, audit: -1, contentaudit: -1, competitor: -1, alttext: -1, meta: -1, metagenerator: -1, translate: 5, multilang: 5, links: -1, internallinks: -1, rankingtracker: -1, shopanalysis: -1, templates: -1 },
  Enterprise: { optimize: -1, keywords: -1, audit: -1, contentaudit: -1, competitor: -1, alttext: -1, meta: -1, metagenerator: -1, translate: -1, multilang: -1, links: -1, internallinks: -1, rankingtracker: -1, shopanalysis: -1, templates: -1 },
  Admin:   { optimize: -1, keywords: -1, audit: -1, contentaudit: -1, competitor: -1, alttext: -1, meta: -1, metagenerator: -1, translate: -1, multilang: -1, links: -1, internallinks: -1, rankingtracker: -1, shopanalysis: -1, templates: -1 },
};

// Upgrade-Empfehlungen pro Feature
const UPGRADE_HINTS = {
  optimize: "Upgrade auf Growth für 50 Optimierungen/Tag oder Pro für unbegrenzt.",
  keywords: "Upgrade auf Growth für 20 Recherchen/Tag oder Pro für unbegrenzt.",
  audit: "Upgrade auf Growth für 20 Audits/Tag oder Pro für unbegrenzt.",
  contentaudit: "Upgrade auf Growth für 20 Audits/Tag oder Pro für unbegrenzt.",
  competitor: "Upgrade auf Growth für 5 Analysen/Tag.",
  alttext: "Upgrade auf Growth für 30 Alt-Texte/Tag oder Pro für unbegrenzt.",
  meta: "Upgrade auf Growth für 50 Meta-Tags/Tag oder Pro für unbegrenzt.",
  metagenerator: "Upgrade auf Growth für 50 Meta-Tags/Tag oder Pro für unbegrenzt.",
  translate: "Upgrade auf Pro für 5 Übersetzungen/Tag oder Enterprise für unbegrenzt.",
  multilang: "Upgrade auf Pro für 5 Übersetzungen/Tag oder Enterprise für unbegrenzt.",
  links: "Upgrade auf Growth für 10 Link-Analysen/Tag oder Pro für unbegrenzt.",
  internallinks: "Upgrade auf Growth für 10 Link-Analysen/Tag oder Pro für unbegrenzt.",
  rankingtracker: "Upgrade auf Growth für 25 Tracking-Anfragen/Tag oder Pro für unbegrenzt.",
  shopanalysis: "Upgrade auf Growth für 20 Shop-Analysen/Tag oder Pro für unbegrenzt.",
  templates: "Upgrade auf Growth für 20 Template-Generierungen/Tag oder Pro für unbegrenzt.",
};

// Deutschsprachige Feature-Labels
const FEATURE_LABELS = {
  optimize: "GEO-Optimierungen",
  keywords: "Keyword-Recherchen",
  audit: "Content-Audits",
  contentaudit: "Content-Audits",
  competitor: "Wettbewerber-Analysen",
  alttext: "Alt-Text-Generierungen",
  meta: "Meta-Generierungen",
  metagenerator: "Meta-Generierungen",
  translate: "Übersetzungen",
  multilang: "Übersetzungen",
  links: "Link-Analysen",
  internallinks: "Link-Analysen",
  rankingtracker: "Ranking-Analysen",
  shopanalysis: "Shop-Analysen",
  templates: "Template-Generierungen",
};

/**
 * Prüft ob ein Feature für einen Shop noch verfügbar ist.
 *
 * @param {string} shop - Shop-Domain
 * @param {string} feature - Feature-Kurzform (optimize, keywords, audit, etc.)
 * @returns {Promise<{ allowed: boolean, remaining: number, limit: number, message?: string, upgradeUrl?: string }>}
 */
// Developer shops get unlimited access (bypasses all limits)
const DEVELOPER_SHOPS = [
  "titan-geo-core.myshopify.com",
  "sb11zm-1k.myshopify.com",
];

export async function checkLimit(shop, feature) {
  // Developer bypass — unlimited access for dev/test shops
  if (DEVELOPER_SHOPS.includes(shop)) {
    return { allowed: true, remaining: Infinity, limit: -1 };
  }

  const plan = await getEffectivePlan(shop, prisma);
  const planLimits = PLAN_LIMITS[plan] || PLAN_LIMITS.Starter;
  const limit = planLimits[feature];

  if (limit === undefined) {
    return { allowed: false, remaining: 0, message: "Feature nicht verfügbar.", upgradeUrl: "/app/billing" };
  }

  // Feature im Plan nicht enthalten (0)
  if (limit === 0) {
    return {
      allowed: false,
      remaining: 0,
      limit: 0,
      message: `${FEATURE_LABELS[feature] || feature} sind in deinem Plan (${plan}) nicht verfügbar. ${UPGRADE_HINTS[feature] || ""}`,
      limitReached: true,
      upgradeUrl: "/app/billing",
    };
  }

  // Unbegrenzt (-1)
  if (limit === -1) {
    return { allowed: true, remaining: Infinity, limit: -1 };
  }

  // Nutzung über die bestehende In-Memory-Lösung prüfen
  const usageFeature = FEATURE_MAP[feature] || feature;
  const usage = checkUsageLimit(shop, usageFeature, plan.toLowerCase());

  // Wir verwenden unsere eigenen Plan-Limits statt der in usage-limits definierten
  const remaining = Math.max(0, limit - usage.used);

  if (remaining <= 0) {
    return {
      allowed: false,
      remaining: 0,
      limit,
      used: usage.used,
      message: `Tageslimit für ${FEATURE_LABELS[feature] || feature} erreicht (${limit}/${limit}). ${UPGRADE_HINTS[feature] || "Warte 24 Stunden oder upgrade deinen Plan."}`,
      limitReached: true,
      upgradeUrl: "/app/billing",
    };
  }

  return { allowed: true, remaining, limit, used: usage.used };
}

/**
 * Erhöht den Nutzungszähler für ein Feature.
 *
 * @param {string} shop - Shop-Domain
 * @param {string} feature - Feature-Kurzform
 */
export function trackUsage(shop, feature) {
  const usageFeature = FEATURE_MAP[feature] || feature;
  return incrementUsage(shop, usageFeature);
}

/**
 * Hilfsfunktion: Gibt eine formatierte Fehlermeldung als JSON zurück.
 * Kann direkt in Remix-Actions verwendet werden.
 *
 * @param {string} feature - Feature-Label
 * @param {object} limitResult - Ergebnis von checkLimit
 * @returns {{ error: string, limitReached: boolean, upgradeUrl: string }}
 */
export function limitErrorResponse(limitResult) {
  return {
    error: limitResult.message,
    limitReached: true,
    upgradeUrl: limitResult.upgradeUrl || "/app/billing",
  };
}
