/**
 * Usage Limits Middleware für Titan GEO Core
 * Verfolgt Feature-Nutzung pro Shop pro Tag mit 24-Stunden-Cooldown.
 * In-Memory-Speicher (Map) mit shop+feature+date als Schlüssel.
 */

// In-Memory Usage Store: Map<string, { count: number, firstUsed: number }>
const usageStore = new Map();

// Limits pro Plan
const LIMITS = {
  free: {
    geo_optimization: 5,
    keyword_research: 3,
    content_audit: 3,
    competitor_analysis: 2,
    multi_language: 1,
    meta_generation: 10,
    alt_text_generation: 5,
    internal_linking: 0,
  },
  starter: {
    geo_optimization: 5,
    keyword_research: 3,
    content_audit: 3,
    competitor_analysis: 2,
    multi_language: 1,
    meta_generation: 10,
    alt_text_generation: 5,
    internal_linking: 0,
  },
  pro: {
    geo_optimization: 50,
    keyword_research: 30,
    content_audit: 30,
    competitor_analysis: 20,
    multi_language: 10,
    meta_generation: 100,
    alt_text_generation: 50,
    internal_linking: Infinity,
  },
  enterprise: {
    geo_optimization: Infinity,
    keyword_research: Infinity,
    content_audit: Infinity,
    competitor_analysis: Infinity,
    multi_language: Infinity,
    meta_generation: Infinity,
    alt_text_generation: Infinity,
    internal_linking: Infinity,
  },
  admin: {
    geo_optimization: Infinity,
    keyword_research: Infinity,
    content_audit: Infinity,
    competitor_analysis: Infinity,
    multi_language: Infinity,
    meta_generation: Infinity,
    alt_text_generation: Infinity,
    internal_linking: Infinity,
  },
};

// Feature-Labels (deutsch) für Fehlermeldungen
const FEATURE_LABELS = {
  geo_optimization: "GEO-Optimierung",
  keyword_research: "Keyword-Recherche",
  content_audit: "Content-Audit",
  competitor_analysis: "Wettbewerber-Analyse",
  multi_language: "Multi-Language-Übersetzung",
  meta_generation: "Meta-Generierung",
  alt_text_generation: "Alt-Text-Generierung",
  internal_linking: "Interne Verlinkung",
};

/**
 * Erzeugt einen eindeutigen Schlüssel für den Usage-Store.
 * Format: shop::feature::YYYY-MM-DD
 */
function getUsageKey(shop, feature) {
  const today = new Date().toISOString().split("T")[0];
  return `${shop}::${feature}::${today}`;
}

/**
 * Gibt das Limit für ein Feature basierend auf dem Plan zurück.
 */
function getLimit(feature, plan) {
  const normalizedPlan = (plan || "free").toLowerCase();
  const planLimits = LIMITS[normalizedPlan] || LIMITS.free;
  return planLimits[feature] ?? 0;
}

/**
 * Berechnet, wann das Limit zurückgesetzt wird (nächster Tag, 00:00 UTC).
 */
function getResetTime() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  return tomorrow;
}

/**
 * Bereinigt abgelaufene Einträge (älter als heute).
 * Sollte periodisch aufgerufen werden.
 */
function cleanupExpiredEntries() {
  const today = new Date().toISOString().split("T")[0];
  for (const key of usageStore.keys()) {
    const datePart = key.split("::")[2];
    if (datePart && datePart < today) {
      usageStore.delete(key);
    }
  }
}

// Automatische Bereinigung alle 30 Minuten
setInterval(cleanupExpiredEntries, 30 * 60 * 1000);

/**
 * Prüft, ob ein Feature für einen Shop verfügbar ist.
 *
 * @param {string} shop - Shop-Domain (z.B. "example.myshopify.com")
 * @param {string} feature - Feature-Schlüssel (z.B. "geo_optimization")
 * @param {string} plan - Abo-Plan ("free", "starter", "pro", "enterprise")
 * @returns {{ allowed: boolean, remaining: number, limit: number, used: number, resetsAt: Date, featureLabel: string }}
 */
export function checkUsageLimit(shop, feature, plan = "free") {
  const limit = getLimit(feature, plan);
  const key = getUsageKey(shop, feature);
  const entry = usageStore.get(key);
  const used = entry ? entry.count : 0;
  const remaining = Math.max(0, limit === Infinity ? Infinity : limit - used);
  const allowed = limit === Infinity || used < limit;

  return {
    allowed,
    remaining,
    limit: limit === Infinity ? -1 : limit,
    used,
    resetsAt: getResetTime(),
    featureLabel: FEATURE_LABELS[feature] || feature,
  };
}

/**
 * Erhöht den Nutzungszähler für ein Feature.
 *
 * @param {string} shop - Shop-Domain
 * @param {string} feature - Feature-Schlüssel
 * @returns {{ count: number, date: string }}
 */
export function incrementUsage(shop, feature) {
  const key = getUsageKey(shop, feature);
  const existing = usageStore.get(key);
  const today = new Date().toISOString().split("T")[0];

  if (existing) {
    existing.count += 1;
    usageStore.set(key, existing);
    return { count: existing.count, date: today };
  }

  usageStore.set(key, {
    count: 1,
    firstUsed: Date.now(),
  });

  return { count: 1, date: today };
}

/**
 * Gibt die verbleibende Nutzung für ein Feature zurück.
 *
 * @param {string} shop - Shop-Domain
 * @param {string} feature - Feature-Schlüssel
 * @param {string} plan - Abo-Plan
 * @returns {{ remaining: number, limit: number, used: number, resetsAt: Date, featureLabel: string }}
 */
export function getRemainingUsage(shop, feature, plan = "free") {
  const { remaining, limit, used, resetsAt, featureLabel } = checkUsageLimit(shop, feature, plan);
  return { remaining, limit, used, resetsAt, featureLabel };
}

/**
 * Gibt alle Nutzungsstatistiken für einen Shop zurück.
 *
 * @param {string} shop - Shop-Domain
 * @param {string} plan - Abo-Plan
 * @returns {Object} - Objekt mit allen Features und ihren Statistiken
 */
export function getAllUsageStats(shop, plan = "free") {
  const stats = {};
  for (const feature of Object.keys(FEATURE_LABELS)) {
    stats[feature] = getRemainingUsage(shop, feature, plan);
  }
  return stats;
}

/**
 * Setzt die Nutzung für einen Shop und ein Feature zurück (Admin-Funktion).
 *
 * @param {string} shop - Shop-Domain
 * @param {string} feature - Feature-Schlüssel (optional, wenn leer werden alle zurückgesetzt)
 */
export function resetUsage(shop, feature = null) {
  if (feature) {
    const key = getUsageKey(shop, feature);
    usageStore.delete(key);
  } else {
    const today = new Date().toISOString().split("T")[0];
    for (const key of usageStore.keys()) {
      if (key.startsWith(`${shop}::`) && key.endsWith(`::${today}`)) {
        usageStore.delete(key);
      }
    }
  }
}

/**
 * Exportiert verfügbare Features und ihre Labels.
 */
export const AVAILABLE_FEATURES = FEATURE_LABELS;

/**
 * Exportiert die Plan-Limits für Anzeigezwecke.
 */
export const PLAN_LIMITS = LIMITS;
