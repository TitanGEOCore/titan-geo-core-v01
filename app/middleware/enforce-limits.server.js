/**
 * Enforce Limits Middleware für Titan GEO Core
 *
 * Vereint Plan-Check und Usage-Limits in einer einfachen API.
 * Nutzt die bestehende In-Memory-Lösung aus usage-limits.server.js
 * und die Plan-Ermittlung aus plan-check.server.js.
 * 
 * Limits werden jetzt aus der zentralen Konfiguration importiert.
 */

import { checkUsageLimit, incrementUsage } from "./usage-limits.server.js";
import { getEffectivePlan } from "./plan-check.server.js";
import prisma from "../db.server.js";
import { 
  PLAN_LIMITS, 
  FEATURE_MAP, 
  FEATURE_LABELS, 
  UPGRADE_HINTS,
  PLANS 
} from "../config/limits.server.js";

// Developer shops get unlimited access (from ENV or empty)
const envShops = process.env.DEVELOPER_SHOPS;
const DEVELOPER_SHOPS = envShops ? envShops.split(',').map(s => s.trim()) : [];

export async function checkLimit(shop, feature) {
  // Developer bypass — unlimited access for dev/test shops
  if (DEVELOPER_SHOPS.includes(shop)) {
    return { allowed: true, remaining: Infinity, limit: -1 };
  }

  const plan = await getEffectivePlan(shop, prisma);
  const planLimits = PLAN_LIMITS[plan] || PLAN_LIMITS[PLANS.STARTER];
  // Translate short feature names (e.g. "optimize") to config keys (e.g. "geo_optimization")
  const configFeature = FEATURE_MAP[feature] || feature;
  const limit = planLimits[configFeature];

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
