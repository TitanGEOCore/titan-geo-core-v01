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
  CONTENT_AUDIT: "content_audit",
  COMPETITOR_ANALYSIS: "competitor_analysis",
  KEYWORD_RESEARCH: "keyword_research",
  MULTI_LANGUAGE: "multi_language",
  INTERNAL_LINKING: "internal_linking",
  RANKING_TRACKER: "ranking_tracker",
  SHOP_ANALYSIS: "shop_analysis",
  TEMPLATE_USAGE: "template_usage",
};

// Plan-specific limits per day
// -1 means unlimited, 0 means not available, positive number is the limit
export const PLAN_LIMITS = {
  [PLANS.STARTER]: {
    geo_optimization: 5,
    alt_text_generation: 5,
    meta_generation: 10,
    content_audit: 3,
    competitor_analysis: 0,
    keyword_research: 3,
    multi_language: 0,
    internal_linking: 0,
    ranking_tracker: 0,
    shop_analysis: 0,
    template_usage: 3,
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
    content_audit: 20,
    competitor_analysis: 5,
    keyword_research: 20,
    multi_language: 0,
    internal_linking: 10,
    ranking_tracker: 5,
    shop_analysis: 5,
    template_usage: 10,
    // Feature flags
    bulkOperationsAllowed: true,
    autoPilotAllowed: false,
    visionAiAllowed: false,
    autoApplyInternalLinks: false,
  },
  [PLANS.PRO]: {
    geo_optimization: -1,
    alt_text_generation: -1,
    meta_generation: -1,
    content_audit: -1,
    competitor_analysis: -1,
    keyword_research: -1,
    multi_language: -1,
    internal_linking: -1,
    ranking_tracker: -1,
    shop_analysis: -1,
    template_usage: -1,
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
    content_audit: -1,
    competitor_analysis: -1,
    keyword_research: -1,
    multi_language: -1,
    internal_linking: -1,
    ranking_tracker: -1,
    shop_analysis: -1,
    template_usage: -1,
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
    content_audit: -1,
    competitor_analysis: -1,
    keyword_research: -1,
    multi_language: -1,
    internal_linking: -1,
    ranking_tracker: -1,
    shop_analysis: -1,
    template_usage: -1,
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
  audit: FEATURES.CONTENT_AUDIT,
  contentaudit: FEATURES.CONTENT_AUDIT,
  competitor: FEATURES.COMPETITOR_ANALYSIS,
  keywords: FEATURES.KEYWORD_RESEARCH,
  multilang: FEATURES.MULTI_LANGUAGE,
  internallinks: FEATURES.INTERNAL_LINKING,
  rankingtracker: FEATURES.RANKING_TRACKER,
  shopanalysis: FEATURES.SHOP_ANALYSIS,
  templates: FEATURES.TEMPLATE_USAGE,
};

// German labels for features
export const FEATURE_LABELS = {
  optimize: "GEO-Optimierungen",
  alttext: "Alt-Text-Generierungen",
  alt_text: "Alt-Text-Generierungen",
  meta: "Meta-Generierungen",
  metagenerator: "Meta-Generierungen",
  audit: "Content-Audits",
  contentaudit: "Content-Audits",
  competitor: "Wettbewerbsanalysen",
  keywords: "Keyword-Recherchen",
  multilang: "Mehrsprachige Optimierungen",
  internallinks: "Interne Verlinkungen",
  rankingtracker: "Ranking-Abfragen",
  shopanalysis: "Shop-Analysen",
  templates: "Template-Nutzungen",
};

// Upgrade hints per feature
export const UPGRADE_HINTS = {
  optimize: "Upgrade auf Growth für 50 Optimierungen/Tag oder Pro für unbegrenzt.",
  alttext: "Upgrade auf Growth für 50 Alt-Texte/Tag oder Pro für unbegrenzt.",
  alt_text: "Upgrade auf Growth für 50 Alt-Texte/Tag oder Pro für unbegrenzt.",
  meta: "Upgrade auf Growth für 100 Meta-Tags/Tag oder Pro für unbegrenzt.",
  metagenerator: "Upgrade auf Growth für 100 Meta-Tags/Tag oder Pro für unbegrenzt.",
  audit: "Upgrade auf Growth für 20 Content-Audits/Tag oder Pro für unbegrenzt.",
  contentaudit: "Upgrade auf Growth für 20 Content-Audits/Tag oder Pro für unbegrenzt.",
  competitor: "Upgrade auf Growth für 5 Wettbewerbsanalysen/Tag oder Pro für unbegrenzt.",
  keywords: "Upgrade auf Growth für 20 Keyword-Recherchen/Tag oder Pro für unbegrenzt.",
  multilang: "Upgrade auf Growth oder Pro für mehrsprachige Optimierungen.",
  internallinks: "Upgrade auf Growth für 10 interne Verlinkungen/Tag oder Pro für unbegrenzt.",
  rankingtracker: "Upgrade auf Growth für 5 Ranking-Abfragen/Tag oder Pro für unbegrenzt.",
  shopanalysis: "Upgrade auf Growth für 5 Shop-Analysen/Tag oder Pro für unbegrenzt.",
  templates: "Upgrade auf Growth für 10 Templates/Tag oder Pro für unbegrenzt.",
};
