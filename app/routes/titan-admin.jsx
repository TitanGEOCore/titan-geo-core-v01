import { json, redirect } from "@remix-run/node";
import { useLoaderData, useActionData, Form, useNavigation } from "@remix-run/react";
import React, { useState, useMemo } from "react";
import prisma from "../db.server";
import { verifyAdminSession, getAdminSessions } from "../admin-session.server";

/**
 * TITAN GEO CORE - Enterprise Admin Panel
 * Standalone route (not inside Shopify iframe).
 * Cookie-based auth, Shopify-standard light theme, German language.
 */

const MODULE_KEYS = [
  "geo_optimization",
  "alt_text_generation",
  "meta_generation",
  "content_audit",
  "competitor_analysis",
  "keyword_research",
  "multi_language",
  "internal_linking",
  "ranking_tracker",
  "shop_analysis",
  "template_usage",
];

const MODULE_LABELS = {
  geo_optimization: "GEO-Optimierung",
  alt_text_generation: "Alt-Text Generator",
  meta_generation: "Meta-Generator",
  content_audit: "Content-Audit",
  competitor_analysis: "Wettbewerber-Analyse",
  keyword_research: "Keyword-Recherche",
  multi_language: "Multi-Sprache",
  internal_linking: "Interne Verlinkung",
  ranking_tracker: "Ranking-Tracker",
  shop_analysis: "Shop-Analyse",
  template_usage: "Templates",
};

const MODULE_ICONS = {
  geo_optimization: "\u{1F30D}",
  alt_text_generation: "\u{1F5BC}",
  meta_generation: "\u{1F3F7}",
  content_audit: "\u{1F50D}",
  competitor_analysis: "\u{1F3AF}",
  keyword_research: "\u{1F511}",
  multi_language: "\u{1F310}",
  internal_linking: "\u{1F517}",
  ranking_tracker: "\u{1F4C8}",
  shop_analysis: "\u{1F4CA}",
  template_usage: "\u{1F4C4}",
};

// ─── LOADER ──────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
  const cookieHeader = request.headers.get("Cookie") || "";
  if (!verifyAdminSession(cookieHeader)) {
    return redirect("/admin-login");
  }

  const { getEffectivePlan } = await import("../middleware/plan-check.server");
  const { PLAN_LIMITS } = await import("../config/limits.server");

  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(todayMidnight.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(todayMidnight.getTime() - 30 * 24 * 60 * 60 * 1000);

  try {
    const [
      uniqueShops,
      totalOptimizations,
      optimizationsToday,
      contentVersionCount,
      adminUserCount,
      moduleTotals,
      moduleTodayTotals,
      moduleWeekTotals,
      moduleMonthTotals,
      usageByShopModule,
      recentActivity,
      allSettings,
      contentVersions,
      shopAnalysisReports,
      adminUsers,
      sessionCount,
      usageTrackerCount,
      contentVersionTotalCount,
      shopAnalysisCount,
      adminUserTotalCount,
      shopSettingsCount,
      dailyUsageLast7,
    ] = await Promise.all([
      // Unique shops
      prisma.session.findMany({ distinct: ["shop"], select: { shop: true } }),
      // Total usage
      prisma.usageTracker.count(),
      // Today usage
      prisma.usageTracker.count({ where: { optimizedAt: { gte: todayMidnight } } }),
      // Content versions count
      prisma.contentVersion.count(),
      // Admin user count
      prisma.adminUser.count(),
      // Module totals (all time)
      prisma.usageTracker.groupBy({ by: ["module"], _count: true }),
      // Module totals (today)
      prisma.usageTracker.groupBy({ by: ["module"], _count: true, where: { optimizedAt: { gte: todayMidnight } } }),
      // Module totals (week)
      prisma.usageTracker.groupBy({ by: ["module"], _count: true, where: { optimizedAt: { gte: weekAgo } } }),
      // Module totals (month)
      prisma.usageTracker.groupBy({ by: ["module"], _count: true, where: { optimizedAt: { gte: monthAgo } } }),
      // Usage by shop+module
      prisma.usageTracker.groupBy({ by: ["shop", "module"], _count: true }),
      // Recent 20 activities
      prisma.usageTracker.findMany({ orderBy: { optimizedAt: "desc" }, take: 20 }),
      // All shop settings
      prisma.shopSettings.findMany(),
      // Content versions (last 100)
      prisma.contentVersion.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
      // Shop analysis reports
      prisma.shopAnalysisReport.findMany({ orderBy: { createdAt: "desc" } }),
      // Admin users
      prisma.adminUser.findMany({ select: { id: true, email: true, role: true, createdAt: true, updatedAt: true } }),
      // DB stats
      prisma.session.count(),
      prisma.usageTracker.count(),
      prisma.contentVersion.count(),
      prisma.shopAnalysisReport.count(),
      prisma.adminUser.count(),
      prisma.shopSettings.count(),
      // Daily usage last 7 days (fetch all from last 7 days)
      prisma.usageTracker.findMany({
        where: { optimizedAt: { gte: weekAgo } },
        select: { module: true, optimizedAt: true },
      }),
    ]);

    // Build module stats maps
    const moduleStatsMap = {};
    for (const key of MODULE_KEYS) {
      const total = moduleTotals.find((m) => m.module === key)?._count || 0;
      const today = moduleTodayTotals.find((m) => m.module === key)?._count || 0;
      const week = moduleWeekTotals.find((m) => m.module === key)?._count || 0;
      const month = moduleMonthTotals.find((m) => m.module === key)?._count || 0;
      moduleStatsMap[key] = { total, today, week, month };
    }

    // Build per-shop usage map
    const shopUsageMap = {};
    for (const u of usageByShopModule) {
      if (!shopUsageMap[u.shop]) shopUsageMap[u.shop] = {};
      shopUsageMap[u.shop][u.module] = u._count;
    }

    // Build settings map
    const settingsMap = {};
    for (const s of allSettings) {
      settingsMap[s.shop] = s;
    }

    // Get last activity per shop
    const lastActivityMap = {};
    for (const u of usageByShopModule) {
      // We need individual queries or use recent activity - let's use a simpler approach
    }

    // Get effective plan for each shop
    const shopDomains = uniqueShops.map((s) => s.shop);
    const shopPlans = {};
    for (const shop of shopDomains) {
      try {
        shopPlans[shop] = await getEffectivePlan(shop, prisma);
      } catch {
        shopPlans[shop] = "Starter";
      }
    }

    // Get last activity per shop from usage tracker
    const lastActivityResults = await Promise.all(
      shopDomains.map((shop) =>
        prisma.usageTracker
          .findFirst({ where: { shop }, orderBy: { optimizedAt: "desc" }, select: { optimizedAt: true } })
          .then((r) => [shop, r?.optimizedAt || null])
      )
    );
    const lastActivityByShop = Object.fromEntries(lastActivityResults);

    // Get per-shop total usage count
    const shopTotalUsage = {};
    for (const [shop, modules] of Object.entries(shopUsageMap)) {
      shopTotalUsage[shop] = Object.values(modules).reduce((a, b) => a + b, 0);
    }

    // Build shops data
    const shops = shopDomains.map((shop) => ({
      shop,
      plan: shopPlans[shop] || "Starter",
      planOverride: settingsMap[shop]?.planOverride || null,
      brandVoice: !!settingsMap[shop]?.brandVoice,
      targetAudience: settingsMap[shop]?.targetAudience || null,
      noGos: settingsMap[shop]?.noGos || null,
      brandVoiceText: settingsMap[shop]?.brandVoice || null,
      totalOptimizations: shopTotalUsage[shop] || 0,
      lastActivity: lastActivityByShop[shop] || null,
      joinedDate: settingsMap[shop]?.createdAt || null,
      moduleUsage: shopUsageMap[shop] || {},
      contentVersionsCount: 0, // will be enriched below
      shopAnalysisCount: 0,
    }));

    // Enrich with per-shop content version and analysis counts
    const [cvByShop, saByShop] = await Promise.all([
      prisma.contentVersion.groupBy({ by: ["shop"], _count: true }),
      prisma.shopAnalysisReport.groupBy({ by: ["shop"], _count: true }),
    ]);
    const cvMap = Object.fromEntries(cvByShop.map((c) => [c.shop, c._count]));
    const saMap = Object.fromEntries(saByShop.map((c) => [c.shop, c._count]));
    for (const s of shops) {
      s.contentVersionsCount = cvMap[s.shop] || 0;
      s.shopAnalysisCount = saMap[s.shop] || 0;
    }

    // API cost estimation
    const estimatedCostUSD =
      (totalOptimizations * 2000 / 1_000_000) * 0.15 +
      (totalOptimizations * 1500 / 1_000_000) * 0.60;

    // Daily usage for trend (last 7 days)
    const dailyUsageByModule = {};
    for (const key of MODULE_KEYS) {
      dailyUsageByModule[key] = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(todayMidnight.getTime() - i * 24 * 60 * 60 * 1000);
        const dateKey = d.toISOString().slice(0, 10);
        dailyUsageByModule[key][dateKey] = 0;
      }
    }
    for (const entry of dailyUsageLast7) {
      const dateKey = new Date(entry.optimizedAt).toISOString().slice(0, 10);
      if (dailyUsageByModule[entry.module] && dailyUsageByModule[entry.module][dateKey] !== undefined) {
        dailyUsageByModule[entry.module][dateKey]++;
      }
    }

    // Admin sessions info
    const sessions = getAdminSessions();
    const adminSessionCount = sessions.size;
    const adminSessionInfo = [];
    for (const [token, sess] of sessions.entries()) {
      adminSessionInfo.push({
        ip: sess.ip || "unbekannt",
        createdAt: sess.createdAt,
        email: sess.email || "unbekannt",
      });
    }

    // Environment info
    const envInfo = {
      SHOPIFY_APP_URL: process.env.SHOPIFY_APP_URL || "nicht gesetzt",
      ADMIN_SHOP: process.env.ADMIN_SHOP || "nicht gesetzt",
      DEVELOPER_SHOPS: process.env.DEVELOPER_SHOPS || "nicht gesetzt",
      DATABASE_URL: process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/\/\/.*@/, "//***:***@") : "nicht gesetzt",
      GEMINI_API_KEY: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.slice(0, 8) + "..." : "nicht gesetzt",
      NODE_ENV: process.env.NODE_ENV || "development",
    };

    const serverInfo = {
      nodeVersion: process.version,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      platform: process.platform,
      arch: process.arch,
    };

    // Plan limits for reference
    const planLimitsData = {};
    for (const [plan, limits] of Object.entries(PLAN_LIMITS)) {
      planLimitsData[plan] = {};
      for (const key of MODULE_KEYS) {
        planLimitsData[plan][key] = limits[key];
      }
      planLimitsData[plan].bulkOperationsAllowed = limits.bulkOperationsAllowed;
      planLimitsData[plan].autoPilotAllowed = limits.autoPilotAllowed;
      planLimitsData[plan].visionAiAllowed = limits.visionAiAllowed;
      planLimitsData[plan].autoApplyInternalLinks = limits.autoApplyInternalLinks;
    }

    return json({
      totalShops: shopDomains.length,
      totalOptimizations,
      optimizationsToday,
      estimatedCostUSD,
      contentVersionCount,
      adminUserCount,
      moduleStats: moduleStatsMap,
      shops,
      recentActivity: recentActivity.map((a) => ({
        ...a,
        optimizedAt: a.optimizedAt?.toISOString() || null,
      })),
      contentVersions: contentVersions.map((cv) => ({
        id: cv.id,
        shop: cv.shop,
        productId: cv.productId,
        previousData: cv.previousData,
        newData: cv.newData,
        createdAt: cv.createdAt?.toISOString() || null,
      })),
      shopAnalysisReports: shopAnalysisReports.map((r) => ({
        id: r.id,
        shop: r.shop,
        overallScore: r.overallScore,
        criticalProducts: r.criticalProducts,
        fullReport: r.fullReport,
        createdAt: r.createdAt?.toISOString() || null,
      })),
      adminUsers: adminUsers.map((u) => ({
        ...u,
        createdAt: u.createdAt?.toISOString() || null,
        updatedAt: u.updatedAt?.toISOString() || null,
      })),
      dailyUsageByModule,
      envInfo,
      serverInfo,
      adminSessionCount,
      adminSessionInfo: adminSessionInfo.map((s) => ({
        ...s,
        createdAt: typeof s.createdAt === "number" ? new Date(s.createdAt).toISOString() : null,
      })),
      planLimitsData,
      dbStats: {
        sessions: sessionCount,
        usageTracker: usageTrackerCount,
        contentVersions: contentVersionTotalCount,
        shopAnalysisReports: shopAnalysisCount,
        adminUsers: adminUserTotalCount,
        shopSettings: shopSettingsCount,
      },
    });
  } catch (e) {
    console.error("Admin loader error:", e);
    return json({
      totalShops: 0,
      totalOptimizations: 0,
      optimizationsToday: 0,
      estimatedCostUSD: 0,
      contentVersionCount: 0,
      adminUserCount: 0,
      moduleStats: {},
      shops: [],
      recentActivity: [],
      contentVersions: [],
      shopAnalysisReports: [],
      adminUsers: [],
      dailyUsageByModule: {},
      envInfo: {},
      serverInfo: { nodeVersion: "?", uptime: 0 },
      adminSessionCount: 0,
      adminSessionInfo: [],
      planLimitsData: {},
      dbStats: {},
      error: e.message,
    });
  }
};

