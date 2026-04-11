import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import fs from "fs";
import path from "path";

// Admin-Session-Prüfung importieren
import { verifyAdminSession } from "../admin-session.server";

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
        bgColor: "#09090b",
        textColor: "#f4f4f5",
        accentColor: "#09090b",
      },
      features: {
        title: "Unsere Features",
        textColor: "#18181b",
        bgColor: "#ffffff",
      },
      cta: {
        title: "Bereit für bessere Rankings?",
        buttonLabel: "Kostenlos testen",
        bgColor: "#18181b",
        textColor: "#ffffff",
        accentColor: "#18181b",
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
        bgColor: "#09090b",
        textColor: "#f4f4f5",
        accentColor: "#09090b",
      },
      metrics: {
        title: "Deine Kennzahlen",
        textColor: "#18181b",
        bgColor: "#f4f4f5",
      },
      quickActions: {
        title: "Schnellaktionen",
        buttonLabel: "Optimierung starten",
        textColor: "#18181b",
        accentColor: "#09090b",
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
        bgColor: "#09090b",
        textColor: "#f4f4f5",
      },
      starter: {
        title: "Starter",
        price: "9,99",
        buttonLabel: "Starter wählen",
        accentColor: "#27272a",
      },
      pro: {
        title: "Pro",
        price: "29,99",
        buttonLabel: "Pro wählen",
        accentColor: "#18181b",
      },
      enterprise: {
        title: "Enterprise",
        price: "79,99",
        buttonLabel: "Enterprise wählen",
        accentColor: "#52525b",
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
        bgColor: "#09090b",
        textColor: "#f4f4f5",
        accentColor: "#3f3f46",
      },
      list: {
        title: "Deine Produkte",
        buttonLabel: "Alle optimieren",
        textColor: "#18181b",
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
        bgColor: "#09090b",
        textColor: "#f4f4f5",
        accentColor: "#09090b",
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
        bgColor: "#09090b",
        textColor: "#f4f4f5",
        accentColor: "#3f3f46",
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
        bgColor: "#09090b",
        textColor: "#f4f4f5",
        accentColor: "#52525b",
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
        bgColor: "#09090b",
        textColor: "#f4f4f5",
        accentColor: "#a1a1aa",
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
        textColor: "#18181b",
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
    background: "linear-gradient(135deg, #0a0a0f 0%, #09090b 30%, #1a1033 60%, #09090b 100%)",
    padding: "24px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    color: "#f4f4f5",
  };

  const headerStyle = {
    marginBottom: "32px",
    padding: "24px 32px",
    background: "linear-gradient(135deg, rgba(9, 9, 11, 0.15), rgba(24, 24, 27, 0.1))",
    borderRadius: "16px",
    border: "1px solid rgba(9, 9, 11, 0.2)",
  };

  const cardStyle = {
    background: "rgba(9, 9, 11, 0.8)",
    border: "1px solid rgba(9, 9, 11, 0.15)",
    borderRadius: "14px",
    padding: "20px",
    cursor: "pointer",
    transition: "all 0.2s ease",
  };

  const inputStyle = {
    width: "100%",
    padding: "10px 14px",
    borderRadius: "10px",
    border: "1px solid rgba(9, 9, 11, 0.3)",
    background: "rgba(9, 9, 11, 0.6)",
    color: "#f4f4f5",
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box",
  };

  const btnPrimary = {
    padding: "12px 24px",
    borderRadius: "10px",
    border: "none",
    background: "linear-gradient(135deg, #09090b, #18181b)",
    color: "#fff",
    fontSize: "14px",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(9, 9, 11, 0.3)",
  };

  const btnSecondary = {
    padding: "12px 24px",
    borderRadius: "10px",
    border: "1px solid rgba(161, 161, 170, 0.4)",
    background: "rgba(161, 161, 170, 0.1)",
    color: "#a1a1aa",
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
            <h1 style={{ fontSize: "24px", fontWeight: 800, margin: "0 0 6px", color: "#f4f4f5" }}>
              Seiten-Editor
            </h1>
            <p style={{ color: "#a1a1aa", margin: 0, fontSize: "14px" }}>
              Inhalte und Design aller App-Seiten anpassen
            </p>
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            <a
              href="/app/admin"
              style={{
                padding: "10px 20px",
                borderRadius: "10px",
                border: "1px solid rgba(9, 9, 11, 0.3)",
                background: "rgba(9, 9, 11, 0.1)",
                color: "#27272a",
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
                border: "1px solid rgba(9, 9, 11, 0.3)",
                background: "rgba(9, 9, 11, 0.1)",
                color: "#27272a",
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
          <h2 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", color: "#d4d4d8" }}>
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
                    borderColor: isSelected ? "rgba(9, 9, 11, 0.6)" : "rgba(9, 9, 11, 0.15)",
                    background: isSelected
                      ? "rgba(9, 9, 11, 0.15)"
                      : "rgba(9, 9, 11, 0.8)",
                    transform: isSelected ? "scale(1.02)" : "none",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "#f4f4f5" }}>
                        {config.label}
                      </div>
                      <div style={{ fontSize: "12px", color: "#71717a", marginTop: "4px" }}>
                        {config.route}
                      </div>
                    </div>
                    {hasCustom && (
                      <span style={{
                        padding: "3px 10px",
                        borderRadius: "20px",
                        fontSize: "10px",
                        fontWeight: 700,
                        background: "rgba(9, 9, 11, 0.15)",
                        color: "#4ade80",
                        border: "1px solid rgba(9, 9, 11, 0.3)",
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
              <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#d4d4d8", margin: 0 }}>
                {defaultConfigs[selectedPage]?.label} bearbeiten
              </h2>
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                {saveStatus === "saved" && (
                  <span style={{ color: "#4ade80", fontSize: "13px", fontWeight: 600 }}>
                    Gespeichert!
                  </span>
                )}
                {saveStatus === "reset" && (
                  <span style={{ color: "#3f3f46", fontSize: "13px", fontWeight: 600 }}>
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
                    background: "rgba(9, 9, 11, 0.8)",
                    border: "1px solid rgba(9, 9, 11, 0.15)",
                    borderRadius: "14px",
                    padding: "24px",
                  }}
                >
                  <h3 style={{
                    fontSize: "14px", fontWeight: 700, color: "#27272a",
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
                          color: "#a1a1aa", marginBottom: "6px",
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
                                borderRadius: "8px", border: "1px solid rgba(9, 9, 11, 0.3)",
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
            <h2 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", color: "#d4d4d8" }}>
              Live-Vorschau
            </h2>
            <div style={{
              background: "#ffffff",
              borderRadius: "14px",
              overflow: "hidden",
              border: "1px solid rgba(9, 9, 11, 0.2)",
              minHeight: "500px",
            }}>
              {Object.entries(editedSections).map(([sectionKey, fields]) => (
                <div
                  key={sectionKey}
                  style={{
                    padding: "20px",
                    background: fields.bgColor || "#ffffff",
                    borderBottom: "1px solid #e4e4e7",
                  }}
                >
                  {fields.title && (
                    <div style={{
                      fontSize: "18px",
                      fontWeight: 800,
                      color: fields.textColor || "#18181b",
                      marginBottom: "6px",
                    }}>
                      {fields.title}
                    </div>
                  )}
                  {fields.subtitle && (
                    <div style={{
                      fontSize: "12px",
                      color: fields.textColor ? `${fields.textColor}99` : "#71717a",
                      marginBottom: "8px",
                    }}>
                      {fields.subtitle}
                    </div>
                  )}
                  {fields.description && (
                    <div style={{
                      fontSize: "11px",
                      color: fields.textColor ? `${fields.textColor}88` : "#a1a1aa",
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
                      color: fields.accentColor || "#09090b",
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
                      background: fields.accentColor || "#09090b",
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
                background: "#f4f4f5",
              }}>
                <span style={{ fontSize: "10px", color: "#a1a1aa" }}>
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
          color: "#71717a",
        }}>
          <div style={{ fontSize: "48px", marginBottom: "16px", opacity: 0.5 }}>&#x1F3A8;</div>
          <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#a1a1aa", marginBottom: "8px" }}>
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
