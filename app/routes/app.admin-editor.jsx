import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import fs from "fs";
import path from "path";

// Admin-Session-Prüfung importieren
import { verifyAdminSession } from "./admin-login";

const CUSTOMIZATIONS_PATH = path.resolve(process.cwd(), "app/data/customizations.json");

// Standard-Seitenkonfigurationen
const DEFAULT_PAGE_CONFIGS = {
  landing: {
    label: "Landing Page",
    route: "/app/landing",
    sections: {
      hero: {
        title: "Titan GEO Core",
        subtitle: "KI-gestützte GEO-Optimierung für Shopify",
        buttonLabel: "Jetzt starten",
        bgColor: "#0f172a",
        textColor: "#f1f5f9",
        accentColor: "#6366f1",
      },
      features: {
        title: "Unsere Features",
        textColor: "#1e293b",
        bgColor: "#ffffff",
      },
      cta: {
        title: "Bereit für bessere Rankings?",
        buttonLabel: "Kostenlos testen",
        bgColor: "#1e1b4b",
        textColor: "#ffffff",
        accentColor: "#8b5cf6",
      },
    },
  },
  dashboard: {
    label: "Dashboard",
    route: "/app",
    sections: {
      header: {
        title: "Willkommen bei Titan GEO",
        subtitle: "Dein SEO-Cockpit",
        bgColor: "#0f172a",
        textColor: "#f1f5f9",
        accentColor: "#6366f1",
      },
      metrics: {
        title: "Deine Kennzahlen",
        textColor: "#1e293b",
        bgColor: "#f8fafc",
      },
      quickActions: {
        title: "Schnellaktionen",
        buttonLabel: "Optimierung starten",
        textColor: "#1e293b",
        accentColor: "#6366f1",
      },
    },
  },
  billing: {
    label: "Pläne & Preise",
    route: "/app/billing",
    sections: {
      header: {
        title: "Wähle deinen Plan",
        subtitle: "Skaliere deine SEO-Performance",
        bgColor: "#0f172a",
        textColor: "#f1f5f9",
      },
      starter: {
        title: "Starter",
        price: "9,99",
        buttonLabel: "Starter wählen",
        accentColor: "#3b82f6",
      },
      pro: {
        title: "Pro",
        price: "29,99",
        buttonLabel: "Pro wählen",
        accentColor: "#8b5cf6",
      },
      enterprise: {
        title: "Enterprise",
        price: "79,99",
        buttonLabel: "Enterprise wählen",
        accentColor: "#c026d3",
      },
    },
  },
  products: {
    label: "Produkte",
    route: "/app/products",
    sections: {
      header: {
        title: "Produkt-Optimierung",
        subtitle: "Optimiere deine Produkte für Suchmaschinen",
        bgColor: "#0f172a",
        textColor: "#f1f5f9",
        accentColor: "#06b6d4",
      },
      list: {
        title: "Deine Produkte",
        buttonLabel: "Alle optimieren",
        textColor: "#1e293b",
      },
    },
  },
  keywords: {
    label: "Keyword-Recherche",
    route: "/app/keywords",
    sections: {
      header: {
        title: "Keyword-Recherche",
        subtitle: "Finde die besten Keywords für deine Produkte",
        bgColor: "#0f172a",
        textColor: "#f1f5f9",
        accentColor: "#10b981",
      },
    },
  },
  health: {
    label: "SEO Health Check",
    route: "/app/health",
    sections: {
      header: {
        title: "SEO Health Check",
        subtitle: "Prüfe den SEO-Zustand deines Shops",
        bgColor: "#0f172a",
        textColor: "#f1f5f9",
        accentColor: "#f59e0b",
      },
    },
  },
  contentAudit: {
    label: "Content Audit",
    route: "/app/content-audit",
    sections: {
      header: {
        title: "Content Audit",
        subtitle: "Analysiere und verbessere deine Inhalte",
        bgColor: "#0f172a",
        textColor: "#f1f5f9",
        accentColor: "#ec4899",
      },
    },
  },
  metaGenerator: {
    label: "Meta Generator",
    route: "/app/meta-generator",
    sections: {
      header: {
        title: "Meta Generator",
        subtitle: "Erstelle optimierte Meta-Tags mit KI",
        bgColor: "#0f172a",
        textColor: "#f1f5f9",
        accentColor: "#14b8a6",
      },
    },
  },
  settings: {
    label: "Einstellungen",
    route: "/app/settings",
    sections: {
      header: {
        title: "Einstellungen",
        subtitle: "Konfiguriere Titan GEO Core",
        textColor: "#1e293b",
        bgColor: "#ffffff",
      },
    },
  },
};