// ─── ACTION ──────────────────────────────────────────────────────────────────

export const action = async ({ request }) => {
  const cookieHeader = request.headers.get("Cookie") || "";
  if (!verifyAdminSession(cookieHeader)) {
    return redirect("/admin-login");
  }

  const formData = await request.formData();
  const actionType = formData.get("_action");

  // Logout
  if (actionType === "logout") {
    return redirect("/admin-login", {
      headers: {
        "Set-Cookie": "titan_admin_session=; Path=/; Max-Age=0; HttpOnly; SameSite=None; Secure",
      },
    });
  }

  // Override plan
  if (actionType === "overridePlan") {
    const shop = formData.get("shop");
    const plan = formData.get("plan");
    const validPlans = ["Starter", "Growth", "Pro", "Enterprise", "Admin", "none"];
    if (!shop || !validPlans.includes(plan)) {
      return json({ error: "Ung\u00fcltige Parameter" }, { status: 400 });
    }
    await prisma.shopSettings.upsert({
      where: { shop },
      update: { planOverride: plan === "none" ? null : plan },
      create: { shop, planOverride: plan === "none" ? null : plan },
    });
    return json({ success: true, message: `Plan f\u00fcr ${shop} auf "${plan === "none" ? "Standard" : plan}" gesetzt.` });
  }

  // Reset usage
  if (actionType === "resetUsage") {
    const shop = formData.get("shop");
    if (!shop) return json({ error: "Shop erforderlich" }, { status: 400 });
    const deleted = await prisma.usageTracker.deleteMany({ where: { shop } });
    return json({ success: true, message: `${deleted.count} Nutzungseintr\u00e4ge f\u00fcr ${shop} gel\u00f6scht.` });
  }

  // Create admin
  if (actionType === "createAdmin") {
    const email = formData.get("email");
    const password = formData.get("password");
    const role = formData.get("role") || "Viewer";
    if (!email || !password) {
      return json({ error: "E-Mail und Passwort erforderlich" }, { status: 400 });
    }
    try {
      const { hashPassword } = await import("../admin-session.server");
      const hashedPw = await hashPassword(password);
      await prisma.adminUser.create({ data: { email, password: hashedPw, role } });
      return json({ success: true, message: `Admin-Benutzer "${email}" (${role}) erstellt.` });
    } catch (e) {
      if (e.code === "P2002") return json({ error: "E-Mail existiert bereits." }, { status: 400 });
      return json({ error: "Fehler beim Erstellen." }, { status: 500 });
    }
  }

  // Update password
  if (actionType === "updatePassword") {
    const userId = formData.get("userId");
    const newPassword = formData.get("newPassword");
    if (!userId || !newPassword) {
      return json({ error: "Benutzer-ID und neues Passwort erforderlich" }, { status: 400 });
    }
    try {
      const { hashPassword } = await import("../admin-session.server");
      const hashedPw = await hashPassword(newPassword);
      await prisma.adminUser.update({ where: { id: userId }, data: { password: hashedPw } });
      return json({ success: true, message: "Passwort erfolgreich ge\u00e4ndert." });
    } catch {
      return json({ error: "Benutzer nicht gefunden." }, { status: 404 });
    }
  }

  // Delete admin
  if (actionType === "deleteAdmin") {
    const userId = formData.get("userId");
    if (!userId) return json({ error: "Benutzer-ID erforderlich" }, { status: 400 });
    try {
      const user = await prisma.adminUser.delete({ where: { id: userId } });
      return json({ success: true, message: `Benutzer "${user.email}" gel\u00f6scht.` });
    } catch {
      return json({ error: "Benutzer nicht gefunden." }, { status: 404 });
    }
  }

  // Update admin email
  if (actionType === "updateEmail") {
    const userId = formData.get("userId");
    const newEmail = formData.get("newEmail");
    if (!userId || !newEmail) {
      return json({ error: "Benutzer-ID und neue E-Mail erforderlich" }, { status: 400 });
    }
    try {
      await prisma.adminUser.update({ where: { id: userId }, data: { email: newEmail } });
      return json({ success: true, message: `E-Mail erfolgreich zu "${newEmail}" ge\u00e4ndert.` });
    } catch (e) {
      if (e.code === "P2002") return json({ error: "Diese E-Mail existiert bereits." }, { status: 400 });
      return json({ error: "Benutzer nicht gefunden." }, { status: 404 });
    }
  }

  // Update admin role
  if (actionType === "updateRole") {
    const userId = formData.get("userId");
    const newRole = formData.get("newRole");
    if (!userId || !newRole) {
      return json({ error: "Benutzer-ID und neue Rolle erforderlich" }, { status: 400 });
    }
    try {
      await prisma.adminUser.update({ where: { id: userId }, data: { role: newRole } });
      return json({ success: true, message: `Rolle erfolgreich zu "${newRole}" ge\u00e4ndert.` });
    } catch {
      return json({ error: "Benutzer nicht gefunden." }, { status: 404 });
    }
  }

  // Update shop Brand DNA settings
  if (actionType === "updateShopSettings") {
    const shop = formData.get("shop");
    const brandVoice = formData.get("brandVoice") || "";
    const targetAudience = formData.get("targetAudience") || "";
    const noGos = formData.get("noGos") || "";
    if (!shop) return json({ error: "Shop erforderlich" }, { status: 400 });
    await prisma.shopSettings.upsert({
      where: { shop },
      update: { brandVoice, targetAudience, noGos },
      create: { shop, brandVoice, targetAudience, noGos },
    });
    return json({ success: true, message: `Brand-DNA f\u00fcr ${shop} aktualisiert.` });
  }

  // Delete specific content versions
  if (actionType === "deleteVersion") {
    const versionId = formData.get("versionId");
    if (!versionId) return json({ error: "Version-ID erforderlich" }, { status: 400 });
    try {
      await prisma.contentVersion.delete({ where: { id: versionId } });
      return json({ success: true, message: "Content-Version gel\u00f6scht." });
    } catch {
      return json({ error: "Version nicht gefunden." }, { status: 404 });
    }
  }

  // Delete specific analysis report
  if (actionType === "deleteAnalysis") {
    const reportId = formData.get("reportId");
    if (!reportId) return json({ error: "Report-ID erforderlich" }, { status: 400 });
    try {
      await prisma.shopAnalysisReport.delete({ where: { id: reportId } });
      return json({ success: true, message: "Analyse-Report gel\u00f6scht." });
    } catch {
      return json({ error: "Report nicht gefunden." }, { status: 404 });
    }
  }

  // Delete all shop data
  if (actionType === "deleteShopData") {
    const shop = formData.get("shop");
    if (!shop) return json({ error: "Shop erforderlich" }, { status: 400 });
    const [u, cv, sa, ss] = await Promise.all([
      prisma.usageTracker.deleteMany({ where: { shop } }),
      prisma.contentVersion.deleteMany({ where: { shop } }),
      prisma.shopAnalysisReport.deleteMany({ where: { shop } }),
      prisma.shopSettings.deleteMany({ where: { shop } }),
    ]);
    return json({
      success: true,
      message: `Alle Daten f\u00fcr ${shop} gel\u00f6scht (${u.count} Usage, ${cv.count} Versionen, ${sa.count} Analysen, ${ss.count} Einstellungen).`,
    });
  }

  return json({ error: "Unbekannte Aktion" });
};

