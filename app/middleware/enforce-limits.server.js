/**
 * Enforce Limits Middleware für Titan GEO Core
 *
 * Vereint Plan-Check und Usage-Limits in einer einfachen API.
 * Nutzt die Datenbank (UsageTracker) für persistente Nutzungsverfolgung
 * und die Plan-Ermittlung aus plan-check.server.js.
 *
 * Limits werden aus der zentralen Konfiguration importiert.
 */

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

  // Query database for today's usage count
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const used = await prisma.usageTracker.count({
    where: { shop, module: configFeature, optimizedAt: { gte: todayStart } },
  });

  const remaining = Math.max(0, limit - used);

  if (remaining <= 0) {
    return {
      allowed: false,
      remaining: 0,
      limit,
      used,
      message: `Tageslimit für ${FEATURE_LABELS[feature] || feature} erreicht (${limit}/${limit}). ${UPGRADE_HINTS[feature] || "Warte 24 Stunden oder upgrade deinen Plan."}`,
      limitReached: true,
      upgradeUrl: "/app/billing",
    };
  }

  return { allowed: true, remaining, limit, used };
}

/**
 * Erhöht den Nutzungszähler für ein Feature in der Datenbank.
 *
 * @param {string} shop - Shop-Domain
 * @param {string} feature - Feature-Kurzform
 * @param {string|null} productId - Optionale Produkt-ID
 */
export async function trackUsage(shop, feature, productId = null) {
  const usageFeature = FEATURE_MAP[feature] || feature;
  await prisma.usageTracker.create({
    data: { shop, module: usageFeature, productId },
  });
}

/**
 * Hilfsfunktion: Gibt eine formatierte Fehlermeldung als JSON zurück.
 * Kann direkt in Remix-Actions verwendet werden.
 *
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
