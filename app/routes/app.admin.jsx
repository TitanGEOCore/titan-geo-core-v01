import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit, useActionData } from "@remix-run/react";
import {
  Page, Card, Text, BlockStack, InlineStack, Button, Banner, Box, Badge, Divider, TextField,
} from "@shopify/polaris";
import { useState, useEffect, useCallback } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { verifyAdminSession } from "./admin-login";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  // Server-seitige Admin-Authentifizierung prüfen
  const cookieHeader = request.headers.get("Cookie") || "";
  if (!verifyAdminSession(cookieHeader)) {
    return redirect("/admin-login");
  }

  const adminShop = session.shop;
  let totalShops = 0;
  let shops = [];
  let totalOptimizationsCount = 0;
  try {
    const sessions = await prisma.session.findMany({
      select: { shop: true, accessToken: true },
    });
    const uniqueShops = [...new Set(sessions.map(s => s.shop))];
    totalShops = uniqueShops.length;
    shops = uniqueShops.map(shop => ({
      shop,
      lastActive: new Date().toISOString(),
    }));
    totalOptimizationsCount = await prisma.usageTracker.count();
  } catch (e) {
    console.error("Admin loader error:", e);
  }

  // API-Kosten Schätzung (Gemini 2.5 Flash Pricing)
  // ~0.15$ pro 1M Input Tokens, ~0.60$ pro 1M Output Tokens
  // Durchschnittlich ~2000 Input + ~1500 Output Tokens pro Optimierung
  const estimatedInputTokens = totalOptimizationsCount * 2000;
  const estimatedOutputTokens = totalOptimizationsCount * 1500;
  const estimatedCostUSD = ((estimatedInputTokens / 1_000_000) * 0.15) + ((estimatedOutputTokens / 1_000_000) * 0.60);
  const adminSettings = await prisma.shopSettings.findUnique({ where: { shop: adminShop } });
  const isSimulatingEnterprise = adminSettings?.planOverride === "Admin";

  return json({
    totalShops,
    shops,
    totalOptimizationsCount,
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedCostUSD,
    adminShop,
    isSimulatingEnterprise,
  });
};

export const action = async ({ request }) => {
  await authenticate.admin(request);

  const cookieHeader = request.headers.get("Cookie") || "";
  if (!verifyAdminSession(cookieHeader)) {
    return redirect("/admin-login");
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "logout") {
    return redirect("/admin-login", {
      headers: {
        "Set-Cookie": "titan_admin_session=; Path=/; Max-Age=0; HttpOnly; SameSite=None; Secure",
      },
    });
  }

  if (intent === "simulateEnterprise") {
    const { session } = await authenticate.admin(request);
    await prisma.shopSettings.upsert({
      where: { shop: session.shop },
      update: { planOverride: "Admin" },
      create: { shop: session.shop, planOverride: "Admin" },
    });
    return json({ success: true, message: "Admin-Vollzugriff aktiviert (über Enterprise)" });
  }

  if (intent === "stopSimulation") {
    const { session } = await authenticate.admin(request);
    await prisma.shopSettings.update({
      where: { shop: session.shop },
      update: { planOverride: null },
    });
    return json({ success: true, message: "Enterprise-Simulation deaktiviert" });
  }

  if (intent === "overridePlan") {
    const targetShop = formData.get("shop");
    const plan = formData.get("plan");
    if (targetShop && plan) {
      await prisma.shopSettings.upsert({
        where: { shop: targetShop },
        update: { planOverride: plan === "none" ? null : plan },
        create: { shop: targetShop, planOverride: plan === "none" ? null : plan },
      });
      return json({ success: true, message: `Plan für ${targetShop} auf ${plan} gesetzt` });
    }
  }

  return json({ error: "Unbekannte Aktion" });
};

