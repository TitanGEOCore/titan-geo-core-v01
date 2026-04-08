import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import fs from "fs";
import path from "path";

import { verifyAdminSession } from "../admin-session.server";

const PAGES_CONFIG_PATH = path.resolve(process.cwd(), "app/data/pages-config.json");

// Alle verfügbaren Seiten der App
const ALL_PAGES = [
  { key: "dashboard", name: "Dashboard", route: "/app", icon: "\u{1F4CA}", category: "Kern", description: "Hauptübersicht und Kennzahlen" },
  { key: "products", name: "Produkte", route: "/app/products", icon: "\u{1F6CD}", category: "Kern", description: "Produktliste und GEO-Optimierung" },
  { key: "keywords", name: "Keyword-Recherche", route: "/app/keywords", icon: "\u{1F50D}", category: "SEO-Tools", description: "KI-gestützte Keyword-Analyse" },
  { key: "health", name: "SEO Health Check", route: "/app/health", icon: "\u{1FA7A}", category: "SEO-Tools", description: "SEO-Gesundheitsprüfung des Shops" },
  { key: "altTexts", name: "Alt-Text Optimizer", route: "/app/alt-texts", icon: "\u{1F5BC}", category: "SEO-Tools", description: "Bilder-Alt-Texte optimieren" },
  { key: "contentAudit", name: "Content Audit", route: "/app/content-audit", icon: "\u{1F4DD}", category: "SEO-Tools", description: "Inhaltsqualität analysieren" },
  { key: "metaGenerator", name: "Meta Generator", route: "/app/meta-generator", icon: "\u{1F3F7}", category: "SEO-Tools", description: "Meta-Tags mit KI erstellen" },
  { key: "internalLinks", name: "Interne Verlinkung", route: "/app/internal-links", icon: "\u{1F517}", category: "SEO-Tools", description: "Interne Links optimieren" },
  { key: "templates", name: "Brand Templates", route: "/app/templates", icon: "\u{1F3A8}", category: "Content", description: "Markenvorlagen verwalten" },
  { key: "competitor", name: "Wettbewerber-Analyse", route: "/app/competitor", icon: "\u{1F3AF}", category: "Analyse", description: "Wettbewerber überwachen" },
  { key: "rankingTracker", name: "Ranking Tracker", route: "/app/ranking-tracker", icon: "\u{1F4C8}", category: "Analyse", description: "Keyword-Rankings verfolgen" },
  { key: "multiLang", name: "Multi-Language", route: "/app/multi-lang", icon: "\u{1F30D}", category: "Content", description: "Mehrsprachige Übersetzungen" },
  { key: "roi", name: "ROI Dashboard", route: "/app/roi", icon: "\u{1F4B0}", category: "Analyse", description: "Return-on-Investment-Analyse" },
  { key: "landing", name: "Über Titan GEO", route: "/app/landing", icon: "\u{1F680}", category: "Info", description: "Landing Page und App-Info" },
  { key: "settings", name: "Einstellungen", route: "/app/settings", icon: "\u{2699}", category: "System", description: "App-Konfiguration" },
  { key: "billing", name: "Pläne & Preise", route: "/app/billing", icon: "\u{1F4B3}", category: "System", description: "Abo-Verwaltung und Preise" },
];

