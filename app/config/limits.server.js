/**
 * Titan GEO Core - Centralized Limit Configuration
 * 
 * Pricing Plan Structure:
 * - Starter ($0): Manual only, limited daily operations
 * - Growth ($19.99): Scaling tier, bulk operations enabled
 * - Pro ($39.99): Full power, unlimited, auto-apply features
 * - Enterprise ($79.99): Exclusive, all features + AI flags
 */

// Plan names (must match Shopify billing plan names)
export const PLANS = {
  STARTER: "Starter",
  GROWTH: "Growth",
  PRO: "Pro",
  ENTERPRISE: "Enterprise",
  ADMIN: "Admin",
};

// Feature keys (used for usage tracking)
export const FEATURES = {
  GEO_OPTIMIZATION: "geo_optimization",
  ALT_TEXT_GENERATION: "alt_text_generation",
  META_GENERATION: "meta_generation",
};

// Plan-specific limits per day
// -1 means unlimited, positive number is the limit
export const PLAN_LIMITS = {
  [PLANS.STARTER]: {
    geo_optimization: 5,
    alt_text_generation: 5,
    meta_generation: 10,
    // Feature flags
    bulkOperationsAllowed: false,
    autoPilotAllowed: false,
    visionAiAllowed: false,
    autoApplyInternalLinks: false,
  },
  [PLANS.GROWTH]: {
    geo_optimization: 50,
    alt_text_generation: 50,
    meta_generation: 100,
    // Feature flags
    bulkOperationsAllowed: true,
    autoPilotAllowed: false,
    visionAiAllowed: false,
    autoApplyInternalLinks: false,
  },
  [PLANS.PRO]: {
    geo_optimization: -1, // unlimited
    alt_text_generation: -1, // unlimited
    meta_generation: -1, // unlimited
    // Feature flags
    bulkOperationsAllowed: true,
    autoPilotAllowed: false,
    visionAiAllowed: false,
    autoApplyInternalLinks: true,
  },
  [PLANS.ENTERPRISE]: {
    geo_optimization: -1,
    alt_text_generation: -1,
    meta_generation: -1,
    // Feature flags
    bulkOperationsAllowed: true,
    autoPilotAllowed: true,
    visionAiAllowed: true,
    autoApplyInternalLinks: true,
  },
  [PLANS.ADMIN]: {
    geo_optimization: -1,
    alt_text_generation: -1,
    meta_generation: -1,
    // Feature flags
    bulkOperationsAllowed: true,
    autoPilotAllowed: true,
    visionAiAllowed: true,
    autoApplyInternalLinks: true,
  },
};

// Feature short names (for enforce-limits.server.js)
export const FEATURE_MAP = {
  optimize: FEATURES.GEO_OPTIMIZATION,
  alttext: FEATURES.ALT_TEXT_GENERATION,
  alt_text: FEATURES.ALT_TEXT_GENERATION,
  meta: FEATURES.META_GENERATION,
  metagenerator: FEATURES.META_GENERATION,
};

// German labels for features
export const FEATURE_LABELS = {
  optimize: "GEO-Optimierungen",
  alttext: "Alt-Text-Generierungen",
  alt_text: "Alt-Text-Generierungen",
  meta: "Meta-Generierungen",
  metagenerator: "Meta-Generierungen",
};

// Upgrade hints per feature
export const UPGRADE_HINTS = {
  optimize: "Upgrade auf Growth für 50 Optimierungen/Tag oder Pro für unbegrenzt.",
  alttext: "Upgrade auf Growth für 50 Alt-Texte/Tag oder Pro für unbegrenzt.",
  alt_text: "Upgrade auf Growth für 50 Alt-Texte/Tag oder Pro für unbegrenzt.",
  meta: "Upgrade auf Growth für 100 Meta-Tags/Tag oder Pro für unbegrenzt.",
  metagenerator: "Upgrade auf Growth für 100 Meta-Tags/Tag oder Pro für unbegrenzt.",
};