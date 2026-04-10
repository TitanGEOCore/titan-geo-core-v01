import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit, useActionData, Form, Link } from "@remix-run/react";
import { useState, useCallback } from "react";
import prisma from "../db.server";
import { verifyAdminSession } from "../admin-session.server";

/**
 * STANDALONE ADMIN PANEL
 * This route is NOT under /app/* so it bypasses Shopify OAuth.
 * Authentication is via the titan_admin_session cookie only.
 */

export const loader = async ({ request }) => {
  const cookieHeader = request.headers.get("Cookie") || "";
  if (!verifyAdminSession(cookieHeader)) {
    return redirect("/admin-login");
  }

  let totalShops = 0;
  let shops = [];
  let totalOptimizationsCount = 0;
  let moduleStats = {
    geo_optimization: 0,
    alt_text_generation: 0,
    meta_generation: 0,
  };

  try {
    const sessions = await prisma.session.findMany({
      select: { shop: true },
    });
    const uniqueShops = [...new Set(sessions.map(s => s.shop))];
    totalShops = uniqueShops.length;

    // Get usage per shop with module breakdown
    const usageCounts = await prisma.usageTracker.groupBy({
      by: ["shop", "module"],
      _count: true,
    });
    
    // Build usage map by shop and module
    const usageMap = {};
    for (const u of usageCounts) {
      if (!usageMap[u.shop]) usageMap[u.shop] = {};
      usageMap[u.shop][u.module] = u._count;
    }

    // Get total counts by module
    const moduleTotals = await prisma.usageTracker.groupBy({
      by: ["module"],
      _count: true,
    });
    for (const m of moduleTotals) {
      if (moduleStats.hasOwnProperty(m.module)) {
        moduleStats[m.module] = m._count;
      }
    }

    // Get settings per shop
    const allSettings = await prisma.shopSettings.findMany();
    const settingsMap = Object.fromEntries(allSettings.map(s => [s.shop, s]));

    shops = uniqueShops.map(shop => ({
      shop,
      usage: usageMap[shop]?.geo_optimization || 0,
      altTextUsage: usageMap[shop]?.alt_text_generation || 0,
      metaUsage: usageMap[shop]?.meta_generation || 0,
      planOverride: settingsMap[shop]?.planOverride || null,
      brandVoice: !!settingsMap[shop]?.brandVoice,
    }));

    totalOptimizationsCount = await prisma.usageTracker.count();
  } catch (e) {
    console.error("Admin loader error:", e);
  }

  // API cost estimation (Gemini 2.5 Flash)
  const estimatedInputTokens = totalOptimizationsCount * 2000;
  const estimatedOutputTokens = totalOptimizationsCount * 1500;
  const estimatedCostUSD = ((estimatedInputTokens / 1_000_000) * 0.15) + ((estimatedOutputTokens / 1_000_000) * 0.60);

  // Get admin users
  let adminUsers = [];
  try {
    adminUsers = await prisma.adminUser.findMany({
      select: { id: true, email: true, role: true, createdAt: true, updatedAt: true },
    });
  } catch (e) {
    // Table might not exist yet
  }

  return json({
    totalShops,
    shops,
    totalOptimizationsCount,
    moduleStats,
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedCostUSD,
    adminUsers,
  });
};

export const action = async ({ request }) => {
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

  if (intent === "overridePlan") {
    const targetShop = formData.get("shop");
    const plan = formData.get("plan");
    const validPlans = ["Starter", "Growth", "Pro", "Enterprise", "Admin", "none"];
    if (!validPlans.includes(plan)) {
      return json({ error: "Ungültiger Plan" }, { status: 400 });
    }
    if (targetShop && plan) {
      await prisma.shopSettings.upsert({
        where: { shop: targetShop },
        update: { planOverride: plan === "none" ? null : plan },
        create: { shop: targetShop, planOverride: plan === "none" ? null : plan },
      });
      return json({ success: true, message: `Plan für ${targetShop} auf "${plan}" gesetzt` });
    }
  }

  if (intent === "resetUsage") {
    const targetShop = formData.get("shop");
    if (targetShop) {
      await prisma.usageTracker.deleteMany({ where: { shop: targetShop } });
      return json({ success: true, message: `Usage für ${targetShop} zurückgesetzt` });
    }
  }

  // Admin User Management
  if (intent === "createAdminUser") {
    const email = formData.get("email");
    const password = formData.get("password");
    const role = formData.get("role") || "Viewer";
    
    if (!email || !password) {
      return json({ error: "E-Mail und Passwort erforderlich" }, { status: 400 });
    }
    
    try {
      await prisma.adminUser.create({
        data: { email, password, role },
      });
      return json({ success: true, message: `Admin-Benutzer ${email} erstellt` });
    } catch (e) {
      if (e.code === "P2002") {
        return json({ error: "E-Mail existiert bereits" }, { status: 400 });
      }
      return json({ error: "Fehler beim Erstellen des Benutzers" }, { status: 500 });
    }
  }

  if (intent === "updateAdminPassword") {
    const email = formData.get("email");
    const newPassword = formData.get("newPassword");
    
    if (!email || !newPassword) {
      return json({ error: "E-Mail und neues Passwort erforderlich" }, { status: 400 });
    }
    
    try {
      await prisma.adminUser.update({
        where: { email },
        data: { password: newPassword },
      });
      return json({ success: true, message: `Passwort für ${email} geändert` });
    } catch (e) {
      return json({ error: "Benutzer nicht gefunden" }, { status: 404 });
    }
  }

  if (intent === "deleteAdminUser") {
    const email = formData.get("email");
    
    if (!email) {
      return json({ error: "E-Mail erforderlich" }, { status: 400 });
    }
    
    try {
      await prisma.adminUser.delete({
        where: { email },
      });
      return json({ success: true, message: `Benutzer ${email} gelöscht` });
    } catch (e) {
      return json({ error: "Benutzer nicht gefunden" }, { status: 404 });
    }
  }

  return json({ error: "Unbekannte Aktion" });
};

