import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page, Card, Text, BlockStack, InlineStack, Button, Banner, Box, Badge, Divider, TextField, Spinner,
} from "@shopify/polaris";
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { authenticate } from "../shopify.server";
import LoadingOverlay from "../components/LoadingOverlay";

// Mapping von Sprachcode zu ISO-3166-1-Ländercode für Flaggenbilder
const LANG_TO_COUNTRY = {
  de: "de", en: "gb", fr: "fr", es: "es", it: "it", pt: "pt",
  nl: "nl", pl: "pl", cs: "cz", sv: "se", da: "dk", no: "no",
  fi: "fi", ja: "jp", ko: "kr", zh: "cn",
};

// Flaggen-Hilfsfunktion: Verwendet Bild-basierte Flaggen, die auf allen Plattformen funktionieren
// (Windows zeigt Emoji-Flaggen nur als Länderkürzel an)
function FlagIcon({ code, size = 24 }) {
  const country = LANG_TO_COUNTRY[code] || code;
  return (
    <img
      src={`https://flagcdn.com/w40/${country}.png`}
      srcSet={`https://flagcdn.com/w80/${country}.png 2x`}
      width={size}
      height={Math.round(size * 0.75)}
      alt={code.toUpperCase()}
      style={{ borderRadius: "2px", objectFit: "cover", display: "inline-block", verticalAlign: "middle" }}
      loading="lazy"
    />
  );
}

const LANGUAGES = [
  { code: "de", label: "Deutsch", flag: "🇩🇪", region: "Europa" },
  { code: "en", label: "English", flag: "🇬🇧", region: "Europa" },
  { code: "fr", label: "Français", flag: "🇫🇷", region: "Europa" },
  { code: "es", label: "Español", flag: "🇪🇸", region: "Europa" },
  { code: "it", label: "Italiano", flag: "🇮🇹", region: "Europa" },
  { code: "pt", label: "Português", flag: "🇵🇹", region: "Europa" },
  { code: "nl", label: "Nederlands", flag: "🇳🇱", region: "Europa" },
  { code: "pl", label: "Polski", flag: "🇵🇱", region: "Europa" },
  { code: "cs", label: "Čeština", flag: "🇨🇿", region: "Europa" },
  { code: "sv", label: "Svenska", flag: "🇸🇪", region: "Europa" },
  { code: "da", label: "Dansk", flag: "🇩🇰", region: "Europa" },
  { code: "no", label: "Norsk", flag: "🇳🇴", region: "Europa" },
  { code: "fi", label: "Suomi", flag: "🇫🇮", region: "Europa" },
  { code: "ja", label: "日本語", flag: "🇯🇵", region: "Asien" },
  { code: "ko", label: "한국어", flag: "🇰🇷", region: "Asien" },
  { code: "zh", label: "中文", flag: "🇨🇳", region: "Asien" },
];