// ─── COMPONENT ───────────────────────────────────────────────────────────────

const TABS = [
  { key: "dashboard", label: "\u00dcbersicht" },
  { key: "shops", label: "Shop-Verwaltung" },
  { key: "modules", label: "Module-Aktivit\u00e4t" },
  { key: "versions", label: "Content-Versionen" },
  { key: "analysis", label: "Shop-Analysen" },
  { key: "users", label: "Admin-Benutzer" },
  { key: "system", label: "System" },
  { key: "dsgvo", label: "DSGVO & Sicherheit" },
  { key: "audit", label: "Audit-Log" },
];

function formatDate(iso) {
  if (!iso) return "\u2014";
  try {
    return new Date(iso).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "\u2014";
  }
}

function formatDateShort(iso) {
  if (!iso) return "\u2014";
  try {
    return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return "\u2014";
  }
}

function formatNumber(n) {
  if (n == null) return "0";
  return Number(n).toLocaleString("de-DE");
}

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${m}m ${s}s`;
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(1)} ${units[i]}`;
}

function tryParseJSON(str) {
  if (!str) return null;
  if (typeof str === "object") return str;
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

export default function TitanAdmin() {
  const data = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [activeTab, setActiveTab] = useState("dashboard");
  const [expandedShops, setExpandedShops] = useState({});
  const [expandedVersions, setExpandedVersions] = useState({});
  const [expandedAnalysis, setExpandedAnalysis] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmShopDelete, setConfirmShopDelete] = useState(null);
  const [confirmResetUsage, setConfirmResetUsage] = useState(null);
  const [pwUserId, setPwUserId] = useState(null);
  const [newPw, setNewPw] = useState("");
  const [shopFilter, setShopFilter] = useState("");
  const [confirmActions, setConfirmActions] = useState({});
  const [bulkSelectedShops, setBulkSelectedShops] = useState({});
  const [bulkPlan, setBulkPlan] = useState("none");

  const {
    totalShops = 0,
    totalOptimizations = 0,
    optimizationsToday = 0,
    estimatedCostUSD = 0,
    contentVersionCount = 0,
    adminUserCount = 0,
    moduleStats = {},
    shops = [],
    recentActivity = [],
    contentVersions = [],
    shopAnalysisReports = [],
    adminUsers = [],
    dailyUsageByModule = {},
    envInfo = {},
    serverInfo = {},
    adminSessionCount = 0,
    adminSessionInfo = [],
    planLimitsData = {},
    dbStats = {},
  } = data;

  const filteredShops = useMemo(() => {
    if (!shopFilter.trim()) return shops;
    const q = shopFilter.toLowerCase();
    return shops.filter((s) => s.shop.toLowerCase().includes(q));
  }, [shops, shopFilter]);

  const currentAdminEmail = useMemo(() => {
    if (adminSessionInfo.length > 0) return adminSessionInfo[0].email;
    return "unbekannt";
  }, [adminSessionInfo]);

  // ─── STYLES ──────────────────────────────────────────────────────────────

  const pageStyle = {
    minHeight: "100vh",
    background: "#f6f6f7",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    color: "#1a1a1a",
  };

  const cardStyle = {
    background: "#ffffff",
    border: "1px solid #e1e3e5",
    borderRadius: "12px",
    padding: "24px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  };

  const headerStyle = {
    background: "#ffffff",
    padding: "16px 32px",
    borderBottom: "1px solid #e1e3e5",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "16px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
  };

  const summaryCardStyle = {
    ...cardStyle,
    flex: "1",
    minWidth: "200px",
  };

  const labelStyle = {
    fontSize: "12px",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    marginBottom: "8px",
    fontWeight: 600,
  };

  const bigValueStyle = {
    fontSize: "32px",
    fontWeight: 800,
    color: "#1a1a1a",
  };

  const subtitleStyle = {
    fontSize: "13px",
    color: "#09090b",
    marginTop: "4px",
    fontWeight: 500,
  };

  const tableStyle = {
    width: "100%",
    borderCollapse: "collapse",
  };

  const thStyle = {
    padding: "12px 16px",
    textAlign: "left",
    fontSize: "12px",
    fontWeight: 600,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    borderBottom: "2px solid #e1e3e5",
    background: "#f9fafb",
  };

  const tdStyle = {
    padding: "12px 16px",
    fontSize: "14px",
    borderBottom: "1px solid #f3f4f6",
    color: "#1a1a1a",
  };

  const btnPrimary = {
    padding: "10px 18px",
    background: "#09090b",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.2s",
  };

  const btnDanger = {
    ...btnPrimary,
    background: "#71717a",
  };

  const btnSecondary = {
    padding: "10px 18px",
    background: "#ffffff",
    color: "#374151",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.2s",
  };

  const inputStyle = {
    width: "100%",
    padding: "10px 14px",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    fontSize: "14px",
    background: "#ffffff",
    color: "#1a1a1a",
    outline: "none",
    boxSizing: "border-box",
  };

  const selectStyle = {
    ...inputStyle,
    cursor: "pointer",
  };

  const badgeStyle = (color) => {
    const colors = {
      green: { bg: "#f4f4f5", text: "#18181b", border: "#d4d4d8" },
      red: { bg: "#18181b", text: "#a1a1aa", border: "#3f3f46" },
      yellow: { bg: "#e4e4e7", text: "#52525b", border: "#d4d4d8" },
      indigo: { bg: "#09090b", text: "#fafafa", border: "#27272a" },
      gray: { bg: "#f4f4f5", text: "#52525b", border: "#d4d4d8" },
      blue: { bg: "#f4f4f5", text: "#3f3f46", border: "#e4e4e7" },
    };
    const c = colors[color] || colors.gray;
    return {
      display: "inline-block",
      padding: "3px 10px",
      borderRadius: "20px",
      fontSize: "12px",
      fontWeight: 600,
      background: c.bg,
      color: c.text,
      border: `1px solid ${c.border}`,
    };
  };

  const planBadgeColor = (plan) => {
    if (plan === "Admin") return "red";
    if (plan === "Enterprise") return "yellow";
    if (plan === "Pro") return "indigo";
    if (plan === "Growth") return "green";
    return "gray";
  };

  const scoreColor = (score) => {
    if (score == null) return "#6b7280";
    if (score >= 80) return "#18181b";
    if (score >= 60) return "#52525b";
    return "#71717a";
  };

  const tabStyle = (active) => ({
    padding: "12px 20px",
    borderRadius: "0",
    border: "none",
    borderBottom: active ? "3px solid #09090b" : "3px solid transparent",
    background: "transparent",
    color: active ? "#09090b" : "#6b7280",
    fontSize: "14px",
    fontWeight: active ? 700 : 500,
    cursor: "pointer",
    transition: "all 0.2s",
    whiteSpace: "nowrap",
  });

  const statusDot = (status) => ({
    display: "inline-block",
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    background: status === "green" ? "#18181b" : status === "yellow" ? "#52525b" : "#71717a",
    marginRight: "8px",
  });

  const sectionTitle = {
    margin: "0 0 16px",
    fontSize: "18px",
    fontWeight: 700,
    color: "#1a1a1a",
  };

  // ─── TAB CONTENT RENDERERS ────────────────────────────────────────────────

  function renderDashboard() {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        {/* Summary Cards - 2x3 grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
          <div style={summaryCardStyle}>
            <div style={labelStyle}>Total Shops</div>
            <div style={bigValueStyle}>{formatNumber(totalShops)}</div>
            <div style={subtitleStyle}>Registrierte Shops</div>
          </div>
          <div style={summaryCardStyle}>
            <div style={labelStyle}>Total Optimierungen</div>
            <div style={bigValueStyle}>{formatNumber(totalOptimizations)}</div>
            <div style={subtitleStyle}>Alle Module</div>
          </div>
          <div style={summaryCardStyle}>
            <div style={labelStyle}>Optimierungen Heute</div>
            <div style={bigValueStyle}>{formatNumber(optimizationsToday)}</div>
            <div style={subtitleStyle}>Seit Mitternacht</div>
          </div>
          <div style={summaryCardStyle}>
            <div style={labelStyle}>Gesch\u00e4tzte API-Kosten</div>
            <div style={{ ...bigValueStyle, color: estimatedCostUSD > 10 ? "#71717a" : "#18181b" }}>
              ${estimatedCostUSD.toFixed(2)}
            </div>
            <div style={subtitleStyle}>Gemini 2.5 Flash</div>
          </div>
          <div style={summaryCardStyle}>
            <div style={labelStyle}>Content-Versionen</div>
            <div style={bigValueStyle}>{formatNumber(contentVersionCount)}</div>
            <div style={subtitleStyle}>Gespeicherte Versionen</div>
          </div>
          <div style={summaryCardStyle}>
            <div style={labelStyle}>Admin-Benutzer</div>
            <div style={bigValueStyle}>{formatNumber(adminUserCount)}</div>
            <div style={subtitleStyle}>Registriert</div>
          </div>
        </div>

        {/* Module Usage Breakdown with progress bars */}
        <div style={cardStyle}>
          <h3 style={sectionTitle}>Modul-Nutzung</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Modul</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Gesamt</th>
                  <th style={thStyle}>Verteilung</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Heute</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>7 Tage</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>30 Tage</th>
                </tr>
              </thead>
              <tbody>
                {MODULE_KEYS.map((key, i) => {
                  const stats = moduleStats[key] || {};
                  const maxTotal = Math.max(...MODULE_KEYS.map((k) => (moduleStats[k]?.total || 0)), 1);
                  const pct = ((stats.total || 0) / maxTotal) * 100;
                  return (
                    <tr key={key} style={{ background: i % 2 === 0 ? "#ffffff" : "#f9fafb" }}>
                      <td style={tdStyle}>
                        <span style={{ marginRight: "8px" }}>{MODULE_ICONS[key]}</span>
                        {MODULE_LABELS[key]}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>{formatNumber(stats.total)}</td>
                      <td style={{ ...tdStyle, minWidth: "150px" }}>
                        <div style={{ background: "#f3f4f6", borderRadius: "4px", height: "8px", width: "100%" }}>
                          <div style={{
                            background: "#09090b",
                            borderRadius: "4px",
                            height: "8px",
                            width: `${pct}%`,
                            transition: "width 0.3s",
                          }} />
                        </div>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{formatNumber(stats.today)}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{formatNumber(stats.week)}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{formatNumber(stats.month)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Activity */}
        <div style={cardStyle}>
          <h3 style={sectionTitle}>Letzte Aktivit\u00e4ten</h3>
          {recentActivity.length === 0 ? (
            <p style={{ color: "#6b7280" }}>Keine Aktivit\u00e4ten vorhanden.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Shop</th>
                    <th style={thStyle}>Modul</th>
                    <th style={thStyle}>Produkt-ID</th>
                    <th style={thStyle}>Zeitpunkt</th>
                  </tr>
                </thead>
                <tbody>
                  {recentActivity.map((a, i) => (
                    <tr key={a.id || i} style={{ background: i % 2 === 0 ? "#ffffff" : "#f9fafb" }}>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{a.shop}</td>
                      <td style={tdStyle}>
                        <span style={badgeStyle("indigo")}>{MODULE_LABELS[a.module] || a.module}</span>
                      </td>
                      <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "13px", color: "#6b7280" }}>{a.productId || "\u2014"}</td>
                      <td style={{ ...tdStyle, color: "#6b7280", fontSize: "13px" }}>{formatDate(a.optimizedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderShops() {
    const selectedCount = Object.values(bulkSelectedShops).filter(Boolean).length;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        {/* Search & Bulk Actions */}
        <div style={cardStyle}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "flex-end" }}>
            <div style={{ flex: "1", minWidth: "250px" }}>
              <label style={{ display: "block", fontSize: "13px", color: "#6b7280", marginBottom: "6px", fontWeight: 600 }}>Shop suchen</label>
              <input
                type="text"
                value={shopFilter}
                onChange={(e) => setShopFilter(e.target.value)}
                placeholder="Shop-Name filtern..."
                style={inputStyle}
              />
            </div>
            {selectedCount > 0 && (
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ fontSize: "13px", color: "#6b7280", fontWeight: 600 }}>{selectedCount} ausgew\u00e4hlt</span>
                <select
                  value={bulkPlan}
                  onChange={(e) => setBulkPlan(e.target.value)}
                  style={{ ...selectStyle, width: "auto", minWidth: "140px" }}
                >
                  <option value="none">Kein Override</option>
                  <option value="Starter">Starter</option>
                  <option value="Growth">Growth</option>
                  <option value="Pro">Pro</option>
                  <option value="Enterprise">Enterprise</option>
                  <option value="Admin">Admin</option>
                </select>
                <span style={{ fontSize: "12px", color: "#6b7280" }}>
                  (Bulk-Plan wird einzeln per Formular gesetzt)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Shop Table */}
        <div style={cardStyle}>
          <h3 style={sectionTitle}>
            Alle Shops ({filteredShops.length}{shopFilter ? ` von ${shops.length}` : ""})
          </h3>
          {filteredShops.length === 0 ? (
            <p style={{ color: "#6b7280" }}>Keine Shops gefunden.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: "40px" }}>
                      <input
                        type="checkbox"
                        onChange={(e) => {
                          const newSel = {};
                          if (e.target.checked) {
                            filteredShops.forEach((s) => { newSel[s.shop] = true; });
                          }
                          setBulkSelectedShops(newSel);
                        }}
                        checked={filteredShops.length > 0 && filteredShops.every((s) => bulkSelectedShops[s.shop])}
                      />
                    </th>
                    <th style={thStyle}>Shop</th>
                    <th style={thStyle}>Plan</th>
                    <th style={thStyle}>Override</th>
                    <th style={thStyle}>Brand DNA</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Optimierungen</th>
                    <th style={thStyle}>Letzte Aktivit\u00e4t</th>
                    <th style={thStyle}>Beigetreten</th>
                    <th style={thStyle}>Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredShops.map((s, i) => {
                    const isExpanded = expandedShops[s.shop];
                    return (
                      <React.Fragment key={s.shop}>
                        <tr style={{ background: i % 2 === 0 ? "#ffffff" : "#f9fafb" }}>
                          <td style={tdStyle}>
                            <input
                              type="checkbox"
                              checked={!!bulkSelectedShops[s.shop]}
                              onChange={(e) => setBulkSelectedShops((prev) => ({ ...prev, [s.shop]: e.target.checked }))}
                            />
                          </td>
                          <td style={{ ...tdStyle, fontWeight: 600 }}>{s.shop}</td>
                          <td style={tdStyle}>
                            <span style={badgeStyle(planBadgeColor(s.plan))}>{s.plan}</span>
                          </td>
                          <td style={tdStyle}>
                            {s.planOverride ? (
                              <span style={badgeStyle("yellow")}>{s.planOverride}</span>
                            ) : (
                              <span style={{ color: "#6b7280", fontSize: "13px" }}>Kein Override</span>
                            )}
                          </td>
                          <td style={tdStyle}>
                            <span style={badgeStyle(s.brandVoice ? "green" : "gray")}>
                              {s.brandVoice ? "Konfiguriert" : "Nicht gesetzt"}
                            </span>
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>{formatNumber(s.totalOptimizations)}</td>
                          <td style={{ ...tdStyle, color: "#6b7280", fontSize: "13px" }}>{formatDate(s.lastActivity)}</td>
                          <td style={{ ...tdStyle, color: "#6b7280", fontSize: "13px" }}>{formatDateShort(s.joinedDate)}</td>
                          <td style={tdStyle}>
                            <button
                              onClick={() => setExpandedShops((prev) => ({ ...prev, [s.shop]: !prev[s.shop] }))}
                              style={{ ...btnSecondary, padding: "6px 14px", fontSize: "13px" }}
                            >
                              {isExpanded ? "Schliessen" : "Details"}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan="9" style={{ padding: "0", borderBottom: "1px solid #e1e3e5" }}>
                              <div style={{ padding: "20px 24px", background: "#f9fafb" }}>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "24px", marginBottom: "20px" }}>
                                  {/* Per-module usage */}
                                  <div style={{ flex: "1", minWidth: "300px" }}>
                                    <h4 style={{ margin: "0 0 12px", fontSize: "15px", color: "#09090b", fontWeight: 700 }}>Modul-Nutzung</h4>
                                    <table style={{ ...tableStyle, fontSize: "13px" }}>
                                      <tbody>
                                        {MODULE_KEYS.map((key) => (
                                          <tr key={key}>
                                            <td style={{ padding: "6px 12px", color: "#6b7280" }}>{MODULE_LABELS[key]}</td>
                                            <td style={{ padding: "6px 12px", color: "#1a1a1a", textAlign: "right", fontWeight: 600 }}>
                                              {formatNumber(s.moduleUsage[key] || 0)}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                  {/* Brand DNA */}
                                  <div style={{ flex: "1", minWidth: "300px" }}>
                                    <h4 style={{ margin: "0 0 12px", fontSize: "15px", color: "#09090b", fontWeight: 700 }}>Brand DNA</h4>
                                    <div style={{ fontSize: "13px", lineHeight: "1.8" }}>
                                      <div>
                                        <span style={{ color: "#6b7280" }}>Brand Voice: </span>
                                        <span style={{ color: "#1a1a1a" }}>{s.brandVoiceText || "\u2014"}</span>
                                      </div>
                                      <div>
                                        <span style={{ color: "#6b7280" }}>Zielgruppe: </span>
                                        <span style={{ color: "#1a1a1a" }}>{s.targetAudience || "\u2014"}</span>
                                      </div>
                                      <div>
                                        <span style={{ color: "#6b7280" }}>No-Gos: </span>
                                        <span style={{ color: "#1a1a1a" }}>{s.noGos || "\u2014"}</span>
                                      </div>
                                      <div style={{ marginTop: "8px" }}>
                                        <span style={{ color: "#6b7280" }}>Content-Versionen: </span>
                                        <span style={{ color: "#1a1a1a", fontWeight: 600 }}>{formatNumber(s.contentVersionsCount)}</span>
                                      </div>
                                      <div>
                                        <span style={{ color: "#6b7280" }}>Shop-Analysen: </span>
                                        <span style={{ color: "#1a1a1a", fontWeight: 600 }}>{formatNumber(s.shopAnalysisCount)}</span>
                                      </div>
                                    </div>
                                    {/* Brand DNA Edit Form */}
                                    <Form method="post" style={{ marginTop: "16px", paddingTop: "12px", borderTop: "1px solid #e1e3e5" }}>
                                      <input type="hidden" name="_action" value="updateShopSettings" />
                                      <input type="hidden" name="shop" value={s.shop} />
                                      <h4 style={{ margin: "0 0 8px", fontSize: "13px", color: "#09090b", fontWeight: 600 }}>Brand DNA bearbeiten</h4>
                                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                        <input name="brandVoice" defaultValue={s.brandVoiceText || ""} placeholder="Brand Voice..." style={inputStyle} />
                                        <input name="targetAudience" defaultValue={s.targetAudience || ""} placeholder="Zielgruppe..." style={inputStyle} />
                                        <input name="noGos" defaultValue={s.noGos || ""} placeholder="No-Gos..." style={inputStyle} />
                                        <button type="submit" style={{ ...btnPrimary, padding: "8px 14px", fontSize: "13px", width: "fit-content" }} disabled={isSubmitting}>
                                          Brand DNA speichern
                                        </button>
                                      </div>
                                    </Form>
                                  </div>
                                </div>
                                {/* Actions row */}
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", paddingTop: "16px", borderTop: "1px solid #e1e3e5" }}>
                                  {/* Plan override form */}
                                  <Form method="post" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                    <input type="hidden" name="_action" value="overridePlan" />
                                    <input type="hidden" name="shop" value={s.shop} />
                                    <select name="plan" defaultValue={s.planOverride || "none"} style={{ ...selectStyle, width: "auto", minWidth: "140px" }}>
                                      <option value="none">Kein Override</option>
                                      <option value="Starter">Starter</option>
                                      <option value="Growth">Growth</option>
                                      <option value="Pro">Pro</option>
                                      <option value="Enterprise">Enterprise</option>
                                      <option value="Admin">Admin</option>
                                    </select>
                                    <button type="submit" style={btnPrimary} disabled={isSubmitting}>
                                      Plan setzen
                                    </button>
                                  </Form>
                                  {/* Reset usage */}
                                  {confirmResetUsage === s.shop ? (
                                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                      <span style={{ color: "#52525b", fontSize: "13px", fontWeight: 600 }}>Wirklich zur\u00fccksetzen?</span>
                                      <Form method="post" style={{ display: "inline" }}>
                                        <input type="hidden" name="_action" value="resetUsage" />
                                        <input type="hidden" name="shop" value={s.shop} />
                                        <button type="submit" style={{ ...btnDanger, padding: "8px 14px", fontSize: "13px" }} disabled={isSubmitting}>
                                          Ja, zur\u00fccksetzen
                                        </button>
                                      </Form>
                                      <button onClick={() => setConfirmResetUsage(null)} style={{ ...btnSecondary, padding: "8px 14px", fontSize: "13px" }}>Abbrechen</button>
                                    </div>
                                  ) : (
                                    <button onClick={() => setConfirmResetUsage(s.shop)} style={{ ...btnSecondary, borderColor: "#d4d4d8", color: "#52525b" }}>
                                      Usage zur\u00fccksetzen
                                    </button>
                                  )}
                                  {/* Delete all shop data */}
                                  {confirmShopDelete === s.shop ? (
                                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                      <span style={{ color: "#71717a", fontSize: "13px", fontWeight: 600 }}>ALLE Daten l\u00f6schen?</span>
                                      <Form method="post" style={{ display: "inline" }}>
                                        <input type="hidden" name="_action" value="deleteShopData" />
                                        <input type="hidden" name="shop" value={s.shop} />
                                        <button type="submit" style={{ ...btnDanger, padding: "8px 14px", fontSize: "13px" }} disabled={isSubmitting}>
                                          Endg\u00fcltig l\u00f6schen
                                        </button>
                                      </Form>
                                      <button onClick={() => setConfirmShopDelete(null)} style={{ ...btnSecondary, padding: "8px 14px", fontSize: "13px" }}>Abbrechen</button>
                                    </div>
                                  ) : (
                                    <button onClick={() => setConfirmShopDelete(s.shop)} style={{ ...btnSecondary, borderColor: "#3f3f46", color: "#a1a1aa" }}>
                                      Alle Daten l\u00f6schen
                                    </button>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderModules() {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        {MODULE_KEYS.map((key) => {
          const stats = moduleStats[key] || {};
          const dailyData = dailyUsageByModule[key] || {};
          const dailyEntries = Object.entries(dailyData);

          // Per-shop breakdown for this module
          const shopBreakdown = shops
            .filter((s) => (s.moduleUsage[key] || 0) > 0)
            .sort((a, b) => (b.moduleUsage[key] || 0) - (a.moduleUsage[key] || 0));

          return (
            <div key={key} style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
                <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#1a1a1a" }}>
                  <span style={{ marginRight: "10px", fontSize: "22px" }}>{MODULE_ICONS[key]}</span>
                  {MODULE_LABELS[key]}
                </h3>
                <div style={{ display: "flex", gap: "24px" }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "11px", color: "#6b7280", textTransform: "uppercase", fontWeight: 600 }}>Gesamt</div>
                    <div style={{ fontSize: "20px", fontWeight: 800, color: "#1a1a1a" }}>{formatNumber(stats.total)}</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "11px", color: "#6b7280", textTransform: "uppercase", fontWeight: 600 }}>Heute</div>
                    <div style={{ fontSize: "20px", fontWeight: 800, color: "#09090b" }}>{formatNumber(stats.today)}</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "11px", color: "#6b7280", textTransform: "uppercase", fontWeight: 600 }}>7 Tage</div>
                    <div style={{ fontSize: "20px", fontWeight: 800, color: "#18181b" }}>{formatNumber(stats.week)}</div>
                  </div>
                </div>
              </div>

              {/* Daily trend */}
              <div style={{ marginBottom: "16px" }}>
                <h4 style={{ margin: "0 0 8px", fontSize: "14px", color: "#09090b", fontWeight: 600 }}>T\u00e4glicher Verlauf (7 Tage)</h4>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "flex-end" }}>
                  {dailyEntries.map(([date, count]) => {
                    const maxCount = Math.max(...dailyEntries.map(([, c]) => c), 1);
                    const barHeight = Math.max((count / maxCount) * 60, 4);
                    const dayLabel = new Date(date + "T00:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "2-digit" });
                    return (
                      <div key={date} style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: "50px" }}>
                        <div style={{ fontSize: "14px", fontWeight: 700, color: "#1a1a1a", marginBottom: "4px" }}>{count}</div>
                        <div style={{
                          width: "32px",
                          height: `${barHeight}px`,
                          background: "#09090b",
                          borderRadius: "4px 4px 0 0",
                        }} />
                        <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "4px" }}>{dayLabel}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Shop breakdown */}
              {shopBreakdown.length > 0 && (
                <div style={{ marginBottom: "16px" }}>
                  <h4 style={{ margin: "0 0 8px", fontSize: "14px", color: "#09090b", fontWeight: 600 }}>Nutzung nach Shop</h4>
                  <table style={{ ...tableStyle, fontSize: "13px" }}>
                    <thead>
                      <tr>
                        <th style={{ ...thStyle, fontSize: "10px" }}>Shop</th>
                        <th style={{ ...thStyle, fontSize: "10px", textAlign: "right" }}>Anzahl</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shopBreakdown.slice(0, 10).map((s, i) => (
                        <tr key={s.shop} style={{ background: i % 2 === 0 ? "#ffffff" : "#f9fafb" }}>
                          <td style={{ ...tdStyle, fontSize: "13px" }}>{s.shop}</td>
                          <td style={{ ...tdStyle, fontSize: "13px", textAlign: "right", fontWeight: 600 }}>{formatNumber(s.moduleUsage[key])}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Plan limits reference */}
              <div>
                <h4 style={{ margin: "0 0 8px", fontSize: "14px", color: "#09090b", fontWeight: 600 }}>Plan-Limits</h4>
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                  {Object.entries(planLimitsData).map(([plan, limits]) => (
                    <div key={plan} style={{ padding: "8px 14px", borderRadius: "8px", background: "#f9fafb", border: "1px solid #e1e3e5", fontSize: "13px" }}>
                      <span style={{ color: "#6b7280" }}>{plan}: </span>
                      <span style={{ color: "#1a1a1a", fontWeight: 600 }}>
                        {limits[key] === -1 ? "Unbegrenzt" : limits[key] === 0 ? "Nicht verf\u00fcgbar" : `${limits[key]}/Tag`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function renderVersions() {
    return (
      <div style={cardStyle}>
        <h3 style={sectionTitle}>
          Content-Versionen ({contentVersions.length})
        </h3>
        {contentVersions.length === 0 ? (
          <p style={{ color: "#6b7280" }}>Keine Content-Versionen vorhanden.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>ID</th>
                  <th style={thStyle}>Shop</th>
                  <th style={thStyle}>Produkt-ID</th>
                  <th style={thStyle}>Erstellt</th>
                  <th style={thStyle}>Vorher</th>
                  <th style={thStyle}>Nachher</th>
                  <th style={thStyle}>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {contentVersions.map((cv, i) => {
                  const isExpanded = expandedVersions[cv.id];
                  return (
                    <React.Fragment key={cv.id}>
                      <tr style={{ background: i % 2 === 0 ? "#ffffff" : "#f9fafb" }}>
                        <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "12px", color: "#6b7280" }}>{cv.id?.slice(0, 8)}...</td>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>{cv.shop}</td>
                        <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "13px", color: "#6b7280" }}>
                          {cv.productId ? (cv.productId.length > 20 ? cv.productId.slice(0, 20) + "..." : cv.productId) : "\u2014"}
                        </td>
                        <td style={{ ...tdStyle, color: "#6b7280", fontSize: "13px" }}>{formatDate(cv.createdAt)}</td>
                        <td style={tdStyle}>
                          <span style={badgeStyle(cv.previousData ? "green" : "gray")}>{cv.previousData ? "Ja" : "Nein"}</span>
                        </td>
                        <td style={tdStyle}>
                          <span style={badgeStyle(cv.newData ? "green" : "gray")}>{cv.newData ? "Ja" : "Nein"}</span>
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button
                              onClick={() => setExpandedVersions((prev) => ({ ...prev, [cv.id]: !prev[cv.id] }))}
                              style={{ ...btnSecondary, padding: "6px 12px", fontSize: "13px" }}
                            >
                              {isExpanded ? "Schliessen" : "Anzeigen"}
                            </button>
                            {confirmActions[`delVer_${cv.id}`] ? (
                              <React.Fragment>
                                <Form method="post" style={{ display: "inline" }}>
                                  <input type="hidden" name="_action" value="deleteVersion" />
                                  <input type="hidden" name="versionId" value={cv.id} />
                                  <button type="submit" style={{ ...btnDanger, padding: "6px 12px", fontSize: "13px" }} disabled={isSubmitting}>
                                    Ja
                                  </button>
                                </Form>
                                <button onClick={() => setConfirmActions((p) => ({ ...p, [`delVer_${cv.id}`]: false }))} style={{ ...btnSecondary, padding: "6px 12px", fontSize: "13px" }}>
                                  Nein
                                </button>
                              </React.Fragment>
                            ) : (
                              <button
                                onClick={() => setConfirmActions((p) => ({ ...p, [`delVer_${cv.id}`]: true }))}
                                style={{ ...btnSecondary, padding: "6px 12px", fontSize: "13px", borderColor: "#3f3f46", color: "#a1a1aa" }}
                              >
                                L\u00f6schen
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan="7" style={{ padding: "0", borderBottom: "1px solid #e1e3e5" }}>
                            <div style={{ padding: "16px 24px", background: "#f9fafb" }}>
                              <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
                                <div style={{ flex: "1", minWidth: "300px" }}>
                                  <h4 style={{ margin: "0 0 8px", fontSize: "14px", color: "#52525b", fontWeight: 600 }}>Vorherige Daten</h4>
                                  <pre style={{
                                    background: "#ffffff",
                                    padding: "12px",
                                    borderRadius: "8px",
                                    border: "1px solid #e1e3e5",
                                    fontSize: "12px",
                                    color: "#374151",
                                    overflow: "auto",
                                    maxHeight: "300px",
                                    whiteSpace: "pre-wrap",
                                    wordBreak: "break-all",
                                  }}>
                                    {cv.previousData
                                      ? JSON.stringify(tryParseJSON(cv.previousData), null, 2)
                                      : "Keine Daten"}
                                  </pre>
                                </div>
                                <div style={{ flex: "1", minWidth: "300px" }}>
                                  <h4 style={{ margin: "0 0 8px", fontSize: "14px", color: "#18181b", fontWeight: 600 }}>Neue Daten</h4>
                                  <pre style={{
                                    background: "#ffffff",
                                    padding: "12px",
                                    borderRadius: "8px",
                                    border: "1px solid #e1e3e5",
                                    fontSize: "12px",
                                    color: "#374151",
                                    overflow: "auto",
                                    maxHeight: "300px",
                                    whiteSpace: "pre-wrap",
                                    wordBreak: "break-all",
                                  }}>
                                    {cv.newData
                                      ? JSON.stringify(tryParseJSON(cv.newData), null, 2)
                                      : "Keine Daten"}
                                  </pre>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  function renderAnalysis() {
    return (
      <div style={cardStyle}>
        <h3 style={sectionTitle}>
          Shop-Analysen ({shopAnalysisReports.length})
        </h3>
        {shopAnalysisReports.length === 0 ? (
          <p style={{ color: "#6b7280" }}>Keine Shop-Analysen vorhanden.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>ID</th>
                  <th style={thStyle}>Shop</th>
                  <th style={thStyle}>Score</th>
                  <th style={thStyle}>Erstellt</th>
                  <th style={thStyle}>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {shopAnalysisReports.map((r, i) => {
                  const isExpanded = expandedAnalysis[r.id];
                  return (
                    <React.Fragment key={r.id}>
                      <tr style={{ background: i % 2 === 0 ? "#ffffff" : "#f9fafb" }}>
                        <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "12px", color: "#6b7280" }}>{r.id?.slice(0, 8)}...</td>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>{r.shop}</td>
                        <td style={tdStyle}>
                          <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            fontWeight: 700,
                            fontSize: "16px",
                            color: scoreColor(r.overallScore),
                          }}>
                            <span style={{
                              width: "10px",
                              height: "10px",
                              borderRadius: "50%",
                              background: scoreColor(r.overallScore),
                              display: "inline-block",
                            }} />
                            {r.overallScore != null ? r.overallScore : "\u2014"}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, color: "#6b7280", fontSize: "13px" }}>{formatDate(r.createdAt)}</td>
                        <td style={tdStyle}>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button
                              onClick={() => setExpandedAnalysis((prev) => ({ ...prev, [r.id]: !prev[r.id] }))}
                              style={{ ...btnSecondary, padding: "6px 12px", fontSize: "13px" }}
                            >
                              {isExpanded ? "Schliessen" : "Details"}
                            </button>
                            {confirmActions[`delAn_${r.id}`] ? (
                              <React.Fragment>
                                <Form method="post" style={{ display: "inline" }}>
                                  <input type="hidden" name="_action" value="deleteAnalysis" />
                                  <input type="hidden" name="reportId" value={r.id} />
                                  <button type="submit" style={{ ...btnDanger, padding: "6px 12px", fontSize: "13px" }} disabled={isSubmitting}>
                                    Ja
                                  </button>
                                </Form>
                                <button onClick={() => setConfirmActions((p) => ({ ...p, [`delAn_${r.id}`]: false }))} style={{ ...btnSecondary, padding: "6px 12px", fontSize: "13px" }}>
                                  Nein
                                </button>
                              </React.Fragment>
                            ) : (
                              <button
                                onClick={() => setConfirmActions((p) => ({ ...p, [`delAn_${r.id}`]: true }))}
                                style={{ ...btnSecondary, padding: "6px 12px", fontSize: "13px", borderColor: "#3f3f46", color: "#a1a1aa" }}
                              >
                                L\u00f6schen
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan="5" style={{ padding: "0", borderBottom: "1px solid #e1e3e5" }}>
                            <div style={{ padding: "16px 24px", background: "#f9fafb" }}>
                              <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
                                <div style={{ flex: "1", minWidth: "300px" }}>
                                  <h4 style={{ margin: "0 0 8px", fontSize: "14px", color: "#52525b", fontWeight: 600 }}>Kritische Produkte</h4>
                                  <pre style={{
                                    background: "#ffffff",
                                    padding: "12px",
                                    borderRadius: "8px",
                                    border: "1px solid #e1e3e5",
                                    fontSize: "12px",
                                    color: "#374151",
                                    overflow: "auto",
                                    maxHeight: "300px",
                                    whiteSpace: "pre-wrap",
                                    wordBreak: "break-all",
                                  }}>
                                    {r.criticalProducts
                                      ? JSON.stringify(tryParseJSON(r.criticalProducts), null, 2)
                                      : "Keine Daten"}
                                  </pre>
                                </div>
                                <div style={{ flex: "1", minWidth: "300px" }}>
                                  <h4 style={{ margin: "0 0 8px", fontSize: "14px", color: "#09090b", fontWeight: 600 }}>Bericht (Zusammenfassung)</h4>
                                  <pre style={{
                                    background: "#ffffff",
                                    padding: "12px",
                                    borderRadius: "8px",
                                    border: "1px solid #e1e3e5",
                                    fontSize: "12px",
                                    color: "#374151",
                                    overflow: "auto",
                                    maxHeight: "400px",
                                    whiteSpace: "pre-wrap",
                                    wordBreak: "break-all",
                                  }}>
                                    {r.fullReport
                                      ? (typeof tryParseJSON(r.fullReport) === "object"
                                          ? JSON.stringify(tryParseJSON(r.fullReport), null, 2)
                                          : r.fullReport)
                                      : "Kein Bericht"}
                                  </pre>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  function renderUsers() {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        {/* Mein Konto section */}
        <div style={cardStyle}>
          <h3 style={sectionTitle}>Mein Konto</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "24px", alignItems: "center" }}>
            <div style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: "#f4f4f5",
              border: "2px solid #d4d4d8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "24px",
              fontWeight: 700,
              color: "#09090b",
            }}>
              {currentAdminEmail.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "#1a1a1a" }}>{currentAdminEmail}</div>
              <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "2px" }}>
                Aktive Sitzungen: {adminSessionCount}
              </div>
            </div>
            <div style={{ marginLeft: "auto" }}>
              <span style={badgeStyle("green")}>Angemeldet</span>
            </div>
          </div>
          <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #e1e3e5" }}>
            <h4 style={{ margin: "0 0 8px", fontSize: "14px", color: "#6b7280", fontWeight: 600 }}>Login-Verlauf</h4>
            <p style={{ color: "#6b7280", fontSize: "13px", margin: 0 }}>
              Login-Verlauf wird in einer zuk\u00fcnftigen Version verf\u00fcgbar sein.
            </p>
          </div>
        </div>

        {/* User list */}
        <div style={cardStyle}>
          <h3 style={sectionTitle}>
            Admin-Benutzer ({adminUsers.length})
          </h3>
          {adminUsers.length === 0 ? (
            <p style={{ color: "#6b7280" }}>Keine Admin-Benutzer vorhanden. Erstelle den ersten Benutzer unten.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>ID</th>
                    <th style={thStyle}>E-Mail</th>
                    <th style={thStyle}>Rolle</th>
                    <th style={thStyle}>Erstellt</th>
                    <th style={thStyle}>Aktualisiert</th>
                    <th style={thStyle}>Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {adminUsers.map((u, i) => (
                    <tr key={u.id} style={{ background: i % 2 === 0 ? "#ffffff" : "#f9fafb" }}>
                      <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "12px", color: "#6b7280" }}>{u.id?.slice(0, 8)}...</td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{u.email}</td>
                      <td style={tdStyle}>
                        <span style={badgeStyle(u.role === "Admin" ? "red" : u.role === "Editor" ? "indigo" : "gray")}>
                          {u.role}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, color: "#6b7280", fontSize: "13px" }}>{formatDate(u.createdAt)}</td>
                      <td style={{ ...tdStyle, color: "#6b7280", fontSize: "13px" }}>{formatDate(u.updatedAt)}</td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          {/* Email change */}
                          <Form method="post" style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                            <input type="hidden" name="_action" value="updateEmail" />
                            <input type="hidden" name="userId" value={u.id} />
                            <input type="email" name="newEmail" defaultValue={u.email} required style={{ ...inputStyle, width: "200px", padding: "6px 10px", fontSize: "13px" }} />
                            <button type="submit" style={{ ...btnSecondary, padding: "6px 10px", fontSize: "12px" }} disabled={isSubmitting}>E-Mail speichern</button>
                          </Form>
                          {/* Role change */}
                          <Form method="post" style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                            <input type="hidden" name="_action" value="updateRole" />
                            <input type="hidden" name="userId" value={u.id} />
                            <select name="newRole" defaultValue={u.role} style={{ ...selectStyle, width: "auto", minWidth: "100px", padding: "6px 10px", fontSize: "13px" }}>
                              <option value="Admin">Admin</option>
                              <option value="Editor">Editor</option>
                              <option value="Viewer">Viewer</option>
                            </select>
                            <button type="submit" style={{ ...btnSecondary, padding: "6px 10px", fontSize: "12px" }} disabled={isSubmitting}>Rolle setzen</button>
                          </Form>
                          {/* Password change */}
                          {pwUserId === u.id ? (
                            <Form method="post" style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                              <input type="hidden" name="_action" value="updatePassword" />
                              <input type="hidden" name="userId" value={u.id} />
                              <input
                                type="password"
                                name="newPassword"
                                placeholder="Neues Passwort"
                                required
                                style={{ ...inputStyle, width: "150px", padding: "6px 10px", fontSize: "13px" }}
                              />
                              <button type="submit" style={{ ...btnPrimary, padding: "6px 10px", fontSize: "12px" }} disabled={isSubmitting}>
                                Speichern
                              </button>
                              <button type="button" onClick={() => setPwUserId(null)} style={{ ...btnSecondary, padding: "6px 10px", fontSize: "12px" }}>
                                Abbrechen
                              </button>
                            </Form>
                          ) : (
                            <button onClick={() => setPwUserId(u.id)} style={{ ...btnSecondary, padding: "6px 10px", fontSize: "12px" }}>
                              Passwort \u00e4ndern
                            </button>
                          )}
                          {/* Delete */}
                          {confirmDelete === u.id ? (
                            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                              <span style={{ color: "#71717a", fontSize: "13px", fontWeight: 600 }}>Sicher?</span>
                              <Form method="post" style={{ display: "inline" }}>
                                <input type="hidden" name="_action" value="deleteAdmin" />
                                <input type="hidden" name="userId" value={u.id} />
                                <button type="submit" style={{ ...btnDanger, padding: "6px 10px", fontSize: "12px" }} disabled={isSubmitting}>
                                  L\u00f6schen
                                </button>
                              </Form>
                              <button onClick={() => setConfirmDelete(null)} style={{ ...btnSecondary, padding: "6px 10px", fontSize: "12px" }}>Nein</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDelete(u.id)}
                              style={{ ...btnSecondary, padding: "6px 10px", fontSize: "12px", borderColor: "#3f3f46", color: "#a1a1aa" }}
                            >
                              L\u00f6schen
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Create new admin */}
        <div style={cardStyle}>
          <h3 style={sectionTitle}>Neuen Admin-Benutzer erstellen</h3>
          <Form method="post">
            <input type="hidden" name="_action" value="createAdmin" />
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ flex: "1", minWidth: "200px" }}>
                <label style={{ display: "block", fontSize: "13px", color: "#6b7280", marginBottom: "6px", fontWeight: 600 }}>E-Mail</label>
                <input type="email" name="email" required placeholder="admin@example.com" style={inputStyle} />
              </div>
              <div style={{ flex: "1", minWidth: "200px" }}>
                <label style={{ display: "block", fontSize: "13px", color: "#6b7280", marginBottom: "6px", fontWeight: 600 }}>Passwort</label>
                <input type="password" name="password" required placeholder="Sicheres Passwort" style={inputStyle} />
              </div>
              <div style={{ minWidth: "140px" }}>
                <label style={{ display: "block", fontSize: "13px", color: "#6b7280", marginBottom: "6px", fontWeight: 600 }}>Rolle</label>
                <select name="role" defaultValue="Viewer" style={selectStyle}>
                  <option value="Admin">Admin</option>
                  <option value="Editor">Editor</option>
                  <option value="Viewer">Viewer</option>
                </select>
              </div>
              <button type="submit" style={btnPrimary} disabled={isSubmitting}>
                Benutzer erstellen
              </button>
            </div>
          </Form>
        </div>
      </div>
    );
  }

  function renderSystem() {
    const mem = serverInfo.memoryUsage || {};
    const dbConnected = totalShops >= 0;
    const uptimeSeconds = serverInfo.uptime || 0;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        {/* Health Status */}
        <div style={cardStyle}>
          <h3 style={sectionTitle}>System-Gesundheit</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", padding: "16px", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e1e3e5" }}>
              <span style={statusDot(dbConnected ? "green" : "red")} />
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a" }}>Datenbank</div>
                <div style={{ fontSize: "12px", color: "#6b7280" }}>{dbConnected ? "Verbunden" : "Fehler"}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", padding: "16px", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e1e3e5" }}>
              <span style={statusDot(uptimeSeconds > 300 ? "green" : "yellow")} />
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a" }}>Server-Status</div>
                <div style={{ fontSize: "12px", color: "#6b7280" }}>Betriebszeit: {formatUptime(uptimeSeconds)}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", padding: "16px", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e1e3e5" }}>
              <span style={statusDot(mem.heapUsed && mem.heapTotal && (mem.heapUsed / mem.heapTotal) < 0.85 ? "green" : mem.heapUsed ? "yellow" : "gray")} />
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a" }}>Speicher (Heap)</div>
                <div style={{ fontSize: "12px", color: "#6b7280" }}>
                  {mem.heapUsed ? `${formatBytes(mem.heapUsed)} / ${formatBytes(mem.heapTotal)}` : "Keine Daten"}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", padding: "16px", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e1e3e5" }}>
              <span style={statusDot(adminSessionCount > 0 ? "green" : "gray")} />
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a" }}>Admin-Sitzungen</div>
                <div style={{ fontSize: "12px", color: "#6b7280" }}>{adminSessionCount} aktiv</div>
              </div>
            </div>
          </div>
        </div>

        {/* Memory Usage */}
        {mem.rss && (
          <div style={cardStyle}>
            <h3 style={sectionTitle}>Speichernutzung</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "16px" }}>
              {[
                { label: "RSS", value: mem.rss },
                { label: "Heap Total", value: mem.heapTotal },
                { label: "Heap Used", value: mem.heapUsed },
                { label: "External", value: mem.external },
              ].map((item) => (
                <div key={item.label} style={{ padding: "16px", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e1e3e5", textAlign: "center" }}>
                  <div style={{ fontSize: "11px", color: "#6b7280", textTransform: "uppercase", fontWeight: 600, marginBottom: "6px" }}>{item.label}</div>
                  <div style={{ fontSize: "20px", fontWeight: 800, color: "#1a1a1a" }}>{formatBytes(item.value)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Server Info */}
        <div style={cardStyle}>
          <h3 style={sectionTitle}>Server-Informationen</h3>
          <div style={{ fontSize: "14px", lineHeight: "2" }}>
            <div>
              <span style={{ color: "#6b7280" }}>Node.js Version: </span>
              <span style={{ fontFamily: "monospace", color: "#1a1a1a", fontWeight: 600 }}>{serverInfo.nodeVersion}</span>
            </div>
            <div>
              <span style={{ color: "#6b7280" }}>Betriebszeit: </span>
              <span style={{ fontFamily: "monospace", color: "#1a1a1a", fontWeight: 600 }}>{formatUptime(serverInfo.uptime || 0)}</span>
            </div>
            <div>
              <span style={{ color: "#6b7280" }}>Plattform: </span>
              <span style={{ fontFamily: "monospace", color: "#1a1a1a", fontWeight: 600 }}>{serverInfo.platform || "\u2014"} ({serverInfo.arch || "\u2014"})</span>
            </div>
          </div>
        </div>

        {/* Environment */}
        <div style={cardStyle}>
          <h3 style={sectionTitle}>Umgebungsvariablen</h3>
          <table style={{ ...tableStyle, fontSize: "13px" }}>
            <tbody>
              {Object.entries(envInfo).map(([key, value], i) => (
                <tr key={key} style={{ background: i % 2 === 0 ? "#ffffff" : "#f9fafb" }}>
                  <td style={{ ...tdStyle, color: "#6b7280", fontFamily: "monospace", fontSize: "12px", width: "220px", fontWeight: 600 }}>{key}</td>
                  <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "12px", wordBreak: "break-all" }}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Plan Limits Reference */}
        <div style={cardStyle}>
          <h3 style={sectionTitle}>Plan-Limits Referenz</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Modul</th>
                  {Object.keys(planLimitsData).map((plan) => (
                    <th key={plan} style={{ ...thStyle, textAlign: "center" }}>{plan}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MODULE_KEYS.map((key, i) => (
                  <tr key={key} style={{ background: i % 2 === 0 ? "#ffffff" : "#f9fafb" }}>
                    <td style={{ ...tdStyle, fontSize: "13px" }}>
                      <span style={{ marginRight: "6px" }}>{MODULE_ICONS[key]}</span>
                      {MODULE_LABELS[key]}
                    </td>
                    {Object.entries(planLimitsData).map(([plan, limits]) => (
                      <td key={plan} style={{ ...tdStyle, textAlign: "center", fontSize: "13px", fontWeight: 600 }}>
                        <span style={{
                          color: limits[key] === -1 ? "#18181b" : limits[key] === 0 ? "#71717a" : "#1a1a1a",
                        }}>
                          {limits[key] === -1 ? "\u221e" : limits[key] === 0 ? "\u2014" : limits[key]}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
                {/* Feature flags */}
                {["bulkOperationsAllowed", "autoPilotAllowed", "visionAiAllowed", "autoApplyInternalLinks"].map((flag, i) => {
                  const flagLabels = {
                    bulkOperationsAllowed: "Bulk-Operationen",
                    autoPilotAllowed: "AutoPilot",
                    visionAiAllowed: "Vision AI",
                    autoApplyInternalLinks: "Auto-Verlinkung",
                  };
                  return (
                    <tr key={flag} style={{ background: (MODULE_KEYS.length + i) % 2 === 0 ? "#ffffff" : "#f9fafb" }}>
                      <td style={{ ...tdStyle, fontSize: "13px", fontStyle: "italic" }}>{flagLabels[flag]}</td>
                      {Object.entries(planLimitsData).map(([plan, limits]) => (
                        <td key={plan} style={{ ...tdStyle, textAlign: "center", fontSize: "13px" }}>
                          <span style={badgeStyle(limits[flag] ? "green" : "red")}>
                            {limits[flag] ? "Ja" : "Nein"}
                          </span>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Admin Sessions */}
        <div style={cardStyle}>
          <h3 style={sectionTitle}>
            Aktive Admin-Sitzungen ({adminSessionCount})
          </h3>
          {adminSessionInfo.length === 0 ? (
            <p style={{ color: "#6b7280" }}>Keine aktiven Sitzungen.</p>
          ) : (
            <table style={{ ...tableStyle, fontSize: "13px" }}>
              <thead>
                <tr>
                  <th style={thStyle}>E-Mail</th>
                  <th style={thStyle}>IP</th>
                  <th style={thStyle}>Erstellt</th>
                </tr>
              </thead>
              <tbody>
                {adminSessionInfo.map((s, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "#ffffff" : "#f9fafb" }}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{s.email}</td>
                    <td style={{ ...tdStyle, fontFamily: "monospace", color: "#6b7280" }}>{s.ip}</td>
                    <td style={{ ...tdStyle, color: "#6b7280" }}>{formatDate(s.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Database Stats */}
        <div style={cardStyle}>
          <h3 style={sectionTitle}>Datenbank-Statistiken</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: "12px" }}>
            {Object.entries(dbStats).map(([model, count]) => {
              const modelLabels = {
                sessions: "Sessions",
                usageTracker: "Usage Tracker",
                contentVersions: "Content-Versionen",
                shopAnalysisReports: "Shop-Analysen",
                adminUsers: "Admin-Benutzer",
                shopSettings: "Shop-Einstellungen",
              };
              return (
                <div key={model} style={{
                  background: "#f9fafb",
                  border: "1px solid #e1e3e5",
                  borderRadius: "12px",
                  padding: "16px 20px",
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: "11px", color: "#6b7280", textTransform: "uppercase", marginBottom: "6px", fontWeight: 600 }}>
                    {modelLabels[model] || model}
                  </div>
                  <div style={{ fontSize: "24px", fontWeight: 800, color: "#1a1a1a" }}>{formatNumber(count)}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  function renderDSGVO() {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        {/* GDPR Compliance Status */}
        <div style={cardStyle}>
          <h3 style={sectionTitle}>DSGVO-Compliance Status</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", padding: "16px", background: "#f4f4f5", borderRadius: "8px", border: "1px solid #e4e4e7" }}>
              <span style={statusDot("green")} />
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#18181b" }}>Datenverschl\u00fcsselung</div>
                <div style={{ fontSize: "12px", color: "#6b7280" }}>Passw\u00f6rter werden mit bcrypt gehasht</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", padding: "16px", background: "#f4f4f5", borderRadius: "8px", border: "1px solid #e4e4e7" }}>
              <span style={statusDot("green")} />
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#18181b" }}>Session-Verwaltung</div>
                <div style={{ fontSize: "12px", color: "#6b7280" }}>HttpOnly, Secure, SameSite Cookies</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", padding: "16px", background: "#f4f4f5", borderRadius: "8px", border: "1px solid #e4e4e7" }}>
              <span style={statusDot("green")} />
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#18181b" }}>Datenl\u00f6schung</div>
                <div style={{ fontSize: "12px", color: "#6b7280" }}>Shop-Daten k\u00f6nnen vollst\u00e4ndig gel\u00f6scht werden</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", padding: "16px", background: "#e4e4e7", borderRadius: "8px", border: "1px solid #d4d4d8" }}>
              <span style={statusDot("yellow")} />
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#52525b" }}>Audit-Logging</div>
                <div style={{ fontSize: "12px", color: "#6b7280" }}>Wird in einer zuk\u00fcnftigen Version implementiert</div>
              </div>
            </div>
          </div>
        </div>

        {/* Data Retention */}
        <div style={cardStyle}>
          <h3 style={sectionTitle}>Datenaufbewahrung</h3>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Datentyp</th>
                <th style={thStyle}>Aufbewahrungsdauer</th>
                <th style={thStyle}>Aktueller Bestand</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {[
                { type: "Nutzungsdaten (Usage Tracker)", retention: "Unbegrenzt (manuell l\u00f6schbar)", count: dbStats.usageTracker || 0, status: "green" },
                { type: "Content-Versionen", retention: "Letzte 100 werden angezeigt", count: dbStats.contentVersions || 0, status: "green" },
                { type: "Shop-Analysen", retention: "Unbegrenzt (manuell l\u00f6schbar)", count: dbStats.shopAnalysisReports || 0, status: "green" },
                { type: "Shop-Einstellungen", retention: "Bis zur L\u00f6schung", count: dbStats.shopSettings || 0, status: "green" },
                { type: "Admin-Sitzungen", retention: "Nur aktive Sitzungen", count: adminSessionCount, status: "green" },
                { type: "Admin-Benutzer", retention: "Bis zur L\u00f6schung", count: dbStats.adminUsers || 0, status: "green" },
              ].map((row, i) => (
                <tr key={row.type} style={{ background: i % 2 === 0 ? "#ffffff" : "#f9fafb" }}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{row.type}</td>
                  <td style={{ ...tdStyle, color: "#6b7280" }}>{row.retention}</td>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{formatNumber(row.count)}</td>
                  <td style={tdStyle}>
                    <span style={badgeStyle(row.status)}>Konform</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Data Deletion Tools */}
        <div style={cardStyle}>
          <h3 style={sectionTitle}>Datenl\u00f6schung</h3>
          <p style={{ color: "#6b7280", fontSize: "14px", marginTop: 0, marginBottom: "16px" }}>
            Um alle Daten eines Shops zu l\u00f6schen, nutzen Sie die "Alle Daten l\u00f6schen"-Funktion in der Shop-Verwaltung.
            Dies entfernt alle Nutzungsdaten, Content-Versionen, Analysen und Einstellungen f\u00fcr den jeweiligen Shop.
          </p>
          <button
            onClick={() => setActiveTab("shops")}
            style={btnPrimary}
          >
            Zur Shop-Verwaltung
          </button>
        </div>

        {/* Privacy Controls */}
        <div style={cardStyle}>
          <h3 style={sectionTitle}>Datenschutz-Kontrollen</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e1e3e5" }}>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a" }}>API-Schl\u00fcssel Maskierung</div>
                <div style={{ fontSize: "12px", color: "#6b7280" }}>Sensible Schl\u00fcssel werden im Admin-Panel maskiert angezeigt</div>
              </div>
              <span style={badgeStyle("green")}>Aktiv</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e1e3e5" }}>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a" }}>Datenbank-URL Schutz</div>
                <div style={{ fontSize: "12px", color: "#6b7280" }}>Anmeldedaten werden in der Anzeige entfernt</div>
              </div>
              <span style={badgeStyle("green")}>Aktiv</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e1e3e5" }}>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a" }}>Passwort-Hashing</div>
                <div style={{ fontSize: "12px", color: "#6b7280" }}>Alle Passw\u00f6rter werden mit bcrypt gehasht gespeichert</div>
              </div>
              <span style={badgeStyle("green")}>Aktiv</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e1e3e5" }}>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a" }}>HTTPS-Only Cookies</div>
                <div style={{ fontSize: "12px", color: "#6b7280" }}>Admin-Sessions verwenden Secure und HttpOnly Flags</div>
              </div>
              <span style={badgeStyle("green")}>Aktiv</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderAuditLog() {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        <div style={cardStyle}>
          <h3 style={sectionTitle}>Audit-Log</h3>
          <div style={{ padding: "40px 24px", textAlign: "center" }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>{"\u{1F4CB}"}</div>
            <h4 style={{ margin: "0 0 8px", fontSize: "18px", fontWeight: 700, color: "#1a1a1a" }}>
              Audit-Logging wird implementiert
            </h4>
            <p style={{ color: "#6b7280", fontSize: "14px", maxWidth: "500px", margin: "0 auto", lineHeight: "1.6" }}>
              In einer zuk\u00fcnftigen Version werden hier alle administrativen Aktionen protokolliert:
              Plan-\u00c4nderungen, Benutzer-Verwaltung, Datenl\u00f6schungen und Konfigurationsanpassungen.
            </p>
            <div style={{ marginTop: "24px", display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}>
              {[
                { label: "Plan-\u00c4nderungen", icon: "\u{1F4CB}" },
                { label: "Benutzer-Aktionen", icon: "\u{1F465}" },
                { label: "Datenl\u00f6schungen", icon: "\u{1F5D1}" },
                { label: "Konfiguration", icon: "\u{2699}" },
              ].map((item) => (
                <div key={item.label} style={{
                  padding: "12px 20px",
                  background: "#f9fafb",
                  border: "1px solid #e1e3e5",
                  borderRadius: "8px",
                  fontSize: "13px",
                  color: "#6b7280",
                }}>
                  <span style={{ marginRight: "6px" }}>{item.icon}</span>
                  {item.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── MAIN RENDER ──────────────────────────────────────────────────────────

  const tabContent = {
    dashboard: renderDashboard,
    shops: renderShops,
    modules: renderModules,
    versions: renderVersions,
    analysis: renderAnalysis,
    users: renderUsers,
    system: renderSystem,
    dsgvo: renderDSGVO,
    audit: renderAuditLog,
  };

  return (
    <div style={pageStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 800, letterSpacing: "-0.5px", color: "#1a1a1a" }}>
              <span style={{ color: "#09090b" }}>Titan</span> GEO Core
            </h1>
            <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#6b7280" }}>
              Enterprise Admin Panel v1.0
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "13px", color: "#6b7280" }}>Eingeloggt als</div>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a" }}>{currentAdminEmail}</div>
          </div>
          <Form method="post">
            <input type="hidden" name="_action" value="logout" />
            <button
              type="submit"
              style={{
                padding: "8px 20px",
                borderRadius: "8px",
                border: "1px solid #3f3f46",
                background: "#18181b",
                color: "#a1a1aa",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              Abmelden
            </button>
          </Form>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{
        background: "#ffffff",
        padding: "0 32px",
        borderBottom: "1px solid #e1e3e5",
        display: "flex",
        gap: "0",
        flexWrap: "wrap",
        overflowX: "auto",
      }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={tabStyle(activeTab === tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Action Feedback */}
      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "0 32px" }}>
        {actionData?.message && (
          <div style={{
            margin: "16px 0 0",
            padding: "14px 20px",
            borderRadius: "12px",
            background: "#f4f4f5",
            border: "1px solid #d4d4d8",
            color: "#18181b",
            fontSize: "14px",
            fontWeight: 600,
          }}>
            {actionData.message}
          </div>
        )}
        {actionData?.error && (
          <div style={{
            margin: "16px 0 0",
            padding: "14px 20px",
            borderRadius: "12px",
            background: "#18181b",
            border: "1px solid #3f3f46",
            color: "#a1a1aa",
            fontSize: "14px",
            fontWeight: 600,
          }}>
            {actionData.error}
          </div>
        )}
      </div>

      {/* Tab Content */}
      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "24px 32px 48px" }}>
        {tabContent[activeTab]?.()}
      </div>
    </div>
  );
}