function loadPagesConfig() {
  try {
    if (fs.existsSync(PAGES_CONFIG_PATH)) {
      const raw = fs.readFileSync(PAGES_CONFIG_PATH, "utf-8");
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error("Fehler beim Laden der Seitenkonfiguration:", e);
  }
  // Standard: Alle sichtbar, Reihenfolge wie definiert
  const defaultConfig = {};
  ALL_PAGES.forEach((page, index) => {
    defaultConfig[page.key] = { visible: true, order: index, views: Math.floor(Math.random() * 500) + 50 };
  });
  return defaultConfig;
}

function savePagesConfig(data) {
  try {
    const dir = path.dirname(PAGES_CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(PAGES_CONFIG_PATH, JSON.stringify(data, null, 2), "utf-8");
    return true;
  } catch (e) {
    console.error("Fehler beim Speichern der Seitenkonfiguration:", e);
    return false;
  }
}

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  const cookieHeader = request.headers.get("Cookie") || "";
  if (!verifyAdminSession(cookieHeader)) {
    return redirect("/admin-login");
  }

  const pagesConfig = loadPagesConfig();

  return json({
    pages: ALL_PAGES,
    config: pagesConfig,
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

  if (intent === "toggleVisibility") {
    const pageKey = formData.get("pageKey");
    const config = loadPagesConfig();
    if (config[pageKey]) {
      config[pageKey].visible = !config[pageKey].visible;
    } else {
      config[pageKey] = { visible: false, order: 999, views: 0 };
    }
    savePagesConfig(config);
    return json({ success: true });
  }

  if (intent === "reorder") {
    const orderJson = formData.get("order");
    try {
      const newOrder = JSON.parse(orderJson);
      const config = loadPagesConfig();
      newOrder.forEach((key, index) => {
        if (config[key]) {
          config[key].order = index;
        } else {
          config[key] = { visible: true, order: index, views: 0 };
        }
      });
      savePagesConfig(config);
      return json({ success: true });
    } catch (e) {
      return json({ error: "Ungültige Reihenfolge" }, { status: 400 });
    }
  }

  return json({ error: "Unbekannte Aktion" }, { status: 400 });
};

export default function AdminPages() {
  const { pages, config } = useLoaderData();
  const submit = useSubmit();

  const [pagesConfig, setPagesConfig] = useState(config);
  const [draggedItem, setDraggedItem] = useState(null);

  // Sortierte Seiten nach order
  const sortedPages = [...pages].sort((a, b) => {
    const orderA = pagesConfig[a.key]?.order ?? 999;
    const orderB = pagesConfig[b.key]?.order ?? 999;
    return orderA - orderB;
  });

  const toggleVisibility = useCallback((pageKey) => {
    setPagesConfig(prev => {
      const updated = { ...prev };
      if (updated[pageKey]) {
        updated[pageKey] = { ...updated[pageKey], visible: !updated[pageKey].visible };
      } else {
        updated[pageKey] = { visible: false, order: 999, views: 0 };
      }
      return updated;
    });

    const formData = new FormData();
    formData.set("intent", "toggleVisibility");
    formData.set("pageKey", pageKey);
    submit(formData, { method: "post" });
  }, [submit]);

  const moveUp = useCallback((index) => {
    if (index <= 0) return;
    const newOrder = sortedPages.map(p => p.key);
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];

    const updatedConfig = { ...pagesConfig };
    newOrder.forEach((key, i) => {
      if (updatedConfig[key]) {
        updatedConfig[key] = { ...updatedConfig[key], order: i };
      }
    });
    setPagesConfig(updatedConfig);

    const formData = new FormData();
    formData.set("intent", "reorder");
    formData.set("order", JSON.stringify(newOrder));
    submit(formData, { method: "post" });
  }, [sortedPages, pagesConfig, submit]);

  const moveDown = useCallback((index) => {
    if (index >= sortedPages.length - 1) return;
    const newOrder = sortedPages.map(p => p.key);
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];

    const updatedConfig = { ...pagesConfig };
    newOrder.forEach((key, i) => {
      if (updatedConfig[key]) {
        updatedConfig[key] = { ...updatedConfig[key], order: i };
      }
    });
    setPagesConfig(updatedConfig);

    const formData = new FormData();
    formData.set("intent", "reorder");
    formData.set("order", JSON.stringify(newOrder));
    submit(formData, { method: "post" });
  }, [sortedPages, pagesConfig, submit]);

  // Kategorien gruppieren
  const categories = {};
  sortedPages.forEach(page => {
    if (!categories[page.category]) categories[page.category] = [];
    categories[page.category].push(page);
  });

  const totalViews = Object.values(pagesConfig).reduce((sum, c) => sum + (c.views || 0), 0);
  const visibleCount = Object.values(pagesConfig).filter(c => c.visible).length;
  const hiddenCount = pages.length - visibleCount;

  // Styles
  const containerStyle = {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0a0a0f 0%, #0f172a 30%, #1a1033 60%, #0f172a 100%)",
    padding: "24px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    color: "#f1f5f9",
  };

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={{
        marginBottom: "32px",
        padding: "24px 32px",
        background: "linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(139, 92, 246, 0.1))",
        borderRadius: "16px",
        border: "1px solid rgba(99, 102, 241, 0.2)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 800, margin: "0 0 6px", color: "#f1f5f9" }}>
              Seitenverwaltung
            </h1>
            <p style={{ color: "#94a3b8", margin: 0, fontSize: "14px" }}>
              Navigation, Sichtbarkeit und Reihenfolge der App-Seiten verwalten
            </p>
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            <a
              href="/app/admin"
              style={{
                padding: "10px 20px", borderRadius: "10px",
                border: "1px solid rgba(99, 102, 241, 0.3)",
                background: "rgba(99, 102, 241, 0.1)",
                color: "#818cf8", fontSize: "13px", fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Zurück zum Admin
            </a>
            <a
              href="/app/admin-editor"
              style={{
                padding: "10px 20px", borderRadius: "10px",
                border: "none",
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                color: "#fff", fontSize: "13px", fontWeight: 600,
                textDecoration: "none",
                boxShadow: "0 4px 12px rgba(99, 102, 241, 0.3)",
              }}
            >
              Seiten-Editor
            </a>
          </div>
        </div>
      </div>

      {/* Übersichts-Metriken */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "32px" }}>
        <div style={{
          background: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(99, 102, 241, 0.15)",
          borderRadius: "14px", padding: "20px", textAlign: "center",
        }}>
          <div style={{ fontSize: "28px", fontWeight: 800, color: "#818cf8" }}>{pages.length}</div>
          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>Seiten gesamt</div>
        </div>
        <div style={{
          background: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(34, 197, 94, 0.15)",
          borderRadius: "14px", padding: "20px", textAlign: "center",
        }}>
          <div style={{ fontSize: "28px", fontWeight: 800, color: "#4ade80" }}>{visibleCount}</div>
          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>Sichtbar</div>
        </div>
        <div style={{
          background: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(239, 68, 68, 0.15)",
          borderRadius: "14px", padding: "20px", textAlign: "center",
        }}>
          <div style={{ fontSize: "28px", fontWeight: 800, color: "#f87171" }}>{hiddenCount}</div>
          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>Ausgeblendet</div>
        </div>
        <div style={{
          background: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(245, 158, 11, 0.15)",
          borderRadius: "14px", padding: "20px", textAlign: "center",
        }}>
          <div style={{ fontSize: "28px", fontWeight: 800, color: "#fbbf24" }}>{totalViews.toLocaleString("de-DE")}</div>
          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>Aufrufe gesamt</div>
        </div>
      </div>

      {/* Seitenliste */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {sortedPages.map((page, index) => {
          const pageConf = pagesConfig[page.key] || { visible: true, order: index, views: 0 };
          const isVisible = pageConf.visible;
          const views = pageConf.views || 0;

          return (
            <div
              key={page.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "16px",
                padding: "18px 24px",
                background: isVisible ? "rgba(15, 23, 42, 0.8)" : "rgba(15, 23, 42, 0.4)",
                border: `1px solid ${isVisible ? "rgba(99, 102, 241, 0.15)" : "rgba(239, 68, 68, 0.15)"}`,
                borderRadius: "14px",
                opacity: isVisible ? 1 : 0.7,
                transition: "all 0.2s ease",
              }}
            >
              {/* Reihenfolge-Buttons */}
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <button
                  onClick={() => moveUp(index)}
                  disabled={index === 0}
                  style={{
                    width: "28px", height: "22px", borderRadius: "6px 6px 2px 2px",
                    border: "1px solid rgba(99, 102, 241, 0.2)",
                    background: index === 0 ? "transparent" : "rgba(99, 102, 241, 0.1)",
                    color: index === 0 ? "#334155" : "#818cf8",
                    cursor: index === 0 ? "default" : "pointer",
                    fontSize: "12px", fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  &#x25B2;
                </button>
                <button
                  onClick={() => moveDown(index)}
                  disabled={index === sortedPages.length - 1}
                  style={{
                    width: "28px", height: "22px", borderRadius: "2px 2px 6px 6px",
                    border: "1px solid rgba(99, 102, 241, 0.2)",
                    background: index === sortedPages.length - 1 ? "transparent" : "rgba(99, 102, 241, 0.1)",
                    color: index === sortedPages.length - 1 ? "#334155" : "#818cf8",
                    cursor: index === sortedPages.length - 1 ? "default" : "pointer",
                    fontSize: "12px", fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  &#x25BC;
                </button>
              </div>

              {/* Positions-Nummer */}
              <div style={{
                width: "32px", height: "32px", borderRadius: "8px",
                background: "rgba(99, 102, 241, 0.1)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "13px", fontWeight: 700, color: "#818cf8",
                flexShrink: 0,
              }}>
                {index + 1}
              </div>

              {/* Icon */}
              <div style={{
                width: "44px", height: "44px", borderRadius: "12px",
                background: "linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(139, 92, 246, 0.1))",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "22px", flexShrink: 0,
              }}>
                {page.icon}
              </div>

              {/* Info */}
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "15px", fontWeight: 700, color: "#f1f5f9" }}>
                    {page.name}
                  </span>
                  <span style={{
                    padding: "2px 8px", borderRadius: "12px", fontSize: "10px", fontWeight: 600,
                    background: "rgba(99, 102, 241, 0.1)", color: "#818cf8",
                    border: "1px solid rgba(99, 102, 241, 0.2)",
                  }}>
                    {page.category}
                  </span>
                </div>
                <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                  {page.description}
                </div>
                <div style={{ fontSize: "11px", color: "#475569", marginTop: "2px", fontFamily: "monospace" }}>
                  {page.route}
                </div>
              </div>

              {/* Aufrufe */}
              <div style={{ textAlign: "right", flexShrink: 0, minWidth: "80px" }}>
                <div style={{ fontSize: "16px", fontWeight: 700, color: "#fbbf24" }}>
                  {views.toLocaleString("de-DE")}
                </div>
                <div style={{ fontSize: "10px", color: "#64748b" }}>Aufrufe</div>
              </div>

              {/* Sichtbarkeits-Toggle */}
              <div style={{ flexShrink: 0 }}>
                <button
                  onClick={() => toggleVisibility(page.key)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "10px",
                    border: `1px solid ${isVisible ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                    background: isVisible ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)",
                    color: isVisible ? "#4ade80" : "#f87171",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer",
                    minWidth: "90px",
                    transition: "all 0.2s ease",
                  }}
                >
                  {isVisible ? "Sichtbar" : "Ausgeblendet"}
                </button>
              </div>

              {/* Bearbeiten-Link */}
              <a
                href="/app/admin-editor"
                style={{
                  padding: "8px 16px",
                  borderRadius: "10px",
                  border: "1px solid rgba(99, 102, 241, 0.3)",
                  background: "rgba(99, 102, 241, 0.1)",
                  color: "#818cf8",
                  fontSize: "12px",
                  fontWeight: 600,
                  textDecoration: "none",
                  flexShrink: 0,
                }}
              >
                Bearbeiten
              </a>
            </div>
          );
        })}
      </div>

      {/* Hinweis */}
      <div style={{
        marginTop: "32px",
        padding: "16px 24px",
        background: "rgba(99, 102, 241, 0.08)",
        borderRadius: "12px",
        border: "1px solid rgba(99, 102, 241, 0.15)",
        textAlign: "center",
      }}>
        <p style={{ color: "#818cf8", fontSize: "13px", margin: 0 }}>
          Änderungen an der Sichtbarkeit und Reihenfolge werden sofort gespeichert.
          Aufrufe werden als Platzhalter angezeigt und basieren nicht auf echten Analysedaten.
        </p>
      </div>
    </div>
  );
}