export const loader = async ({ request }) => {
  try {
  const { admin, session } = await authenticate.admin(request);

  const response = await admin.graphql(`
    query {
      products(first: 50) {
        nodes {
          id
          title
          description
          descriptionHtml
          handle
          featuredImage {
            url
            altText
          }
        }
      }
    }
  `);
  const data = await response.json();
  const products = (data.data?.products?.nodes || []).map(p => ({
    id: p.id,
    title: p.title,
    description: p.description || "",
    descriptionHtml: p.descriptionHtml || "",
    handle: p.handle,
    image: p.featuredImage?.url || null,
    imageAlt: p.featuredImage?.altText || p.title,
  }));

  return json({ products, shop: session.shop });
  } catch (error) {
    console.error("Multi-lang loader error:", error);
    if (error instanceof Response) throw error;
    return json({ products: [], shop: "", error: error.message });
  }
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "translate") {
    const productTitle = formData.get("productTitle");
    const productDescription = formData.get("productDescription");
    const targetLang = formData.get("targetLang");
    const targetLangLabel = formData.get("targetLangLabel");
    const productId = formData.get("productId");

    // Limit-Check
    const { checkLimit, trackUsage, limitErrorResponse } = await import("../middleware/enforce-limits.server.js");
    const limitResult = await checkLimit(session.shop, "multilang");
    if (!limitResult.allowed) {
      return json(limitErrorResponse(limitResult));
    }

    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const prompt = `Du bist ein professioneller Übersetzer und GEO-Optimierungsexperte (Generative Engine Optimization).

Übersetze und optimiere folgendes Produkt für den ${targetLangLabel}-sprachigen Markt.

Originalprodukt (Deutsch):
Titel: ${productTitle}
Beschreibung: ${productDescription || "Nicht verfügbar"}

Zielsprache: ${targetLangLabel} (${targetLang})

Anforderungen:
- Übersetze Titel und Beschreibung in die Zielsprache
- Optimiere den Inhalt für GEO (AI-Suchmaschinen wie ChatGPT, Perplexity, Gemini)
- Passe kulturelle Referenzen und Maßeinheiten an
- Verwende lokale SEO-Keywords in der Zielsprache
- Die Beschreibung soll als HTML formatiert sein (mit <p>, <ul>, <li>, <strong> etc.)
- Halte den Marken-Ton bei, aber passe ihn an die Zielkultur an

Generiere exakt dieses JSON-Format (keine Markdown, nur JSON):
{
  "translatedTitle": "Übersetzter Titel",
  "translatedDescription": "<p>Übersetzte und optimierte Beschreibung als HTML</p>",
  "seoTitle": "SEO-optimierter Meta-Titel (max 60 Zeichen)",
  "seoDescription": "SEO-optimierte Meta-Beschreibung (max 160 Zeichen)",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "culturalNotes": "Hinweise zu kulturellen Anpassungen"
}`;

    try {
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: { temperature: 0.3, responseMimeType: "application/json" },
      });
      const translateResult = JSON.parse(result.text);
      trackUsage(session.shop, "multilang");
      return json({
        success: true,
        translation: translateResult,
        productTitle,
        productId,
        targetLang,
        targetLangLabel,
      });
    } catch (e) {
      console.error("Translation error:", e);
      return json({ success: false, error: "Übersetzung fehlgeschlagen. Bitte erneut versuchen." });
    }
  }

  if (intent === "translate_all") {
    const productsRaw = formData.get("products");
    const targetLang = formData.get("targetLang");
    const targetLangLabel = formData.get("targetLangLabel");

    let products;
    try {
      products = JSON.parse(productsRaw);
    } catch {
      return json({ success: false, error: "Ungültige Produktdaten." });
    }

    // Limit-Check
    const { checkLimit: checkBulkLimit, trackUsage: trackBulkUsage, limitErrorResponse: bulkLimitError } = await import("../middleware/enforce-limits.server.js");
    const bulkLimitResult = await checkBulkLimit(session.shop, "multilang");
    if (!bulkLimitResult.allowed) {
      return json(bulkLimitError(bulkLimitResult));
    }

    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const results = [];

    for (const product of products) {
      const prompt = `Du bist ein professioneller Übersetzer und GEO-Optimierungsexperte.

Übersetze und optimiere folgendes Produkt für den ${targetLangLabel}-sprachigen Markt.

Originalprodukt:
Titel: ${product.title}
Beschreibung: ${product.description || "Nicht verfügbar"}

Zielsprache: ${targetLangLabel} (${targetLang})

Generiere exakt dieses JSON-Format (keine Markdown, nur JSON):
{
  "translatedTitle": "Übersetzter Titel",
  "translatedDescription": "<p>Übersetzte HTML-Beschreibung</p>",
  "seoTitle": "SEO Meta-Titel (max 60 Zeichen)",
  "seoDescription": "SEO Meta-Beschreibung (max 160 Zeichen)",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "culturalNotes": "Kulturelle Hinweise"
}`;

      try {
        const result = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: { temperature: 0.3, responseMimeType: "application/json" },
        });
        const parsed = JSON.parse(result.text);
        trackBulkUsage(session.shop, "multilang");
        results.push({ productId: product.id, productTitle: product.title, success: true, translation: parsed });
      } catch (e) {
        console.error("Bulk translate error for", product.id, e);
        results.push({ productId: product.id, productTitle: product.title, success: false });
      }
    }
    return json({ success: true, bulkResults: results, targetLang, targetLangLabel });
  }

  if (intent === "save") {
    const productId = formData.get("productId");
    const translatedTitle = formData.get("translatedTitle");
    const translatedDescription = formData.get("translatedDescription");
    const seoTitle = formData.get("seoTitle");
    const seoDescription = formData.get("seoDescription");

    try {
      await admin.graphql(`
        mutation productUpdate($input: ProductInput!) {
          productUpdate(input: $input) {
            product { id title }
            userErrors { field message }
          }
        }
      `, {
        variables: {
          input: {
            id: productId,
            title: translatedTitle,
            descriptionHtml: translatedDescription,
            seo: {
              title: seoTitle,
              description: seoDescription,
            },
          },
        },
      });
      return json({ success: true, saved: true, productId });
    } catch (e) {
      console.error("Save translation error:", e);
      return json({ success: false, error: "Speichern fehlgeschlagen." });
    }
  }

  if (intent === "save_all") {
    const translationsRaw = formData.get("translations");
    let translations;
    try {
      translations = JSON.parse(translationsRaw);
    } catch {
      return json({ success: false, error: "Ungültige Übersetzungsdaten." });
    }

    const savedIds = [];
    const failedIds = [];

    for (const t of translations) {
      try {
        await admin.graphql(`
          mutation productUpdate($input: ProductInput!) {
            productUpdate(input: $input) {
              product { id }
              userErrors { field message }
            }
          }
        `, {
          variables: {
            input: {
              id: t.productId,
              title: t.translatedTitle,
              descriptionHtml: t.translatedDescription,
              seo: {
                title: t.seoTitle,
                description: t.seoDescription,
              },
            },
          },
        });
        savedIds.push(t.productId);
      } catch (e) {
        console.error("Bulk save error:", t.productId, e);
        failedIds.push(t.productId);
      }
    }

    return json({ success: true, bulkSaved: true, savedIds, failedIds });
  }

  return json({ success: false });
};

