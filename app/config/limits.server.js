/**
 * Titan GEO Core - Centralized Limit Configuration
 * 
 * Single Source of Truth for all app limits.
 * This file should be the only place where limits are defined.
 * All other files should import from here.
 */

// Free tier limit for GEO optimizations
export const FREE_TIER_LIMIT = 5;

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
  KEYWORD_RESEARCH: "keyword_research",
  CONTENT_AUDIT: "content_audit",
  COMPETITOR_ANALYSIS: "competitor_analysis",
  ALT_TEXT_GENERATION: "alt_text_generation",
  META_GENERATION: "meta_generation",
  MULTI_LANGUAGE: "multi_language",
  INTERNAL_LINKING: "internal_linking",
  RANKING_TRACKER: "ranking_tracker",
  SHOP_ANALYSIS: "shop_analysis",
  TEMPLATE_GENERATION: "template_generation",
};

// Plan-specific limits per day
// -1 means unlimited, 0 means not available, positive number is the limit
export const PLAN_LIMITS = {
  [PLANS.STARTER]: {
    geo_optimization: 5,
    keyword_research: 3,
    content_audit: 3,
    competitor_analysis: 0,
    alt_text_generation: 5,
    meta_generation: 10,
    multi_language: 0,
    internal_linking: 0,
    ranking_tracker: 3,
    shop_analysis: 3,
    template_generation: 3,
  },
  [PLANS.GROWTH]: {
    geo_optimization: 50,
    keyword_research: 20,
    content_audit: 20,
    competitor_analysis: 5,
    alt_text_generation: 30,
    meta_generation: 50,
    multi_language: 0,
    internal_linking: 10,
    ranking_tracker: 25,
    shop_analysis: 20,
    template_generation: 20,
  },
  [PLANS.PRO]: {
    geo_optimization: -1, // unlimited
    keyword_research: -1,
    content_audit: -1,
    competitor_analysis: -1,
    alt_text_generation: -1,
    meta_generation: -1,
    multi_language: 5,
    internal_linking: -1,
    ranking_tracker: -1,
    shop_analysis: -1,
    template_generation: -1,
  },
  [PLANS.ENTERPRISE]: {
    geo_optimization: -1,
    keyword_research: -1,
    content_audit: -1,
    competitor_analysis: -1,
    alt_text_generation: -1,
    meta_generation: -1,
    multi_language: -1,
    internal_linking: -1,
    ranking_tracker: -1,
    shop_analysis: -1,
    template_generation: -1,
  },
  [PLANS.ADMIN]: {
    geo_optimization: -1,
    keyword_research: -1,
    content_audit: -1,
    competitor_analysis: -1,
    alt_text_generation: -1,
    meta_generation: -1,
    multi_language: -1,
    internal_linking: -1,
    ranking_tracker: -1,
    shop_analysis: -1,
    template_generation: -1,
  },
};

// Feature short names (for enforce-limits.server.js)
export const FEATURE_MAP = {
  optimize: FEATURES.GEO_OPTIMIZATION,
  keywords: FEATURES.KEYWORD_RESEARCH,
  audit: FEATURES.CONTENT_AUDIT,
  contentaudit: FEATURES.CONTENT_AUDIT,
  competitor: FEATURES.COMPETITOR_ANALYSIS,
  alttext: FEATURES.ALT_TEXT_GENERATION,
  meta: FEATURES.META_GENERATION,
  metagenerator: FEATURES.META_GENERATION,
  translate: FEATURES.MULTI_LANGUAGE,
  multilang: FEATURES.MULTI_LANGUAGE,
  links: FEATURES.INTERNAL_LINKING,
  internallinks: FEATURES.INTERNAL_LINKING,
  rankingtracker: FEATURES.RANKING_TRACKER,
  shopanalysis: FEATURES.SHOP_ANALYSIS,
  templates: FEATURES.TEMPLATE_GENERATION,
};

// German labels for features
export const FEATURE_LABELS = {
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

// Upgrade hints per feature
export const UPGRADE_HINTS = {
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