export default function TitanAdmin() {
  const { totalShops, shops, totalOptimizationsCount, moduleStats, estimatedInputTokens, estimatedOutputTokens, estimatedCostUSD, adminUsers } = useLoaderData();
  const submit = useSubmit();
  const actionData = useActionData();
  const [planShop, setPlanShop] = useState("");
  const [planValue, setPlanValue] = useState("pro");

  const cardStyle = {
    background: "#fff",
    borderRadius: "16px",
    border: "1px solid #e2e8f0",
    padding: "24px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
  };

  const metricStyle = {
    background: "linear-gradient(145deg, #ffffff, #f8fafc)",
    borderRadius: "14px",
    border: "1px solid #f1f5f9",
    padding: "20px",
    textAlign: "center",
  };

  const labelStyle = {
    fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px",
    color: "#94a3b8", fontWeight: 600, marginBottom: "6px",
  };

  const valueStyle = {
    fontSize: "32px", fontWeight: 800,
    background: "linear-gradient(135deg, #6366f1, #06b6d4)",
    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
    backgroundClip: "text",
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#f8fafc",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 40%, #312e81 100%)",
        padding: "24px 32px",
        color: "#fff",
      }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "24px" }}>{"\u{1F6E1}\uFE0F"}</span>
              <h1 style={{ fontSize: "24px", fontWeight: 800, margin: 0 }}>Titan GEO Admin</h1>
            </div>
            <p style={{ color: "#94a3b8", margin: "6px 0 0", fontSize: "14px" }}>
              Backend-Verwaltung — {totalShops} Shop{totalShops !== 1 ? "s" : ""} aktiv
            </p>
          </div>
          <Form method="post">
            <input type="hidden" name="intent" value="logout" />
            <button
              type="submit"
              style={{
                background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "#f87171", padding: "8px 20px", borderRadius: "10px",
                fontSize: "14px", fontWeight: 600, cursor: "pointer",
              }}
            >
              Abmelden
            </button>
          </Form>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "24px 32px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

          {/* Success/Error Banner */}
          {actionData?.message && (
            <div style={{
              background: "#f0fdf4", border: "1px solid #bbf7d0",
              borderRadius: "12px", padding: "14px 20px", color: "#16a34a", fontWeight: 600,
            }}>
              {"\u2713"} {actionData.message}
            </div>
          )}

          {/* Key Metrics */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
            <div style={metricStyle}>
              <div style={labelStyle}>Shops gesamt</div>
              <div style={valueStyle}>{totalShops}</div>
            </div>
            <div style={metricStyle}>
              <div style={labelStyle}>Optimierungen</div>
              <div style={valueStyle}>{totalOptimizationsCount}</div>
            </div>
            <div style={metricStyle}>
              <div style={labelStyle}>Input Tokens</div>
              <div style={valueStyle}>{(estimatedInputTokens / 1000).toFixed(0)}K</div>
            </div>
            <div style={metricStyle}>
              <div style={labelStyle}>API-Kosten (geschätzt)</div>
              <div style={{ ...valueStyle, color: estimatedCostUSD > 10 ? "#dc2626" : undefined, WebkitTextFillColor: estimatedCostUSD > 10 ? "#dc2626" : undefined }}>
                ${estimatedCostUSD.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Shop Management */}
          <div style={cardStyle}>
            <h2 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 16px", color: "#0f172a" }}>
              {"\u{1F3EA}"} Shop-Verwaltung
            </h2>
            {shops.length === 0 ? (
              <p style={{ color: "#64748b" }}>Keine Shops gefunden.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                      <th style={{ textAlign: "left", padding: "10px 14px", fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Shop</th>
                      <th style={{ textAlign: "center", padding: "10px 14px", fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Optimierungen</th>
                      <th style={{ textAlign: "center", padding: "10px 14px", fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Plan Override</th>
                      <th style={{ textAlign: "center", padding: "10px 14px", fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Brand DNA</th>
                      <th style={{ textAlign: "right", padding: "10px 14px", fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Aktionen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shops.map((s) => (
                      <tr key={s.shop} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "12px 14px", fontWeight: 600, color: "#0f172a" }}>{s.shop}</td>
                        <td style={{ padding: "12px 14px", textAlign: "center", color: "#475569" }}>{s.usage}</td>
                        <td style={{ padding: "12px 14px", textAlign: "center" }}>
                          <span style={{
                            padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600,
                            background: s.planOverride ? "#ede9fe" : "#f1f5f9",
                            color: s.planOverride ? "#7c3aed" : "#94a3b8",
                          }}>
                            {s.planOverride || "Standard"}
                          </span>
                        </td>
                        <td style={{ padding: "12px 14px", textAlign: "center" }}>
                          {s.brandVoice ? "\u2705" : "\u274C"}
                        </td>
                        <td style={{ padding: "12px 14px", textAlign: "right" }}>
                          <Form method="post" style={{ display: "inline" }}>
                            <input type="hidden" name="intent" value="resetUsage" />
                            <input type="hidden" name="shop" value={s.shop} />
                            <button type="submit" style={{
                              background: "none", border: "1px solid #e2e8f0", borderRadius: "6px",
                              padding: "4px 10px", fontSize: "12px", color: "#64748b", cursor: "pointer",
                            }}>
                              Usage Reset
                            </button>
                          </Form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Plan Override */}
          <div style={cardStyle}>
            <h2 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 16px", color: "#0f172a" }}>
              {"\u{1F511}"} Plan-Override
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: "12px", alignItems: "end" }}>
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px", color: "#475569" }}>Shop</label>
                <select
                  value={planShop}
                  onChange={(e) => setPlanShop(e.target.value)}
                  style={{
                    width: "100%", padding: "10px 14px", borderRadius: "10px",
                    border: "1px solid #e2e8f0", fontSize: "14px", background: "#fff",
                  }}
                >
                  <option value="">Shop auswählen...</option>
                  {shops.map(s => <option key={s.shop} value={s.shop}>{s.shop}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px", color: "#475569" }}>Plan</label>
                <select
                  value={planValue}
                  onChange={(e) => setPlanValue(e.target.value)}
                  style={{
                    width: "100%", padding: "10px 14px", borderRadius: "10px",
                    border: "1px solid #e2e8f0", fontSize: "14px", background: "#fff",
                  }}
                >
                  <option value="none">Kein Override</option>
                  <option value="Admin">Admin (Vollzugriff)</option>
                  <option value="growth">Growth</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <button
                disabled={!planShop}
                onClick={() => {
                  const fd = new FormData();
                  fd.set("intent", "overridePlan");
                  fd.set("shop", planShop);
                  fd.set("plan", planValue);
                  submit(fd, { method: "post" });
                }}
                style={{
                  padding: "10px 24px", borderRadius: "10px", border: "none",
                  background: planShop ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "#e2e8f0",
                  color: planShop ? "#fff" : "#94a3b8",
                  fontSize: "14px", fontWeight: 700, cursor: planShop ? "pointer" : "default",
                  marginBottom: "1px",
                }}
              >
                Anwenden
              </button>
            </div>
          </div>

          {/* API Cost Info */}
          <div style={cardStyle}>
            <h2 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 16px", color: "#0f172a" }}>
              {"\u{1F4B0}"} API-Kosten (Gemini 2.5 Flash)
            </h2>
            <div style={{
              padding: "14px 18px", borderRadius: "10px",
              background: "#f8fafc", border: "1px solid #e2e8f0",
              fontSize: "13px", color: "#64748b", lineHeight: 1.7,
            }}>
              <strong>Berechnung:</strong> {totalOptimizationsCount} Optimierungen × ~2.000 Input + ~1.500 Output Tokens<br />
              <strong>Input:</strong> {estimatedInputTokens.toLocaleString()} Tokens × $0,15/1M = ${((estimatedInputTokens / 1_000_000) * 0.15).toFixed(4)}<br />
              <strong>Output:</strong> {estimatedOutputTokens.toLocaleString()} Tokens × $0,60/1M = ${((estimatedOutputTokens / 1_000_000) * 0.60).toFixed(4)}<br />
              <strong style={{ color: "#0f172a" }}>Gesamt: ${estimatedCostUSD.toFixed(4)}</strong>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