function loadCustomizations() {
  try {
    if (fs.existsSync(CUSTOMIZATIONS_PATH)) {
      const raw = fs.readFileSync(CUSTOMIZATIONS_PATH, "utf-8");
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error("Fehler beim Laden der Anpassungen:", e);
  }
  return {};
}

function saveCustomizations(data) {
  try {
    const dir = path.dirname(CUSTOMIZATIONS_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CUSTOMIZATIONS_PATH, JSON.stringify(data, null, 2), "utf-8");
    return true;
  } catch (e) {
    console.error("Fehler beim Speichern der Anpassungen:", e);
    return false;
  }
}

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  const cookieHeader = request.headers.get("Cookie") || "";
  if (!verifyAdminSession(cookieHeader)) {
    return redirect("/admin-login");
  }

  const customizations = loadCustomizations();

  return json({
    defaultConfigs: DEFAULT_PAGE_CONFIGS,
    customizations,
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

  if (intent === "save") {
    const pageKey = formData.get("pageKey");
    const sectionsJson = formData.get("sections");

    if (!pageKey || !sectionsJson) {
      return json({ error: "Fehlende Daten" }, { status: 400 });
    }

    try {
      const sections = JSON.parse(sectionsJson);
      const customizations = loadCustomizations();
      customizations[pageKey] = {
        sections,
        updatedAt: new Date().toISOString(),
      };
      const success = saveCustomizations(customizations);

      if (success) {
        return json({ success: true, message: "Änderungen gespeichert" });
      }
      return json({ error: "Speichern fehlgeschlagen" }, { status: 500 });
    } catch (e) {
      return json({ error: "Ungültige Daten" }, { status: 400 });
    }
  }

  if (intent === "reset") {
    const pageKey = formData.get("pageKey");
    const customizations = loadCustomizations();
    delete customizations[pageKey];
    saveCustomizations(customizations);
    return json({ success: true, message: "Auf Standard zurückgesetzt" });
  }

  if (intent === "resetAll") {
    saveCustomizations({});
    return json({ success: true, message: "Alle Anpassungen zurückgesetzt" });
  }

  return json({ error: "Unbekannte Aktion" }, { status: 400 });
};

export default function AdminEditor() {
  const { defaultConfigs, customizations } = useLoaderData();
  const submit = useSubmit();

  const [selectedPage, setSelectedPage] = useState(null);
  const [editedSections, setEditedSections] = useState({});
  const [saveStatus, setSaveStatus] = useState(null);

  const selectPage = useCallback((pageKey) => {
    const custom = customizations[pageKey];
    const defaults = defaultConfigs[pageKey]?.sections || {};
    const merged = {};
    for (const [sectionKey, sectionDefaults] of Object.entries(defaults)) {
      merged[sectionKey] = {
        ...sectionDefaults,
        ...(custom?.sections?.[sectionKey] || {}),
      };
    }
    setEditedSections(merged);
    setSelectedPage(pageKey);
    setSaveStatus(null);
  }, [customizations, defaultConfigs]);

  const updateField = useCallback((sectionKey, fieldKey, value) => {
    setEditedSections(prev => ({
      ...prev,
      [sectionKey]: {
        ...prev[sectionKey],
        [fieldKey]: value,
      },
    }));
    setSaveStatus(null);
  }, []);

  const handleSave = useCallback(() => {
    if (!selectedPage) return;
    const formData = new FormData();
    formData.set("intent", "save");
    formData.set("pageKey", selectedPage);
    formData.set("sections", JSON.stringify(editedSections));
    submit(formData, { method: "post" });
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus(null), 3000);
  }, [selectedPage, editedSections, submit]);

  const handleReset = useCallback(() => {
    if (!selectedPage) return;
    const formData = new FormData();
    formData.set("intent", "reset");
    formData.set("pageKey", selectedPage);
    submit(formData, { method: "post" });
    const defaults = defaultConfigs[selectedPage]?.sections || {};
    setEditedSections({ ...defaults });
    setSaveStatus("reset");
    setTimeout(() => setSaveStatus(null), 3000);
  }, [selectedPage, defaultConfigs, submit]);

  const isColorField = (key) => key.toLowerCase().includes("color");
  const isSpacingField = (key) => key.toLowerCase().includes("spacing") || key.toLowerCase().includes("padding") || key.toLowerCase().includes("margin") || key.toLowerCase().includes("gap");

  const fieldLabel = (key) => {
    const labels = {
      title: "Titel",
      subtitle: "Untertitel",
      buttonLabel: "Button-Text",
      bgColor: "Hintergrundfarbe",
      textColor: "Textfarbe",
      accentColor: "Akzentfarbe",
      price: "Preis",
      description: "Beschreibung",
    };
    return labels[key] || key;
  };

  // Styles
  const containerStyle = {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0a0a0f 0%, #0f172a 30%, #1a1033 60%, #0f172a 100%)",
    padding: "24px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    color: "#f1f5f9",
  };

  const headerStyle = {
    marginBottom: "32px",
    padding: "24px 32px",
    background: "linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(139, 92, 246, 0.1))",
    borderRadius: "16px",
    border: "1px solid rgba(99, 102, 241, 0.2)",
  };

  const cardStyle = {
    background: "rgba(15, 23, 42, 0.8)",
    border: "1px solid rgba(99, 102, 241, 0.15)",
    borderRadius: "14px",
    padding: "20px",
    cursor: "pointer",
    transition: "all 0.2s ease",
  };

  const inputStyle = {
    width: "100%",
    padding: "10px 14px",
    borderRadius: "10px",
    border: "1px solid rgba(99, 102, 241, 0.3)",
    background: "rgba(15, 23, 42, 0.6)",
    color: "#f1f5f9",
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box",
  };

  const btnPrimary = {
    padding: "12px 24px",
    borderRadius: "10px",
    border: "none",
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    color: "#fff",
    fontSize: "14px",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(99, 102, 241, 0.3)",
  };

  const btnSecondary = {
    padding: "12px 24px",
    borderRadius: "10px",
    border: "1px solid rgba(239, 68, 68, 0.4)",
    background: "rgba(239, 68, 68, 0.1)",
    color: "#f87171",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
  };

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 800, margin: "0 0 6px", color: "#f1f5f9" }}>
              Seiten-Editor
            </h1>
            <p style={{ color: "#94a3b8", margin: 0, fontSize: "14px" }}>
              Inhalte und Design aller App-Seiten anpassen
            </p>
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            <a
              href="/app/admin"
              style={{
                padding: "10px 20px",
                borderRadius: "10px",
                border: "1px solid rgba(99, 102, 241, 0.3)",
                background: "rgba(99, 102, 241, 0.1)",
                color: "#818cf8",
                fontSize: "13px",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Zurück zum Admin
            </a>
            <a
              href="/app/admin-pages"
              style={{
                padding: "10px 20px",
                borderRadius: "10px",
                border: "1px solid rgba(99, 102, 241, 0.3)",
                background: "rgba(99, 102, 241, 0.1)",
                color: "#818cf8",
                fontSize: "13px",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Seitenverwaltung
            </a>
          </div>
        </div>
      </div>

      {/* Seitenauswahl + Editor Layout */}
      <div style={{ display: "grid", gridTemplateColumns: selectedPage ? "300px 1fr 320px" : "1fr", gap: "24px" }}>

        {/* Seitenauswahl */}
        <div>
          <h2 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", color: "#cbd5e1" }}>
            Seiten auswählen
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {Object.entries(defaultConfigs).map(([key, config]) => {
              const isSelected = selectedPage === key;
              const hasCustom = !!customizations[key];
              return (
                <div
                  key={key}
                  onClick={() => selectPage(key)}
                  style={{
                    ...cardStyle,
                    borderColor: isSelected ? "rgba(99, 102, 241, 0.6)" : "rgba(99, 102, 241, 0.15)",
                    background: isSelected
                      ? "rgba(99, 102, 241, 0.15)"
                      : "rgba(15, 23, 42, 0.8)",
                    transform: isSelected ? "scale(1.02)" : "none",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "#f1f5f9" }}>
                        {config.label}
                      </div>
                      <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                        {config.route}
                      </div>
                    </div>
                    {hasCustom && (
                      <span style={{
                        padding: "3px 10px",
                        borderRadius: "20px",
                        fontSize: "10px",
                        fontWeight: 700,
                        background: "rgba(34, 197, 94, 0.15)",
                        color: "#4ade80",
                        border: "1px solid rgba(34, 197, 94, 0.3)",
                      }}>
                        Angepasst
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Editor */}
        {selectedPage && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#cbd5e1", margin: 0 }}>
                {defaultConfigs[selectedPage]?.label} bearbeiten
              </h2>
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                {saveStatus === "saved" && (
                  <span style={{ color: "#4ade80", fontSize: "13px", fontWeight: 600 }}>
                    Gespeichert!
                  </span>
                )}
                {saveStatus === "reset" && (
                  <span style={{ color: "#f59e0b", fontSize: "13px", fontWeight: 600 }}>
                    Zurückgesetzt!
                  </span>
                )}
                <button onClick={handleReset} style={btnSecondary}>
                  Zurücksetzen
                </button>
                <button onClick={handleSave} style={btnPrimary}>
                  Speichern
                </button>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {Object.entries(editedSections).map(([sectionKey, fields]) => (
                <div
                  key={sectionKey}
                  style={{
                    background: "rgba(15, 23, 42, 0.8)",
                    border: "1px solid rgba(99, 102, 241, 0.15)",
                    borderRadius: "14px",
                    padding: "24px",
                  }}
                >
                  <h3 style={{
                    fontSize: "14px", fontWeight: 700, color: "#818cf8",
                    marginBottom: "16px", textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}>
                    Abschnitt: {sectionKey}
                  </h3>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                    {Object.entries(fields).map(([fieldKey, fieldValue]) => (
                      <div key={fieldKey} style={{
                        gridColumn: isColorField(fieldKey) ? "auto" : (!isSpacingField(fieldKey) && String(fieldValue).length > 30) ? "1 / -1" : "auto",
                      }}>
                        <label style={{
                          display: "block", fontSize: "12px", fontWeight: 600,
                          color: "#94a3b8", marginBottom: "6px",
                          textTransform: "uppercase", letterSpacing: "0.3px",
                        }}>
                          {fieldLabel(fieldKey)}
                        </label>
                        {isColorField(fieldKey) ? (
                          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                            <input
                              type="color"
                              value={fieldValue || "#000000"}
                              onChange={(e) => updateField(sectionKey, fieldKey, e.target.value)}
                              style={{
                                width: "44px", height: "38px",
                                borderRadius: "8px", border: "1px solid rgba(99, 102, 241, 0.3)",
                                background: "transparent", cursor: "pointer", padding: "2px",
                              }}
                            />
                            <input
                              type="text"
                              value={fieldValue || ""}
                              onChange={(e) => updateField(sectionKey, fieldKey, e.target.value)}
                              style={{ ...inputStyle, flex: 1 }}
                            />
                          </div>
                        ) : isSpacingField(fieldKey) ? (
                          <input
                            type="number"
                            value={fieldValue || 0}
                            onChange={(e) => updateField(sectionKey, fieldKey, e.target.value)}
                            style={inputStyle}
                            min="0"
                            max="200"
                          />
                        ) : (
                          <input
                            type="text"
                            value={fieldValue || ""}
                            onChange={(e) => updateField(sectionKey, fieldKey, e.target.value)}
                            style={inputStyle}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Live-Vorschau */}
        {selectedPage && (
          <div>
            <h2 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", color: "#cbd5e1" }}>
              Live-Vorschau
            </h2>
            <div style={{
              background: "#ffffff",
              borderRadius: "14px",
              overflow: "hidden",
              border: "1px solid rgba(99, 102, 241, 0.2)",
              minHeight: "500px",
            }}>
              {Object.entries(editedSections).map(([sectionKey, fields]) => (
                <div
                  key={sectionKey}
                  style={{
                    padding: "20px",
                    background: fields.bgColor || "#ffffff",
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  {fields.title && (
                    <div style={{
                      fontSize: "18px",
                      fontWeight: 800,
                      color: fields.textColor || "#1e293b",
                      marginBottom: "6px",
                    }}>
                      {fields.title}
                    </div>
                  )}
                  {fields.subtitle && (
                    <div style={{
                      fontSize: "12px",
                      color: fields.textColor ? `${fields.textColor}99` : "#64748b",
                      marginBottom: "8px",
                    }}>
                      {fields.subtitle}
                    </div>
                  )}
                  {fields.description && (
                    <div style={{
                      fontSize: "11px",
                      color: fields.textColor ? `${fields.textColor}88` : "#94a3b8",
                      marginBottom: "8px",
                      lineHeight: "1.5",
                    }}>
                      {fields.description}
                    </div>
                  )}
                  {fields.price && (
                    <div style={{
                      fontSize: "22px",
                      fontWeight: 800,
                      color: fields.accentColor || "#6366f1",
                      marginBottom: "8px",
                    }}>
                      {"\u20AC"}{fields.price}
                    </div>
                  )}
                  {fields.buttonLabel && (
                    <div style={{
                      display: "inline-block",
                      padding: "6px 16px",
                      borderRadius: "6px",
                      background: fields.accentColor || "#6366f1",
                      color: "#ffffff",
                      fontSize: "11px",
                      fontWeight: 700,
                    }}>
                      {fields.buttonLabel}
                    </div>
                  )}
                </div>
              ))}

              {/* Wasserzeichen */}
              <div style={{
                padding: "12px 20px",
                textAlign: "center",
                background: "#f8fafc",
              }}>
                <span style={{ fontSize: "10px", color: "#94a3b8" }}>
                  Vorschau — {defaultConfigs[selectedPage]?.label}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Keine Seite ausgewählt */}
      {!selectedPage && (
        <div style={{
          textAlign: "center",
          padding: "80px 20px",
          color: "#64748b",
        }}>
          <div style={{ fontSize: "48px", marginBottom: "16px", opacity: 0.5 }}>&#x1F3A8;</div>
          <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#94a3b8", marginBottom: "8px" }}>
            Seite auswählen
          </h2>
          <p style={{ fontSize: "14px" }}>
            Wähle eine Seite aus der Liste, um deren Inhalte und Design zu bearbeiten.
          </p>
        </div>
      )}
    </div>
  );
}