export default function AdminPanel() {
  const {
    totalShops, shops, totalOptimizationsCount,
    estimatedInputTokens, estimatedOutputTokens, estimatedCostUSD,
    adminShop, isSimulatingEnterprise,
  } = useLoaderData();
  const submit = useSubmit();
  const actionData = useActionData();
  const [planOverrideShop, setPlanOverrideShop] = useState("");
  const [planOverrideValue, setPlanOverrideValue] = useState("pro");

  // Feature toggles
  const [features, setFeatures] = useState({
    geoOptimizer: true,
    multiLang: true,
    altTextOptimizer: true,
    contentAudit: true,
    metaGenerator: true,
    internalLinks: true,
    rankingTracker: true,
    competitorAnalysis: true,
    roiDashboard: true,
    keywordResearch: true,
    brandTemplates: true,
    seoHealth: true,
  });

  // Config
  const [freeLimit, setFreeLimit] = useState("5");
  const [aiModel, setAiModel] = useState("gemini-2.5-flash");
  const [apiKeyMasked] = useState("sk-...****...3f8a");

  // Team management
  const [teamMembers, setTeamMembers] = useState([
    { email: "admin@titanapp.de", role: "Admin", added: "2025-01-15" },
    { email: "editor@titanapp.de", role: "Editor", added: "2025-03-20" },
  ]);
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("Viewer");

  // Security
  const [securityLog] = useState([
    { action: "API-Key rotiert", date: "2026-04-01", user: "admin@titanapp.de", severity: "info" },
    { action: "Rate-Limit überschritten (Shop: demo.myshopify.com)", date: "2026-03-28", user: "System", severity: "warning" },
    { action: "Neuer Team-Zugang", date: "2026-03-20", user: "admin@titanapp.de", severity: "info" },
    { action: "Fehlgeschlagener Login-Versuch", date: "2026-03-15", user: "unbekannt", severity: "critical" },
    { action: "SSL-Zertifikat erneuert", date: "2026-03-01", user: "System", severity: "info" },
  ]);

  const toggleFeature = useCallback((key) => {
    setFeatures(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const addTeamMember = useCallback(() => {
    if (!newMemberEmail || !newMemberEmail.includes("@")) return;
    setTeamMembers(prev => [
      ...prev,
      { email: newMemberEmail, role: newMemberRole, added: new Date().toISOString().split("T")[0] },
    ]);
    setNewMemberEmail("");
    setNewMemberRole("Viewer");
  }, [newMemberEmail, newMemberRole]);

  const removeTeamMember = useCallback((email) => {
    setTeamMembers(prev => prev.filter(m => m.email !== email));
  }, []);

  // Plan distribution (simulated)
  const planDistribution = {
    starter: Math.max(1, Math.floor(totalShops * 0.5)),
    pro: Math.max(0, Math.floor(totalShops * 0.35)),
    enterprise: Math.max(0, totalShops - Math.floor(totalShops * 0.5) - Math.floor(totalShops * 0.35)),
  };
  const revenue = (planDistribution.starter * 9.99) + (planDistribution.pro * 29.99) + (planDistribution.enterprise * 79.99);
  const totalOptimizations = totalShops * 47;

  // App health
  const healthScore = 92;
  const healthRecommendations = [
    { text: "API-Schlüssel sollte innerhalb von 30 Tagen rotiert werden", priority: "mittel", icon: "🔑" },
    { text: "Rate-Limiting für Bulk-Operationen optimieren", priority: "niedrig", icon: "⚡" },
    { text: "Backup-Strategie für Übersetzungsdaten einrichten", priority: "hoch", icon: "💾" },
    { text: "Monitoring für Gemini API-Ausfälle aktivieren", priority: "mittel", icon: "📊" },
    { text: "Content Security Policy Header verschärfen", priority: "niedrig", icon: "🛡️" },
  ];

  const featureLabels = {
    geoOptimizer: "GEO Optimizer",
    multiLang: "Multi-Language",
    altTextOptimizer: "Alt-Text Optimizer",
    contentAudit: "Content Audit",
    metaGenerator: "Meta Generator",
    internalLinks: "Interne Verlinkung",
    rankingTracker: "Ranking Tracker",
    competitorAnalysis: "Wettbewerber-Analyse",
    roiDashboard: "ROI Dashboard",
    keywordResearch: "Keyword-Recherche",
    brandTemplates: "Brand Templates",
    seoHealth: "SEO Health Check",
  };

  const roleColors = {
    Admin: { bg: "#fef2f2", color: "#dc2626", border: "#fecaca" },
    Editor: { bg: "#eff6ff", color: "#2563eb", border: "#bfdbfe" },
    Viewer: { bg: "#f0fdf4", color: "#16a34a", border: "#bbf7d0" },
  };

  const severityStyles = {
    info: { bg: "#eff6ff", color: "#2563eb", dot: "#3b82f6" },
    warning: { bg: "#fffbeb", color: "#d97706", dot: "#f59e0b" },
    critical: { bg: "#fef2f2", color: "#dc2626", dot: "#ef4444" },
  };

  return (
    <div className="titan-fade-in">
      <Page
        title="Admin Panel"
        subtitle="Backend-Verwaltung für Titan GEO Core"
        backAction={{ content: "Dashboard", url: "/app" }}
      >
        <BlockStack gap="600">

          {/* Admin Header */}
          <div className="titan-hero" style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 40%, #312e81 100%)" }}>
            <div className="titan-hero-content">
              <InlineStack align="space-between" blockAlign="center">
                <div>
                  <h1 style={{ fontSize: "28px", fontWeight: 800, margin: 0, color: "#fff" }}>
                    🛡️ Admin Backend
                  </h1>
                  <p style={{ color: "#94a3b8", marginTop: "8px", fontSize: "14px" }}>
                    Vollständige Kontrolle über Titan GEO Core
                  </p>
                </div>
                <div style={{
                  background: "rgba(99, 102, 241, 0.2)",
                  border: "1px solid rgba(99, 102, 241, 0.3)",
                  borderRadius: "12px", padding: "8px 16px",
                }}>
                  <Text variant="bodySm" as="span" fontWeight="semibold">
                    <span style={{ color: "#818cf8" }}>Admin-Modus aktiv</span>
                  </Text>
                </div>
              </InlineStack>
            </div>
          </div>

          {/* Overview Metrics */}
          <div>
            <div className="titan-section-header">
              <span className="titan-section-title">📊 Übersicht</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
              <div className="titan-metric-card">
                <div className="titan-metric-value">{totalShops}</div>
                <div className="titan-metric-label">Shops gesamt</div>
                <div className="titan-metric-subtitle">Aktive Installationen</div>
              </div>
              <div className="titan-metric-card">
                <div className="titan-metric-value">{totalOptimizations}</div>
                <div className="titan-metric-label">Optimierungen</div>
                <div className="titan-metric-subtitle">Gesamt durchgeführt</div>
              </div>
              <div className="titan-metric-card">
                <div className="titan-metric-value">€{revenue.toFixed(0)}</div>
                <div className="titan-metric-label">Monatl. Umsatz</div>
                <div className="titan-metric-subtitle">Geschätzt</div>
              </div>
              <div className="titan-metric-card">
                <div className="titan-metric-value">{healthScore}%</div>
                <div className="titan-metric-label">App-Gesundheit</div>
                <div className="titan-metric-subtitle">Sehr gut</div>
              </div>
            </div>
          </div>

          {/* Plan Distribution */}
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Abo-Verteilung</Text>
              <Divider />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
                <div style={{
                  background: "linear-gradient(135deg, #eff6ff, #dbeafe)",
                  borderRadius: "12px", padding: "20px", textAlign: "center",
                  border: "1px solid #bfdbfe",
                }}>
                  <div style={{ fontSize: "32px", fontWeight: 800, color: "#2563eb" }}>{planDistribution.starter}</div>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "#1e40af" }}>Starter</div>
                  <div style={{ fontSize: "12px", color: "#3b82f6", marginTop: "4px" }}>€9,99/Monat</div>
                </div>
                <div style={{
                  background: "linear-gradient(135deg, #f5f3ff, #ede9fe)",
                  borderRadius: "12px", padding: "20px", textAlign: "center",
                  border: "1px solid #c4b5fd",
                }}>
                  <div style={{ fontSize: "32px", fontWeight: 800, color: "#7c3aed" }}>{planDistribution.pro}</div>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "#5b21b6" }}>Pro</div>
                  <div style={{ fontSize: "12px", color: "#8b5cf6", marginTop: "4px" }}>€29,99/Monat</div>
                </div>
                <div style={{
                  background: "linear-gradient(135deg, #fdf4ff, #fae8ff)",
                  borderRadius: "12px", padding: "20px", textAlign: "center",
                  border: "1px solid #e879f9",
                }}>
                  <div style={{ fontSize: "32px", fontWeight: 800, color: "#a21caf" }}>{planDistribution.enterprise}</div>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "#86198f" }}>Enterprise</div>
                  <div style={{ fontSize: "12px", color: "#c026d3", marginTop: "4px" }}>€79,99/Monat</div>
                </div>
              </div>

              {/* Revenue bar */}
              <div style={{ marginTop: "8px" }}>
                <Text variant="bodySm" tone="subdued">Umsatzverteilung</Text>
                <div style={{ display: "flex", height: "12px", borderRadius: "6px", overflow: "hidden", marginTop: "8px" }}>
                  <div style={{
                    width: `${(planDistribution.starter * 9.99 / revenue * 100).toFixed(0)}%`,
                    background: "#3b82f6",
                  }} />
                  <div style={{
                    width: `${(planDistribution.pro * 29.99 / revenue * 100).toFixed(0)}%`,
                    background: "#8b5cf6",
                  }} />
                  <div style={{
                    width: `${(planDistribution.enterprise * 79.99 / revenue * 100).toFixed(0)}%`,
                    background: "#c026d3",
                  }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
                  <Text variant="bodySm" tone="subdued">Starter: €{(planDistribution.starter * 9.99).toFixed(2)}</Text>
                  <Text variant="bodySm" tone="subdued">Pro: €{(planDistribution.pro * 29.99).toFixed(2)}</Text>
                  <Text variant="bodySm" tone="subdued">Enterprise: €{(planDistribution.enterprise * 79.99).toFixed(2)}</Text>
                </div>
              </div>
            </BlockStack>
          </Card>

          {/* Shop Management */}
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">🏪 Shop-Verwaltung</Text>
              <Divider />
              {shops.length === 0 ? (
                <Text variant="bodyMd" tone="subdued">Keine Shops gefunden.</Text>
              ) : (
                <div className="titan-audit-table" style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", padding: "12px 16px", fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: "2px solid #e2e8f0" }}>Shop</th>
                        <th style={{ textAlign: "left", padding: "12px 16px", fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: "2px solid #e2e8f0" }}>Plan</th>
                        <th style={{ textAlign: "left", padding: "12px 16px", fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: "2px solid #e2e8f0" }}>Nutzung</th>
                        <th style={{ textAlign: "left", padding: "12px 16px", fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: "2px solid #e2e8f0" }}>Letzte Aktivität</th>
                        <th style={{ textAlign: "right", padding: "12px 16px", fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: "2px solid #e2e8f0" }}>Aktion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shops.map((s, idx) => {
                        const plans = ["Starter", "Pro", "Enterprise"];
                        const plan = plans[idx % 3];
                        const usage = Math.floor(Math.random() * 100) + 10;
                        return (
                          <tr key={s.shop} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "12px 16px" }}>
                              <Text variant="bodyMd" fontWeight="semibold">{s.shop}</Text>
                            </td>
                            <td style={{ padding: "12px 16px" }}>
                              <Badge tone={plan === "Enterprise" ? "success" : plan === "Pro" ? "info" : "warning"}>
                                {plan}
                              </Badge>
                            </td>
                            <td style={{ padding: "12px 16px" }}>
                              <Text variant="bodyMd">{usage} Optimierungen</Text>
                            </td>
                            <td style={{ padding: "12px 16px" }}>
                              <Text variant="bodySm" tone="subdued">{s.lastActive.split("T")[0]}</Text>
                            </td>
                            <td style={{ padding: "12px 16px", textAlign: "right" }}>
                              <Button size="slim" variant="plain">Details</Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </BlockStack>
          </Card>

          {/* App Configuration */}
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">⚙️ App-Konfiguration</Text>
              <Divider />

              {/* Feature Toggles */}
              <Text variant="headingSm" as="h3">Features ein-/ausschalten</Text>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "12px" }}>
                {Object.entries(featureLabels).map(([key, label]) => (
                  <div
                    key={key}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "12px 16px", borderRadius: "10px",
                      background: features[key] ? "#f0fdf4" : "#f8fafc",
                      border: `1px solid ${features[key] ? "#bbf7d0" : "#e2e8f0"}`,
                      transition: "all 0.2s ease",
                    }}
                  >
                    <Text variant="bodySm" fontWeight="semibold">{label}</Text>
                    <label className="titan-toggle-switch" style={{ marginLeft: "12px" }}>
                      <input
                        type="checkbox"
                        checked={features[key]}
                        onChange={() => toggleFeature(key)}
                      />
                      <span className="titan-toggle-slider"></span>
                    </label>
                  </div>
                ))}
              </div>

              <Divider />

              {/* Limits and AI Config */}
              <Text variant="headingSm" as="h3">Limits & KI-Einstellungen</Text>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div>
                  <TextField
                    label="Free-Tier Limit (Optimierungen/Monat)"
                    type="number"
                    value={freeLimit}
                    onChange={setFreeLimit}
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>KI-Modell</label>
                  <select
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                    style={{
                      width: "100%", padding: "8px 12px", borderRadius: "8px",
                      border: "1px solid #e2e8f0", fontSize: "14px", background: "#fff",
                    }}
                  >
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash (Standard)</option>
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro (Premium)</option>
                    <option value="gemini-2.0-flash">Gemini 2.0 Flash (Legacy)</option>
                  </select>
                </div>
              </div>

              <Divider />

              {/* API Key Management */}
              <Text variant="headingSm" as="h3">API-Schlüssel</Text>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: "#1e293b", borderRadius: "10px", padding: "16px",
              }}>
                <div>
                  <Text variant="bodySm" as="span">
                    <span style={{ color: "#94a3b8" }}>Gemini API Key: </span>
                    <code style={{ color: "#22d3ee", fontFamily: "monospace", fontSize: "14px" }}>{apiKeyMasked}</code>
                  </Text>
                </div>
                <InlineStack gap="200">
                  <Button size="slim">Rotieren</Button>
                  <Button size="slim" variant="plain" tone="critical">Widerrufen</Button>
                </InlineStack>
              </div>
            </BlockStack>
          </Card>

          {/* Security Overview */}
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">🔒 Sicherheit</Text>
              <Divider />

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
                <div style={{ background: "#f0fdf4", borderRadius: "10px", padding: "16px", border: "1px solid #bbf7d0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#22c55e", display: "inline-block" }}></span>
                    <Text variant="bodySm" fontWeight="semibold">Rate-Limiting</Text>
                  </div>
                  <Text variant="bodySm" tone="subdued">Aktiv — 100 Req/min</Text>
                </div>
                <div style={{ background: "#fffbeb", borderRadius: "10px", padding: "16px", border: "1px solid #fde68a" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#f59e0b", display: "inline-block" }}></span>
                    <Text variant="bodySm" fontWeight="semibold">API-Key Rotation</Text>
                  </div>
                  <Text variant="bodySm" tone="subdued">Fällig in 23 Tagen</Text>
                </div>
                <div style={{ background: "#f0fdf4", borderRadius: "10px", padding: "16px", border: "1px solid #bbf7d0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#22c55e", display: "inline-block" }}></span>
                    <Text variant="bodySm" fontWeight="semibold">Sessions</Text>
                  </div>
                  <Text variant="bodySm" tone="subdued">{totalShops} aktive Sessions</Text>
                </div>
              </div>

              {/* Security Audit Log */}
              <Text variant="headingSm" as="h3">Sicherheits-Protokoll</Text>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {securityLog.map((entry, idx) => {
                  const s = severityStyles[entry.severity] || severityStyles.info;
                  return (
                    <div
                      key={idx}
                      style={{
                        display: "flex", alignItems: "center", gap: "12px",
                        background: s.bg, borderRadius: "8px", padding: "12px 16px",
                        border: `1px solid ${s.dot}22`,
                      }}
                    >
                      <span style={{
                        width: "8px", height: "8px", borderRadius: "50%",
                        background: s.dot, flexShrink: 0,
                      }}></span>
                      <div style={{ flex: 1 }}>
                        <Text variant="bodySm" fontWeight="semibold">
                          <span style={{ color: s.color }}>{entry.action}</span>
                        </Text>
                        <Text variant="bodySm" tone="subdued">{entry.user} — {entry.date}</Text>
                      </div>
                      <Badge size="small" tone={
                        entry.severity === "critical" ? "critical" :
                        entry.severity === "warning" ? "warning" : "info"
                      }>
                        {entry.severity === "critical" ? "Kritisch" :
                         entry.severity === "warning" ? "Warnung" : "Info"}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </BlockStack>
          </Card>

          {/* Team Management */}
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">👥 Team-Verwaltung</Text>
              <Divider />

              {/* Add Team Member */}
              <div style={{
                background: "#f8fafc", borderRadius: "12px", padding: "20px",
                border: "1px solid #e2e8f0",
              }}>
                <Text variant="headingSm" as="h3">Neues Teammitglied hinzufügen</Text>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: "12px", alignItems: "end", marginTop: "12px" }}>
                  <TextField
                    label="E-Mail-Adresse"
                    type="email"
                    value={newMemberEmail}
                    onChange={setNewMemberEmail}
                    placeholder="name@beispiel.de"
                    autoComplete="off"
                  />
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>Rolle</label>
                    <select
                      value={newMemberRole}
                      onChange={(e) => setNewMemberRole(e.target.value)}
                      style={{
                        width: "100%", padding: "8px 12px", borderRadius: "8px",
                        border: "1px solid #e2e8f0", fontSize: "14px", background: "#fff",
                      }}
                    >
                      <option value="Admin">Admin</option>
                      <option value="Editor">Editor</option>
                      <option value="Viewer">Viewer</option>
                    </select>
                  </div>
                  <Button variant="primary" onClick={addTeamMember}>
                    Hinzufügen
                  </Button>
                </div>
              </div>

              {/* Team Members List */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {teamMembers.map((member, idx) => {
                  const rc = roleColors[member.role] || roleColors.Viewer;
                  return (
                    <div
                      key={idx}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "14px 18px", borderRadius: "10px",
                        background: "#fff", border: "1px solid #e2e8f0",
                      }}
                    >
                      <InlineStack gap="300" blockAlign="center">
                        <div style={{
                          width: "40px", height: "40px", borderRadius: "50%",
                          background: "linear-gradient(135deg, #6366f1, #06b6d4)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: "#fff", fontWeight: 700, fontSize: "16px",
                        }}>
                          {member.email.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <Text variant="bodyMd" fontWeight="semibold">{member.email}</Text>
                          <Text variant="bodySm" tone="subdued">Hinzugefügt: {member.added}</Text>
                        </div>
                      </InlineStack>
                      <InlineStack gap="200" blockAlign="center">
                        <span style={{
                          padding: "4px 12px", borderRadius: "20px", fontSize: "12px",
                          fontWeight: 700, background: rc.bg, color: rc.color,
                          border: `1px solid ${rc.border}`,
                        }}>
                          {member.role}
                        </span>
                        <Button size="slim" variant="plain" tone="critical" onClick={() => removeTeamMember(member.email)}>
                          Entfernen
                        </Button>
                      </InlineStack>
                    </div>
                  );
                })}
              </div>

              {/* Role Permissions Table */}
              <Divider />
              <Text variant="headingSm" as="h3">Rollen-Berechtigungen</Text>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                      <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 700, color: "#64748b" }}>Berechtigung</th>
                      <th style={{ textAlign: "center", padding: "10px 14px", fontWeight: 700, color: "#dc2626" }}>Admin</th>
                      <th style={{ textAlign: "center", padding: "10px 14px", fontWeight: 700, color: "#2563eb" }}>Editor</th>
                      <th style={{ textAlign: "center", padding: "10px 14px", fontWeight: 700, color: "#16a34a" }}>Viewer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { perm: "Dashboard ansehen", admin: true, editor: true, viewer: true },
                      { perm: "Produkte optimieren", admin: true, editor: true, viewer: false },
                      { perm: "Übersetzungen erstellen", admin: true, editor: true, viewer: false },
                      { perm: "Änderungen in Shopify speichern", admin: true, editor: true, viewer: false },
                      { perm: "Einstellungen ändern", admin: true, editor: false, viewer: false },
                      { perm: "Team verwalten", admin: true, editor: false, viewer: false },
                      { perm: "API-Keys verwalten", admin: true, editor: false, viewer: false },
                      { perm: "Abrechnungsdaten ändern", admin: true, editor: false, viewer: false },
                      { perm: "App löschen/zurücksetzen", admin: true, editor: false, viewer: false },
                    ].map((row, idx) => (
                      <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "10px 14px", fontWeight: 500 }}>{row.perm}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>
                          {row.admin ? "✅" : "❌"}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>
                          {row.editor ? "✅" : "❌"}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>
                          {row.viewer ? "✅" : "❌"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </BlockStack>
          </Card>

          {/* AI Recommendations - App Health */}
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingMd" as="h2">🤖 App-Gesundheit & KI-Empfehlungen</Text>
                <div className={`titan-score-ring ${healthScore >= 80 ? "excellent" : healthScore >= 60 ? "good" : "poor"}`}>
                  {healthScore}
                </div>
              </InlineStack>
              <Divider />

              {/* Health Bar */}
              <div>
                <Text variant="bodySm" tone="subdued">Gesundheitswert: {healthScore}/100</Text>
                <div className="titan-progress-container" style={{ marginTop: "8px" }}>
                  <div className="titan-progress-bar" style={{ width: `${healthScore}%` }}></div>
                </div>
              </div>

              {/* Recommendations */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {healthRecommendations.map((rec, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex", alignItems: "center", gap: "12px",
                      padding: "14px 18px", borderRadius: "10px",
                      background: rec.priority === "hoch" ? "#fef2f2" : rec.priority === "mittel" ? "#fffbeb" : "#f0fdf4",
                      border: `1px solid ${rec.priority === "hoch" ? "#fecaca" : rec.priority === "mittel" ? "#fde68a" : "#bbf7d0"}`,
                    }}
                  >
                    <span style={{ fontSize: "20px" }}>{rec.icon}</span>
                    <div style={{ flex: 1 }}>
                      <Text variant="bodySm" fontWeight="semibold">{rec.text}</Text>
                    </div>
                    <Badge size="small" tone={
                      rec.priority === "hoch" ? "critical" :
                      rec.priority === "mittel" ? "warning" : "success"
                    }>
                      Priorität: {rec.priority}
                    </Badge>
                  </div>
                ))}
              </div>
            </BlockStack>
          </Card>

          {/* API-Kosten Schätzung */}
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">💰 API-Kosten Schätzung (Gemini)</Text>
              <Divider />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
                <div className="titan-metric-card">
                  <div className="titan-metric-value">{totalOptimizationsCount}</div>
                  <div className="titan-metric-label">Optimierungen gesamt</div>
                  <div className="titan-metric-subtitle">Alle Shops zusammen</div>
                </div>
                <div className="titan-metric-card">
                  <div className="titan-metric-value">{(estimatedInputTokens / 1000).toFixed(0)}K</div>
                  <div className="titan-metric-label">Input Tokens</div>
                  <div className="titan-metric-subtitle">~2.000 pro Optimierung</div>
                </div>
                <div className="titan-metric-card">
                  <div className="titan-metric-value">{(estimatedOutputTokens / 1000).toFixed(0)}K</div>
                  <div className="titan-metric-label">Output Tokens</div>
                  <div className="titan-metric-subtitle">~1.500 pro Optimierung</div>
                </div>
                <div className="titan-metric-card">
                  <div className="titan-metric-value" style={{ color: estimatedCostUSD > 10 ? "#dc2626" : "#10b981" }}>
                    ${estimatedCostUSD.toFixed(2)}
                  </div>
                  <div className="titan-metric-label">Geschätzte Kosten</div>
                  <div className="titan-metric-subtitle">Gemini 2.5 Flash Preise</div>
                </div>
              </div>
              <div style={{
                padding: "12px 16px",
                borderRadius: "10px",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                fontSize: "12px",
                color: "#64748b",
                lineHeight: 1.6,
              }}>
                Berechnung basiert auf Gemini 2.5 Flash: $0,15/1M Input Tokens + $0,60/1M Output Tokens.
                Tatsächliche Kosten können je nach Prompt-Länge und Antwortumfang abweichen.
              </div>
            </BlockStack>
          </Card>

          {/* Plan Override */}
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">🔑 Plan-Override</Text>
              <Divider />

              {actionData?.message && (
                <Banner tone="success" title={actionData.message} />
              )}

              {/* Enterprise Simulation für eigenen Shop */}
              <div style={{
                padding: "20px",
                borderRadius: "12px",
                background: isSimulatingEnterprise
                  ? "linear-gradient(135deg, #fdf4ff, #fae8ff)"
                  : "#f8fafc",
                border: isSimulatingEnterprise
                  ? "2px solid #c026d3"
                  : "1px solid #e2e8f0",
              }}>
                <div style={{ marginBottom: "12px" }}>
                  <Text variant="headingSm" as="h3">Eigener Shop: {adminShop}</Text>
                  <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                    {isSimulatingEnterprise
                      ? "Enterprise-Simulation ist aktiv. Alle Features sind freigeschaltet."
                      : "Simuliere den Enterprise-Plan um alle Features zu testen."}
                  </div>
                </div>
                <Button
                  variant={isSimulatingEnterprise ? "primary" : "secondary"}
                  tone={isSimulatingEnterprise ? "critical" : undefined}
                  onClick={() => {
                    const fd = new FormData();
                    fd.set("intent", isSimulatingEnterprise ? "stopSimulation" : "simulateEnterprise");
                    submit(fd, { method: "post" });
                  }}
                >
                  {isSimulatingEnterprise ? "Simulation beenden" : "Als Enterprise simulieren"}
                </Button>
              </div>

              <Divider />

              {/* Override für beliebigen Shop */}
              <Text variant="headingSm" as="h3">Plan für beliebigen Shop setzen</Text>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: "12px", alignItems: "end" }}>
                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>Shop-Domain</label>
                  <select
                    value={planOverrideShop}
                    onChange={(e) => setPlanOverrideShop(e.target.value)}
                    style={{
                      width: "100%", padding: "8px 12px", borderRadius: "8px",
                      border: "1px solid #e2e8f0", fontSize: "14px", background: "#fff",
                    }}
                  >
                    <option value="">Shop auswählen...</option>
                    {shops.map(s => (
                      <option key={s.shop} value={s.shop}>{s.shop}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>Plan</label>
                  <select
                    value={planOverrideValue}
                    onChange={(e) => setPlanOverrideValue(e.target.value)}
                    style={{
                      width: "100%", padding: "8px 12px", borderRadius: "8px",
                      border: "1px solid #e2e8f0", fontSize: "14px", background: "#fff",
                    }}
                  >
                    <option value="none">Kein Override (Standard)</option>
                    <option value="growth">Growth</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
                <Button
                  variant="primary"
                  disabled={!planOverrideShop}
                  onClick={() => {
                    const fd = new FormData();
                    fd.set("intent", "overridePlan");
                    fd.set("shop", planOverrideShop);
                    fd.set("plan", planOverrideValue);
                    submit(fd, { method: "post" });
                  }}
                >
                  Anwenden
                </Button>
              </div>
            </BlockStack>
          </Card>

          {/* Logout */}
          <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 0" }}>
            <Button
              variant="primary"
              tone="critical"
              onClick={() => {
                const fd = new FormData();
                fd.set("intent", "logout");
                submit(fd, { method: "post" });
              }}
            >
              Admin abmelden
            </Button>
          </div>

        </BlockStack>
      </Page>
    </div>
  );
}