export default function MultiLang() {
  const { products, shop } = useLoaderData();
  const fetcher = useFetcher();
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedLang, setSelectedLang] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterLang, setFilterLang] = useState("all");
  const [translationStatus, setTranslationStatus] = useState({});
  const [showBulkResults, setShowBulkResults] = useState(false);

  // Bulk Translate Progress State
  const [bulkProgress, setBulkProgress] = useState({
    isOpen: false,
    title: "",
    currentStep: "",
    progress: 0,
    steps: [],
  });
  const [bulkTranslations, setBulkTranslations] = useState([]);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const abortRef = useRef(false);

  const isLoading = fetcher.state !== "idle";
  const result = fetcher.data;
  const selectedLanguage = LANGUAGES.find(l => l.code === selectedLang);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("titan_translation_status");
      if (stored) setTranslationStatus(JSON.parse(stored));
    } catch {}
  }, []);

  const saveTranslationStatus = useCallback((productId, langCode) => {
    setTranslationStatus(prev => {
      const updated = { ...prev };
      if (!updated[productId]) updated[productId] = {};
      updated[productId][langCode] = { translated: true, date: new Date().toISOString() };
      try { localStorage.setItem("titan_translation_status", JSON.stringify(updated)); } catch {}
      return updated;
    });
  }, []);

  useEffect(() => {
    if (result?.saved && result?.productId && selectedLang) {
      saveTranslationStatus(result.productId, selectedLang);
    }
    if (result?.bulkSaved && result?.savedIds?.length > 0 && selectedLang) {
      result.savedIds.forEach(id => saveTranslationStatus(id, selectedLang));
      setBulkSaving(false);
      setShowBulkConfirm(false);
      setBulkTranslations([]);
    }
    if (result?.bulkResults) {
      setShowBulkResults(true);
    }
  }, [result, selectedLang, saveTranslationStatus]);

  const getProductTranslatedLangs = useCallback((productId) => {
    const status = translationStatus[productId];
    if (!status) return [];
    return Object.keys(status).filter(k => status[k].translated);
  }, [translationStatus]);

  const filteredProducts = useMemo(() => {
    let filtered = [...products];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(p => p.title.toLowerCase().includes(q));
    }
    if (filterStatus === "translated") {
      filtered = filtered.filter(p => getProductTranslatedLangs(p.id).length > 0);
    } else if (filterStatus === "untranslated") {
      filtered = filtered.filter(p => getProductTranslatedLangs(p.id).length === 0);
    }
    if (filterLang !== "all") {
      filtered = filtered.filter(p => {
        const langs = getProductTranslatedLangs(p.id);
        return langs.includes(filterLang);
      });
    }
    return filtered;
  }, [products, searchQuery, filterStatus, filterLang, getProductTranslatedLangs]);

  const handleTranslate = (product) => {
    if (!product || !selectedLanguage) return;
    setSelectedProduct(product);
    const formData = new FormData();
    formData.set("intent", "translate");
    formData.set("productTitle", product.title);
    formData.set("productDescription", product.description);
    formData.set("productId", product.id);
    formData.set("targetLang", selectedLanguage.code);
    formData.set("targetLangLabel", selectedLanguage.label);
    fetcher.submit(formData, { method: "post" });
  };

  const handleSave = () => {
    if (!result?.translation || !selectedProduct) return;
    const formData = new FormData();
    formData.set("intent", "save");
    formData.set("productId", selectedProduct.id);
    formData.set("translatedTitle", result.translation.translatedTitle);
    formData.set("translatedDescription", result.translation.translatedDescription);
    formData.set("seoTitle", result.translation.seoTitle);
    formData.set("seoDescription", result.translation.seoDescription);
    fetcher.submit(formData, { method: "post" });
  };

  const handleBulkTranslate = async () => {
    if (!selectedLanguage || products.length === 0) return;
    setShowBulkResults(false);
    setBulkTranslations([]);
    setShowBulkConfirm(false);
    abortRef.current = false;

    const total = products.length;
    const initialSteps = products.map((p, i) => ({
      label: `${p.title.substring(0, 40)}${p.title.length > 40 ? "..." : ""}`,
      status: "pending",
    }));

    setBulkProgress({
      isOpen: true,
      title: `Shop auf ${selectedLanguage.label} übersetzen`,
      currentStep: `Starte Übersetzung von ${total} Produkten...`,
      progress: 0,
      steps: initialSteps,
    });

    const results = [];

    for (let i = 0; i < total; i++) {
      if (abortRef.current) break;

      const product = products[i];
      const updatedSteps = initialSteps.map((s, idx) => ({
        ...s,
        status: idx < i ? "done" : idx === i ? "active" : "pending",
      }));
      // Update already-translated steps with actual status
      results.forEach((r, idx) => {
        updatedSteps[idx] = { ...updatedSteps[idx], status: r.success ? "done" : "error" };
      });
      updatedSteps[i] = { label: updatedSteps[i].label, status: "active" };

      setBulkProgress({
        isOpen: true,
        title: `Shop auf ${selectedLanguage.label} übersetzen`,
        currentStep: `Übersetze Produkt ${i + 1} von ${total}: ${product.title.substring(0, 50)}...`,
        progress: Math.round((i / total) * 100),
        steps: updatedSteps,
      });

      try {
        const resp = await fetch("/app/multi-lang", {
          method: "POST",
          body: (() => {
            const fd = new FormData();
            fd.set("intent", "translate");
            fd.set("productTitle", product.title);
            fd.set("productDescription", product.description);
            fd.set("productId", product.id);
            fd.set("targetLang", selectedLanguage.code);
            fd.set("targetLangLabel", selectedLanguage.label);
            return fd;
          })(),
        });
        const data = await resp.json();
        if (data.success && data.translation) {
          results.push({ productId: product.id, productTitle: product.title, success: true, translation: data.translation });
        } else {
          results.push({ productId: product.id, productTitle: product.title, success: false });
        }
      } catch (e) {
        results.push({ productId: product.id, productTitle: product.title, success: false });
      }
    }

    // Final state update
    const finalSteps = results.map((r, idx) => ({
      label: initialSteps[idx]?.label || r.productTitle,
      status: r.success ? "done" : "error",
    }));

    setBulkProgress({
      isOpen: false,
      title: "",
      currentStep: "",
      progress: 100,
      steps: finalSteps,
    });

    setBulkTranslations(results);
    setShowBulkConfirm(true);
  };

  const handleBulkSave = () => {
    if (bulkTranslations.length > 0) {
      // Neue progressive Methode
      const translations = bulkTranslations
        .filter(r => r.success && r.translation)
        .map(r => ({
          productId: r.productId,
          translatedTitle: r.translation.translatedTitle,
          translatedDescription: r.translation.translatedDescription,
          seoTitle: r.translation.seoTitle,
          seoDescription: r.translation.seoDescription,
        }));
      setBulkSaving(true);
      const formData = new FormData();
      formData.set("intent", "save_all");
      formData.set("translations", JSON.stringify(translations));
      fetcher.submit(formData, { method: "post" });
      return;
    }
    // Fallback: alte Methode
    if (!result?.bulkResults) return;
    const translations = result.bulkResults
      .filter(r => r.success && r.translation)
      .map(r => ({
        productId: r.productId,
        translatedTitle: r.translation.translatedTitle,
        translatedDescription: r.translation.translatedDescription,
        seoTitle: r.translation.seoTitle,
        seoDescription: r.translation.seoDescription,
      }));
    const formData = new FormData();
    formData.set("intent", "save_all");
    formData.set("translations", JSON.stringify(translations));
    fetcher.submit(formData, { method: "post" });
  };

  const totalTranslated = Object.keys(translationStatus).length;
  const totalLangsUsed = new Set(
    Object.values(translationStatus).flatMap(v => Object.keys(v))
  ).size;

  return (
    <div className="titan-fade-in">
      <Page
        title="Multi-Language Optimizer"
        subtitle="Produkte für internationale Märkte übersetzen und optimieren"
        backAction={{ content: "Dashboard", url: "/app" }}
      >
        <BlockStack gap="600">

          {/* Stats Overview */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
            <div className="titan-metric-card">
              <div className="titan-metric-value">{products.length}</div>
              <div className="titan-metric-label">Produkte gesamt</div>
            </div>
            <div className="titan-metric-card">
              <div className="titan-metric-value">{totalTranslated}</div>
              <div className="titan-metric-label">Produkte übersetzt</div>
            </div>
            <div className="titan-metric-card">
              <div className="titan-metric-value">{totalLangsUsed}</div>
              <div className="titan-metric-label">Sprachen verwendet</div>
            </div>
            <div className="titan-metric-card">
              <div className="titan-metric-value">{LANGUAGES.length}</div>
              <div className="titan-metric-label">Verfügbare Sprachen</div>
            </div>
          </div>

          {/* Language Selection as Visual Cards */}
          <div>
            <div className="titan-section-header">
              <span className="titan-section-title">🌍 Zielsprache wählen</span>
            </div>
            <div style={{ marginBottom: "8px", fontSize: "13px", color: "#64748b" }}>
              Europa
            </div>
            <div className="titan-lang-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))" }}>
              {LANGUAGES.filter(l => l.region === "Europa").map(lang => (
                <div
                  key={lang.code}
                  className={`titan-lang-card ${selectedLang === lang.code ? "selected" : ""}`}
                  onClick={() => setSelectedLang(lang.code)}
                  style={{ cursor: "pointer" }}
                >
                  <span className="flag"><FlagIcon code={lang.code} size={28} /></span>
                  <div style={{ fontWeight: 600, fontSize: "13px" }}>{lang.label}</div>
                  <div style={{ fontSize: "10px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1px" }}>{lang.code}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: "16px", marginBottom: "8px", fontSize: "13px", color: "#64748b" }}>
              Asien
            </div>
            <div className="titan-lang-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))" }}>
              {LANGUAGES.filter(l => l.region === "Asien").map(lang => (
                <div
                  key={lang.code}
                  className={`titan-lang-card ${selectedLang === lang.code ? "selected" : ""}`}
                  onClick={() => setSelectedLang(lang.code)}
                  style={{ cursor: "pointer" }}
                >
                  <span className="flag"><FlagIcon code={lang.code} size={28} /></span>
                  <div style={{ fontWeight: 600, fontSize: "13px" }}>{lang.label}</div>
                  <div style={{ fontSize: "10px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1px" }}>{lang.code}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Bulk Translate Button */}
          {selectedLang && (
            <div className="titan-card-premium" style={{ padding: "20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <Text variant="headingSm" as="h2">Kompletten Shop übersetzen</Text>
                <Text variant="bodySm" tone="subdued">
                  Alle {products.length} Produkte auf {selectedLanguage?.label} (<FlagIcon code={selectedLanguage?.code} size={16} />) übersetzen und GEO-optimieren
                </Text>
              </div>
              <Button
                variant="primary"
                tone="success"
                onClick={handleBulkTranslate}
                disabled={isLoading}
                loading={isLoading && fetcher.formData?.get("intent") === "translate_all"}
                size="large"
              >
                🚀 Kompletten Shop übersetzen
              </Button>
            </div>
          )}

          {/* Loading Spinner */}
          {isLoading && (
            <Card>
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <Spinner size="large" />
                <div style={{ marginTop: "16px" }}>
                  <Text variant="bodyMd" tone="subdued">
                    KI übersetzt und optimiert für den Zielmarkt...
                  </Text>
                </div>
              </div>
            </Card>
          )}

          {/* Bulk Results */}
          {result?.bulkResults && showBulkResults && (
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingMd" as="h2">
                    Massenübersetzung: {result.targetLangLabel} <FlagIcon code={result.targetLang} size={20} />
                  </Text>
                  <InlineStack gap="200">
                    <Button variant="primary" onClick={handleBulkSave} loading={isLoading}>
                      Alle in Shopify speichern
                    </Button>
                    <Button onClick={() => setShowBulkResults(false)}>Schließen</Button>
                  </InlineStack>
                </InlineStack>
                <Divider />

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "14px" }}>
                  <div style={{ padding: "12px", background: "#ecfdf5", borderRadius: "8px", textAlign: "center" }}>
                    <strong style={{ color: "#059669", fontSize: "20px" }}>
                      {result.bulkResults.filter(r => r.success).length}
                    </strong>
                    <div style={{ color: "#065f46", fontSize: "12px" }}>Erfolgreich übersetzt</div>
                  </div>
                  <div style={{ padding: "12px", background: "#fef2f2", borderRadius: "8px", textAlign: "center" }}>
                    <strong style={{ color: "#dc2626", fontSize: "20px" }}>
                      {result.bulkResults.filter(r => !r.success).length}
                    </strong>
                    <div style={{ color: "#991b1b", fontSize: "12px" }}>Fehlgeschlagen</div>
                  </div>
                </div>

                {result.bulkResults.filter(r => r.success).map((r, idx) => (
                  <div key={idx} style={{ background: "#f8fafc", borderRadius: "12px", padding: "16px", border: "1px solid #e2e8f0" }}>
                    <div className="titan-compare-grid">
                      <div className="titan-compare-before">
                        <div className="titan-compare-label">Original</div>
                        <Text variant="bodyMd" fontWeight="semibold">{r.productTitle}</Text>
                      </div>
                      <div className="titan-compare-after">
                        <div className="titan-compare-label">{result.targetLangLabel}</div>
                        <Text variant="bodyMd" fontWeight="semibold">{r.translation.translatedTitle}</Text>
                        <Box paddingBlockStart="100">
                          <InlineStack gap="100" wrap>
                            {r.translation.keywords?.map((kw, ki) => (
                              <Badge key={ki} size="small">{kw}</Badge>
                            ))}
                          </InlineStack>
                        </Box>
                      </div>
                    </div>
                  </div>
                ))}
              </BlockStack>
            </Card>
          )}

          {/* Bulk Saved Banner */}
          {result?.bulkSaved && (
            <Banner tone="success" title="Alle Übersetzungen gespeichert!">
              {result.savedIds?.length} Produkte wurden erfolgreich in Shopify aktualisiert.
              {result.failedIds?.length > 0 && ` ${result.failedIds.length} Produkte konnten nicht gespeichert werden.`}
            </Banner>
          )}

          {/* Filter & Search */}
          <div className="titan-card-premium" style={{ padding: "20px" }}>
            <BlockStack gap="300">
              <Text variant="headingSm" as="h2">🔍 Produkte filtern</Text>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "12px", alignItems: "end" }}>
                <TextField
                  label="Produktsuche"
                  labelHidden
                  placeholder="Produkt suchen..."
                  value={searchQuery}
                  onChange={setSearchQuery}
                  autoComplete="off"
                  clearButton
                  onClearButtonClick={() => setSearchQuery("")}
                />
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>Status</label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    style={{
                      width: "100%", padding: "8px 12px", borderRadius: "8px",
                      border: "1px solid #e2e8f0", fontSize: "13px", background: "#fff",
                      color: "#1e293b", cursor: "pointer",
                    }}
                  >
                    <option value="all">Alle Produkte</option>
                    <option value="translated">Übersetzt</option>
                    <option value="untranslated">Nicht übersetzt</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>Sprache</label>
                  <select
                    value={filterLang}
                    onChange={(e) => setFilterLang(e.target.value)}
                    style={{
                      width: "100%", padding: "8px 12px", borderRadius: "8px",
                      border: "1px solid #e2e8f0", fontSize: "13px", background: "#fff",
                      color: "#1e293b", cursor: "pointer",
                    }}
                  >
                    <option value="all">Alle Sprachen</option>
                    {LANGUAGES.map(l => (
                      <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <Text variant="bodySm" tone="subdued">
                {filteredProducts.length} von {products.length} Produkten angezeigt
              </Text>
            </BlockStack>
          </div>

          {/* Product Card Grid */}
          <div>
            <div className="titan-section-header">
              <span className="titan-section-title">📦 Produkte ({filteredProducts.length})</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px" }}>
              {filteredProducts.map((product, idx) => {
                const translatedLangs = getProductTranslatedLangs(product.id);
                const isSelected = selectedProduct?.id === product.id;
                return (
                  <div
                    key={product.id}
                    className={`titan-card-premium titan-slide-up titan-stagger-${Math.min(idx + 1, 12)}`}
                    style={{
                      padding: 0,
                      overflow: "hidden",
                      border: isSelected ? "2px solid var(--titan-primary)" : undefined,
                      cursor: "default",
                    }}
                  >
                    {/* Product Image */}
                    <div style={{
                      height: "160px",
                      background: product.image
                        ? `url(${product.image}) center/cover no-repeat`
                        : "linear-gradient(135deg, #e0e7ff, #c7d2fe)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      position: "relative",
                    }}>
                      {!product.image && (
                        <span style={{ fontSize: "48px", opacity: 0.4 }}>📦</span>
                      )}
                      {/* Translation count badge */}
                      {translatedLangs.length > 0 && (
                        <div style={{
                          position: "absolute", top: "8px", right: "8px",
                          background: "linear-gradient(135deg, #10b981, #059669)",
                          color: "#fff", borderRadius: "20px", padding: "4px 10px",
                          fontSize: "11px", fontWeight: 700, boxShadow: "0 2px 8px rgba(16,185,129,0.3)",
                        }}>
                          {translatedLangs.length} Sprache{translatedLangs.length > 1 ? "n" : ""}
                        </div>
                      )}
                    </div>

                    {/* Product Info */}
                    <div style={{ padding: "16px" }}>
                      <Text variant="headingSm" as="h3">{product.title}</Text>
                      <Box paddingBlockStart="100">
                        <Text variant="bodySm" tone="subdued">
                          {product.description ? product.description.substring(0, 80) + (product.description.length > 80 ? "..." : "") : "Keine Beschreibung"}
                        </Text>
                      </Box>

                      {/* Current Language Badge */}
                      <Box paddingBlockStart="200">
                        <InlineStack gap="100" wrap>
                          <Badge tone="info">🇩🇪 Deutsch (Original)</Badge>
                        </InlineStack>
                      </Box>

                      {/* Translation Status Badges */}
                      {translatedLangs.length > 0 && (
                        <Box paddingBlockStart="200">
                          <InlineStack gap="100" wrap>
                            {translatedLangs.map(code => {
                              const lang = LANGUAGES.find(l => l.code === code);
                              return lang ? (
                                <Badge key={code} tone="success" size="small">
                                  <FlagIcon code={lang.code} size={14} /> {lang.label}
                                </Badge>
                              ) : null;
                            })}
                          </InlineStack>
                        </Box>
                      )}

                      {/* Translate Button */}
                      <Box paddingBlockStart="300">
                        <Button
                          variant="primary"
                          fullWidth
                          onClick={() => handleTranslate(product)}
                          disabled={!selectedLang || isLoading}
                          loading={isLoading && selectedProduct?.id === product.id && fetcher.formData?.get("intent") === "translate"}
                          size="slim"
                        >
                          {selectedLang
                            ? `In ${selectedLanguage?.label} übersetzen`
                            : "Sprache wählen"}
                        </Button>
                      </Box>
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredProducts.length === 0 && (
              <div className="titan-empty-state" style={{ marginTop: "24px" }}>
                <div className="titan-empty-state-icon">🔍</div>
                <Text variant="headingMd" as="h2">Keine Produkte gefunden</Text>
                <Box paddingBlockStart="200">
                  <Text variant="bodyMd" tone="subdued">
                    Passe deine Suchfilter an, um Produkte zu finden.
                  </Text>
                </Box>
              </div>
            )}
          </div>

          {/* Limit erreicht */}
          {result?.limitReached && (
            <Banner tone="warning" title="Tageslimit erreicht">
              <p>{result.error}</p>
              <div style={{ marginTop: "12px" }}>
                <Button variant="primary" url={result.upgradeUrl || "/app/billing"}>Jetzt upgraden</Button>
              </div>
            </Banner>
          )}

          {/* Error */}
          {result && !result.success && result.error && !result.limitReached && (
            <Banner tone="critical" title="Fehler">{result.error}</Banner>
          )}

          {/* Single Product Saved */}
          {result?.saved && !result?.bulkSaved && (
            <Banner tone="success" title="Erfolgreich gespeichert!">
              <p>
                Die übersetzte Version wurde in Shopify gespeichert. Die Originalsprache wurde mit der Übersetzung überschrieben.
              </p>
              {selectedProduct && (
                <Box paddingBlockStart="200">
                  <Button
                    url={`https://${shop}/admin/products/${selectedProduct.id.split("/").pop()}`}
                    external
                  >
                    Zur Produktseite →
                  </Button>
                </Box>
              )}
            </Banner>
          )}

          {/* Translation Result - Single Product */}
          {result?.success && result?.translation && !result?.saved && !result?.bulkResults && (
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <Text variant="headingSm" as="h2">
                      Übersetzung: {result.targetLangLabel}
                    </Text>
                    <FlagIcon code={result.targetLang} size={28} />
                  </InlineStack>
                  <InlineStack gap="200">
                    <Button variant="primary" onClick={handleSave} loading={isLoading}>
                      In Shopify speichern
                    </Button>
                    {selectedProduct && (
                      <Button
                        url={`https://${shop}/admin/products/${selectedProduct.id.split("/").pop()}`}
                        external
                      >
                        Zur Produktseite
                      </Button>
                    )}
                  </InlineStack>
                </InlineStack>
                <Divider />

                {/* Before / After Comparison */}
                <div className="titan-compare-grid">
                  <div className="titan-compare-before">
                    <div className="titan-compare-label">Original (Deutsch) 🇩🇪</div>
                    <div style={{ marginBottom: "12px" }}>
                      <Text variant="bodySm" fontWeight="semibold" tone="subdued">Titel</Text>
                      <Text variant="bodyMd">{result.productTitle}</Text>
                    </div>
                    {selectedProduct?.description && (
                      <div>
                        <Text variant="bodySm" fontWeight="semibold" tone="subdued">Beschreibung</Text>
                        <Text variant="bodySm" tone="subdued">
                          {selectedProduct.description.substring(0, 300)}
                          {selectedProduct.description.length > 300 ? "..." : ""}
                        </Text>
                      </div>
                    )}
                  </div>
                  <div className="titan-compare-after">
                    <div className="titan-compare-label">
                      {result.targetLangLabel} <FlagIcon code={result.targetLang} size={18} />
                    </div>
                    <div style={{ marginBottom: "12px" }}>
                      <Text variant="bodySm" fontWeight="semibold" tone="subdued">Titel</Text>
                      <Text variant="bodyMd" fontWeight="semibold">{result.translation.translatedTitle}</Text>
                    </div>
                    <div>
                      <Text variant="bodySm" fontWeight="semibold" tone="subdued">Beschreibung</Text>
                      <div
                        className="titan-content-preview"
                        style={{ marginTop: "4px", fontSize: "13px" }}
                        dangerouslySetInnerHTML={{ __html: result.translation.translatedDescription }}
                      />
                    </div>
                  </div>
                </div>

                {/* SEO Data */}
                <div style={{ background: "#f8fafc", borderRadius: "12px", padding: "16px" }}>
                  <Text variant="headingSm" as="h3">SEO-Daten ({result.targetLangLabel})</Text>
                  <Box paddingBlockStart="200">
                    <Text variant="bodySm" fontWeight="semibold" tone="subdued">Meta-Titel:</Text>
                    <Text variant="bodyMd">{result.translation.seoTitle}</Text>
                  </Box>
                  <Box paddingBlockStart="200">
                    <Text variant="bodySm" fontWeight="semibold" tone="subdued">Meta-Beschreibung:</Text>
                    <Text variant="bodyMd">{result.translation.seoDescription}</Text>
                  </Box>
                </div>

                {/* Keywords */}
                {result.translation.keywords?.length > 0 && (
                  <div>
                    <Text variant="bodySm" fontWeight="semibold" tone="subdued">Keywords ({result.targetLangLabel}):</Text>
                    <Box paddingBlockStart="100">
                      <InlineStack gap="200" wrap>
                        {result.translation.keywords.map((kw, i) => (
                          <Badge key={i}>{kw}</Badge>
                        ))}
                      </InlineStack>
                    </Box>
                  </div>
                )}

                {/* Cultural Notes */}
                {result.translation.culturalNotes && (
                  <Banner tone="info" title="Kulturelle Hinweise">
                    {result.translation.culturalNotes}
                  </Banner>
                )}
              </BlockStack>
            </Card>
          )}

          {/* Empty State */}
          {!result?.success && !selectedProduct && (
            <Card>
              <div className="titan-empty-state">
                <div className="titan-empty-state-icon">🌍</div>
                <Text variant="headingMd" as="h2">Multi-Language Optimizer</Text>
                <Box paddingBlockStart="200">
                  <Text variant="bodyMd" tone="subdued">
                    Wähle eine Zielsprache und klicke auf ein Produkt, um eine KI-optimierte
                    Übersetzung mit lokalen SEO-Keywords zu generieren. Oder übersetze den
                    kompletten Shop auf einmal.
                  </Text>
                </Box>
                <Box paddingBlockStart="300">
                  <InlineStack gap="200" wrap>
                    <Badge tone="info">16 Sprachen verfügbar</Badge>
                    <Badge tone="success">GEO-optimiert</Badge>
                    <Badge>Kulturelle Anpassung</Badge>
                  </InlineStack>
                </Box>
              </div>
            </Card>
          )}

        </BlockStack>
      </Page>

      {/* Loading Overlay für Bulk-Übersetzung */}
      <LoadingOverlay {...bulkProgress} />

      {/* Bestätigungsdialog nach Bulk-Übersetzung */}
      {showBulkConfirm && bulkTranslations.length > 0 && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 99998, padding: "20px",
        }}>
          <div style={{
            background: "#fff", borderRadius: "20px", padding: "32px",
            maxWidth: "700px", width: "100%", maxHeight: "80vh", overflow: "hidden",
            boxShadow: "0 25px 50px rgba(0,0,0,0.25)",
            display: "flex", flexDirection: "column",
          }}>
            <div style={{ marginBottom: "20px" }}>
              <Text variant="headingLg" as="h2">
                Übersetzungen bestätigen
              </Text>
              <div style={{ marginTop: "8px" }}>
                <Text variant="bodyMd" tone="subdued">
                  {bulkTranslations.filter(r => r.success).length} von {bulkTranslations.length} Produkten wurden erfolgreich übersetzt.
                  Prüfe die Ergebnisse und bestätige das Speichern.
                </Text>
              </div>
            </div>

            <Divider />

            <div style={{ flex: 1, overflowY: "auto", margin: "16px 0", paddingRight: "8px" }}>
              {bulkTranslations.map((r, idx) => (
                <div key={idx} style={{
                  padding: "12px 16px", marginBottom: "8px", borderRadius: "12px",
                  background: r.success ? "#f0fdf4" : "#fef2f2",
                  border: `1px solid ${r.success ? "#bbf7d0" : "#fecaca"}`,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <Text variant="bodyMd" fontWeight="semibold">
                      {r.success ? "✓" : "✗"} {r.productTitle}
                    </Text>
                    <Badge tone={r.success ? "success" : "critical"} size="small">
                      {r.success ? "Übersetzt" : "Fehlgeschlagen"}
                    </Badge>
                  </div>
                  {r.success && r.translation && (
                    <div style={{ fontSize: "13px", color: "#374151", marginTop: "4px" }}>
                      <div><strong>Neuer Titel:</strong> {r.translation.translatedTitle}</div>
                      {r.translation.seoTitle && (
                        <div style={{ color: "#6b7280", fontSize: "12px", marginTop: "2px" }}>
                          SEO: {r.translation.seoTitle}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <Divider />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px", gap: "12px" }}>
              <Button onClick={() => { setShowBulkConfirm(false); setBulkTranslations([]); }}>
                Abbrechen
              </Button>
              <div style={{ display: "flex", gap: "8px" }}>
                <Text variant="bodySm" tone="subdued" as="span">
                  {bulkTranslations.filter(r => r.success).length} Produkte werden gespeichert
                </Text>
                <Button
                  variant="primary"
                  tone="success"
                  onClick={handleBulkSave}
                  loading={bulkSaving}
                  disabled={bulkTranslations.filter(r => r.success).length === 0}
                >
                  Alle Übersetzungen in Shopify speichern
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
