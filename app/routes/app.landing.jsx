import { useState, useEffect, useCallback } from "react";

const FEATURES = [
  { icon: "🧠", title: "GEO-Optimierung", desc: "Deine Produkte werden für KI-Suchmaschinen wie ChatGPT, Perplexity und Gemini optimiert — die Zukunft der Suche.", tier: "Starter" },
  { icon: "🌍", title: "Multi-Language (16+)", desc: "Übersetze deinen gesamten Shop in 16+ Sprachen mit kultureller Anpassung und lokalen SEO-Keywords.", tier: "Starter" },
  { icon: "🖼️", title: "Alt-Text Optimizer", desc: "KI-generierte, SEO-optimierte Alt-Texte für alle Produktbilder — automatisch und in Sekunden.", tier: "Starter" },
  { icon: "📊", title: "SEO Health Check", desc: "Vollständige Analyse deines Shops mit konkreten Verbesserungsvorschlägen und Gesundheitswert.", tier: "Starter" },
  { icon: "🔑", title: "Keyword-Recherche", desc: "Finde die besten Keywords für deine Produkte mit KI-gestützter Analyse und Wettbewerbsdaten.", tier: "Pro" },
  { icon: "📝", title: "Content Audit", desc: "Tiefgehende Inhaltsanalyse mit Lesbarkeits-Score, Emotionsanalyse und KI-Empfehlungen.", tier: "Pro" },
  { icon: "🏷️", title: "Meta Generator", desc: "Generiere perfekte Meta-Titel und -Beschreibungen für alle Produkte mit einem Klick.", tier: "Pro" },
  { icon: "🔗", title: "Interne Verlinkung", desc: "Automatische Vorschläge für interne Links zwischen deinen Produkten und Seiten.", tier: "Pro" },
  { icon: "📈", title: "Ranking Tracker", desc: "Verfolge deine Positionen in Google und KI-Suchmaschinen in Echtzeit.", tier: "Enterprise" },
  { icon: "🏆", title: "Wettbewerber-Analyse", desc: "Analysiere deine Konkurrenz und finde Lücken, die du nutzen kannst.", tier: "Enterprise" },
  { icon: "💰", title: "ROI Dashboard", desc: "Miss den Return on Investment deiner GEO-Optimierungen mit klaren Metriken.", tier: "Enterprise" },
  { icon: "🎨", title: "Brand Templates", desc: "Erstelle und verwalte deine Marken-DNA für konsistente KI-Optimierungen.", tier: "Pro" },
];

const STEPS = [
  { num: "01", icon: "📥", title: "Installieren", desc: "Installiere Titan GEO Core in deinem Shopify-Shop — kostenlos und in unter 30 Sekunden." },
  { num: "02", icon: "🧬", title: "Brand DNA konfigurieren", desc: "Definiere deine Markenstimme, Zielgruppe und Werte. Die KI lernt deinen individuellen Stil." },
  { num: "03", icon: "🚀", title: "Optimieren", desc: "Starte die KI-Optimierung für Produkte, Alt-Texte, Meta-Daten und Übersetzungen." },
  { num: "04", icon: "📊", title: "Ergebnisse verfolgen", desc: "Beobachte, wie deine Sichtbarkeit in KI-Suchmaschinen und bei Google steigt." },
];

const TESTIMONIALS = [
  { quote: "Seit wir Titan GEO Core nutzen, werden unsere Produkte 3x häufiger von ChatGPT empfohlen. Absolut unglaublich!", name: "Sarah M.", shop: "NaturPur Kosmetik", rating: 5 },
  { quote: "Die Multi-Language-Funktion hat unseren internationalen Umsatz um 47% gesteigert. Allein dafür lohnt sich die App.", name: "Thomas K.", shop: "TechGadgets24", rating: 5 },
  { quote: "Endlich eine SEO-App, die versteht, wohin die Reise geht. GEO ist die Zukunft, und Titan ist der Schlüssel.", name: "Lisa W.", shop: "Fashion Forward DE", rating: 5 },
];

const FAQS = [
  { q: "Was ist GEO (Generative Engine Optimization)?", a: "GEO ist die Optimierung deiner Inhalte für KI-gestützte Suchmaschinen wie ChatGPT, Perplexity, Google Gemini und Microsoft Copilot. Während klassisches SEO auf Google-Rankings abzielt, sorgt GEO dafür, dass KI-Systeme deine Produkte verstehen, empfehlen und korrekt zitieren." },
  { q: "Warum ist GEO wichtig für meinen Shop?", a: "Immer mehr Kunden nutzen KI-Assistenten zum Einkaufen. Wenn deine Produkte nicht für diese Systeme optimiert sind, verlierst du potenzielle Kunden an die Konkurrenz. GEO sichert deine Sichtbarkeit in der neuen Ära der Suche." },
  { q: "Wie unterscheidet sich Titan GEO Core von normalen SEO-Apps?", a: "Normale SEO-Apps optimieren nur für Google. Titan GEO Core optimiert zusätzlich für KI-Suchmaschinen und nutzt fortschrittliche KI (Gemini 2.5), um deine Inhalte nicht nur zu optimieren, sondern komplett für die Zukunft der Suche vorzubereiten." },
  { q: "Kann ich die App kostenlos testen?", a: "Ja! Der Starter-Plan bietet 5 kostenlose Optimierungen, damit du die Leistung von Titan GEO Core ohne Risiko testen kannst. Du kannst jederzeit upgraden, wenn du mehr brauchst." },
  { q: "In welche Sprachen kann ich meinen Shop übersetzen?", a: "Titan GEO Core unterstützt über 16 Sprachen: Deutsch, Englisch, Französisch, Spanisch, Italienisch, Portugiesisch, Niederländisch, Polnisch, Tschechisch, Schwedisch, Dänisch, Norwegisch, Finnisch, Japanisch, Koreanisch und Chinesisch — mit kultureller Anpassung." },
  { q: "Werden meine Originaldaten überschrieben?", a: "Bei Übersetzungen wirst du vorher gewarnt. Wir empfehlen, Übersetzungen in separaten Shopify-Märkten zu verwalten oder vorher ein Backup zu erstellen. Bei SEO-Optimierungen werden nur Meta-Daten aktualisiert." },
  { q: "Welche KI-Technologie nutzt Titan GEO Core?", a: "Wir nutzen Google Gemini 2.5 — eines der fortschrittlichsten KI-Modelle der Welt. Es versteht Kontext, kulturelle Nuancen und SEO-Anforderungen auf höchstem Niveau." },
  { q: "Kann ich die Optimierungen vor dem Speichern überprüfen?", a: "Ja, immer! Jede Optimierung wird dir als Vorschau angezeigt — mit Vorher/Nachher-Vergleich. Du entscheidest, ob und wann die Änderungen gespeichert werden." },
  { q: "Wie sicher sind meine Daten?", a: "Wir speichern keine Produktdaten auf unseren Servern. Alle Optimierungen werden in Echtzeit durchgeführt und direkt in Shopify gespeichert. Die Kommunikation ist durchgehend verschlüsselt." },
];

const PLANS = [
  {
    name: "Starter",
    price: "Kostenlos",
    priceNum: null,
    desc: "Perfekt zum Testen",
    features: ["5 GEO-Optimierungen gesamt", "Alt-Text Optimizer (5/Tag)", "SEO Health Check (20 Produkte)", "3 Brand Templates", "JSON-LD Schema", "Theme Editor Integration"],
    color: "#27272a",
    accent: "#52525b",
  },
  {
    name: "Growth",
    price: "$19.99",
    priceNum: true,
    desc: "Für wachsende Shops",
    features: ["50 GEO-Optimierungen/Monat", "Alle Starter-Features", "Keyword-Recherche (20/Tag)", "Content Audit (20/Tag)", "Meta Generator (50/Tag)", "Wettbewerber-Analyse (5/Tag)", "ROI Dashboard", "E-Mail-Support"],
    color: "#18181b",
    accent: "#27272a",
  },
  {
    name: "Pro",
    price: "$39.99",
    priceNum: true,
    desc: "Maximale Sichtbarkeit",
    features: ["Unbegrenzte GEO-Optimierungen", "Alle Growth-Features", "Ranking Tracker", "Multi-Language (5 Sprachen)", "Bulk-Operationen", "Brand Templates + Custom Builder", "Interne Verlinkung (Auto-Apply)", "Priority Support"],
    color: "#3f3f46",
    accent: "#52525b",
    featured: true,
  },
  {
    name: "Enterprise",
    price: "$79.99",
    priceNum: true,
    desc: "Für Agenturen & große Shops",
    features: ["Alles aus Pro, plus:", "Multi-Language (16 Sprachen)", "API-Zugang", "Dedizierter Account Manager", "Custom Onboarding", "SLA 99.9%", "White-Label Option", "Priority Support (< 1h)"],
    color: "#3f3f46",
    accent: "#52525b",
  },
];

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState(null);
  const [counters, setCounters] = useState({ visibility: 0, optimizations: 0, languages: 0 });
  const [countersStarted, setCountersStarted] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const statsEl = document.getElementById("titan-landing-stats");
      if (statsEl && !countersStarted) {
        const rect = statsEl.getBoundingClientRect();
        if (rect.top < window.innerHeight * 0.85) {
          setCountersStarted(true);
        }
      }
    };
    window.addEventListener("scroll", handleScroll);
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [countersStarted]);

  useEffect(() => {
    if (!countersStarted) return;
    const targets = { visibility: 10, optimizations: 50, languages: 16 };
    const duration = 2000;
    const steps = 60;
    const interval = duration / steps;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      const progress = Math.min(step / steps, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCounters({
        visibility: Math.round(targets.visibility * eased),
        optimizations: Math.round(targets.optimizations * eased),
        languages: Math.round(targets.languages * eased),
      });
      if (step >= steps) clearInterval(timer);
    }, interval);

    return () => clearInterval(timer);
  }, [countersStarted]);

  const scrollTo = useCallback((id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }, []);

  return (
    <div className="titan-lp">
      <style>{`
        /* =============================================
           TITAN LANDING PAGE — DARK PREMIUM THEME
           ============================================= */

        .titan-lp {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          color: #e4e4e7;
          background: #09090b;
          overflow-x: hidden;
          -webkit-font-smoothing: antialiased;
        }

        .titan-lp *, .titan-lp *::before, .titan-lp *::after {
          box-sizing: border-box;
        }

        /* === Back Navigation === */
        .titan-lp-back {
          position: fixed;
          top: 20px;
          left: 20px;
          z-index: 100;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          background: rgba(10, 10, 15, 0.85);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(192, 192, 192, 0.15);
          border-radius: 10px;
          color: #c0c0c0;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          transition: all 0.3s ease;
        }

        .titan-lp-back:hover {
          background: rgba(24, 24, 27, 0.15);
          border-color: rgba(24, 24, 27, 0.4);
          color: #fff;
        }

        /* === Animations === */
        @keyframes titan-lp-gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        @keyframes titan-lp-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }

        @keyframes titan-lp-particle {
          0% { transform: translateY(0) translateX(0) scale(1); opacity: 0.4; }
          25% { opacity: 0.8; }
          50% { transform: translateY(-80px) translateX(40px) scale(1.3); opacity: 0.6; }
          75% { opacity: 0.3; }
          100% { transform: translateY(-160px) translateX(-30px) scale(0.6); opacity: 0; }
        }

        @keyframes titan-lp-pulse-ring {
          0% { transform: scale(0.85); opacity: 0.4; }
          50% { transform: scale(1.15); opacity: 0.15; }
          100% { transform: scale(0.85); opacity: 0.4; }
        }

        @keyframes titan-lp-counter-pop {
          0% { transform: scale(1); }
          50% { transform: scale(1.08); }
          100% { transform: scale(1); }
        }

        @keyframes titan-lp-shine {
          0% { left: -100%; }
          100% { left: 200%; }
        }

        @keyframes titan-lp-border-glow {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }

        @keyframes titan-lp-text-shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }

        /* === HERO SECTION === */
        .titan-lp-hero {
          background: linear-gradient(135deg, #09090b 0%, #09090b 25%, #18181b 50%, #09090b 75%, #09090b 100%);
          background-size: 300% 300%;
          animation: titan-lp-gradient 10s ease infinite;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
          padding: 100px 32px 80px;
        }

        .titan-lp-hero-content {
          text-align: center;
          position: relative;
          z-index: 2;
          max-width: 960px;
          width: 100%;
        }

        .titan-lp-hero-badge {
          display: inline-block;
          background: rgba(24, 24, 27, 0.12);
          border: 1px solid rgba(24, 24, 27, 0.3);
          border-radius: 100px;
          padding: 10px 24px;
          font-size: 14px;
          font-weight: 600;
          color: #27272a;
          margin-bottom: 40px;
          letter-spacing: 0.5px;
        }

        .titan-lp-hero-title {
          font-size: clamp(48px, 8vw, 80px);
          font-weight: 900;
          line-height: 1.05;
          margin: 0 0 32px 0;
          background: linear-gradient(135deg, #ffffff 0%, #c0c0c0 20%, #18181b 45%, #3f3f46 65%, #c0c0c0 85%, #ffffff 100%);
          background-size: 300% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: titan-lp-gradient 8s ease infinite;
          letter-spacing: -2px;
        }

        .titan-lp-hero-tagline {
          font-size: clamp(18px, 2.5vw, 24px);
          color: #a1a1aa;
          line-height: 1.6;
          margin: 0 auto 48px;
          max-width: 700px;
        }

        .titan-lp-hero-tagline strong {
          color: #27272a;
          font-weight: 700;
        }

        .titan-lp-hero-buttons {
          display: flex;
          gap: 20px;
          justify-content: center;
          flex-wrap: wrap;
          margin-bottom: 56px;
        }

        .titan-lp-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 18px 44px;
          background: linear-gradient(135deg, #18181b, #3f3f46);
          color: #fff;
          border: none;
          border-radius: 14px;
          font-size: 17px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          text-decoration: none;
          position: relative;
          overflow: hidden;
          letter-spacing: 0.3px;
        }

        .titan-lp-btn-primary::after {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 60%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent);
          transition: left 0.5s ease;
        }

        .titan-lp-btn-primary:hover {
          transform: translateY(-3px);
          box-shadow: 0 16px 40px rgba(24, 24, 27, 0.4), 0 0 80px rgba(24, 24, 27, 0.15);
        }

        .titan-lp-btn-primary:hover::after {
          left: 200%;
        }

        .titan-lp-btn-secondary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 18px 44px;
          background: transparent;
          color: #c0c0c0;
          border: 2px solid rgba(192, 192, 192, 0.25);
          border-radius: 14px;
          font-size: 17px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          text-decoration: none;
        }

        .titan-lp-btn-secondary:hover {
          border-color: #c0c0c0;
          background: rgba(192, 192, 192, 0.08);
          color: #fff;
          transform: translateY(-2px);
        }

        .titan-lp-trust-badges {
          display: flex;
          justify-content: center;
          gap: 36px;
          flex-wrap: wrap;
        }

        .titan-lp-trust-badge {
          color: #71717a;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .titan-lp-trust-check {
          color: #09090b;
          font-weight: 700;
        }

        /* === Glow Orbs === */
        .titan-lp-orb {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
        }

        /* === SECTION SHARED === */
        .titan-lp-section {
          padding: 100px 32px;
          position: relative;
        }

        .titan-lp-section-inner {
          max-width: 1200px;
          margin: 0 auto;
        }

        .titan-lp-section-tag {
          display: inline-block;
          background: rgba(24, 24, 27, 0.1);
          border: 1px solid rgba(24, 24, 27, 0.25);
          color: #27272a;
          border-radius: 100px;
          padding: 8px 20px;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 1px;
          text-transform: uppercase;
          margin-bottom: 24px;
        }

        .titan-lp-section-title {
          font-size: clamp(30px, 4.5vw, 48px);
          font-weight: 800;
          margin: 0 0 24px 0;
          color: #ffffff;
          letter-spacing: -1px;
          line-height: 1.15;
        }

        .titan-lp-section-subtitle {
          font-size: 18px;
          color: #a1a1aa;
          max-width: 700px;
          line-height: 1.7;
          margin: 0;
        }

        .titan-lp-section-header {
          text-align: center;
          margin-bottom: 72px;
        }

        .titan-lp-section-header .titan-lp-section-subtitle {
          margin-left: auto;
          margin-right: auto;
        }

        /* === GEO EXPLANATION SECTION === */
        .titan-lp-geo {
          background: #0a0a0b;
        }

        .titan-lp-geo-text {
          font-size: 18px;
          color: #a1a1aa;
          max-width: 800px;
          margin: 0 auto 64px;
          line-height: 1.8;
          text-align: center;
        }

        /* === STATS BOXES === */
        .titan-lp-stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 32px;
        }

        .titan-lp-stat-box {
          text-align: center;
          padding: 48px 32px;
          background: linear-gradient(145deg, #18181b 0%, #18181b 100%);
          border-radius: 24px;
          border: 1px solid rgba(192, 192, 192, 0.08);
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          overflow: hidden;
        }

        .titan-lp-stat-box::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 24px;
          padding: 1px;
          background: linear-gradient(135deg, transparent 30%, rgba(24, 24, 27, 0.3) 50%, transparent 70%);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          opacity: 0;
          transition: opacity 0.4s ease;
          pointer-events: none;
        }

        .titan-lp-stat-box:hover::before {
          opacity: 1;
        }

        .titan-lp-stat-box:hover {
          transform: translateY(-6px);
          box-shadow: 0 20px 50px rgba(24, 24, 27, 0.12);
        }

        .titan-lp-stat-number {
          font-size: 72px;
          font-weight: 900;
          line-height: 1.1;
          padding: 8px 0;
          margin-bottom: 16px;
          letter-spacing: -2px;
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .titan-lp-stat-number.purple {
          background-image: linear-gradient(135deg, #18181b, #27272a, #a1a1aa);
        }

        .titan-lp-stat-number.green {
          background-image: linear-gradient(135deg, #09090b, #09090b, #a1a1aa);
        }

        .titan-lp-stat-number.blue {
          background-image: linear-gradient(135deg, #27272a, #3f3f46, #52525b);
        }

        .titan-lp-stat-label {
          font-size: 18px;
          font-weight: 700;
          color: #e4e4e7;
          margin-bottom: 8px;
        }

        .titan-lp-stat-detail {
          font-size: 14px;
          color: #71717a;
        }

        /* === FEATURES SECTION === */
        .titan-lp-features {
          background: #09090b;
        }

        .titan-lp-tier-header {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 28px;
        }

        .titan-lp-tier-badge {
          padding: 8px 20px;
          border-radius: 100px;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.5px;
          white-space: nowrap;
        }

        .titan-lp-tier-badge.starter {
          background: rgba(27, 27, 30, 0.12);
          color: #52525b;
          border: 1px solid rgba(27, 27, 30, 0.25);
        }

        .titan-lp-tier-badge.pro {
          background: rgba(24, 24, 27, 0.12);
          color: #27272a;
          border: 1px solid rgba(24, 24, 27, 0.25);
        }

        .titan-lp-tier-badge.enterprise {
          background: rgba(63, 63, 70, 0.12);
          color: #52525b;
          border: 1px solid rgba(63, 63, 70, 0.25);
        }

        .titan-lp-tier-line {
          flex: 1;
          height: 1px;
          background: linear-gradient(90deg, rgba(192, 192, 192, 0.15), transparent);
        }

        .titan-lp-tier-group {
          margin-bottom: 56px;
        }

        .titan-lp-features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 24px;
        }

        .titan-lp-feature-card {
          background: #18181b;
          border: 1px solid rgba(192, 192, 192, 0.06);
          border-radius: 20px;
          padding: 32px;
          transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          overflow: hidden;
        }

        .titan-lp-feature-card::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 20px;
          padding: 1px;
          background: linear-gradient(135deg, transparent, rgba(24, 24, 27, 0.4), rgba(63, 63, 70, 0.4), transparent);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          opacity: 0;
          transition: opacity 0.35s ease;
          pointer-events: none;
        }

        .titan-lp-feature-card:hover::before {
          opacity: 1;
        }

        .titan-lp-feature-card:hover {
          transform: translateY(-6px);
          background: #1c1c1f;
          box-shadow: 0 24px 48px rgba(0, 0, 0, 0.3), 0 0 40px rgba(24, 24, 27, 0.08);
        }

        .titan-lp-feature-icon {
          font-size: 40px;
          margin-bottom: 20px;
          display: block;
        }

        .titan-lp-feature-title {
          font-size: 19px;
          font-weight: 700;
          margin: 0 0 12px 0;
          color: #ffffff;
        }

        .titan-lp-feature-desc {
          font-size: 15px;
          color: #a1a1aa;
          line-height: 1.65;
          margin: 0;
        }

        /* === HOW IT WORKS === */
        .titan-lp-steps {
          background: #0a0a0b;
        }

        .titan-lp-steps-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 32px;
          position: relative;
        }

        .titan-lp-steps-grid::before {
          content: '';
          position: absolute;
          top: 40px;
          left: 10%;
          right: 10%;
          height: 2px;
          background: linear-gradient(90deg, transparent, rgba(24, 24, 27, 0.3), rgba(63, 63, 70, 0.3), transparent);
          z-index: 0;
        }

        .titan-lp-step {
          text-align: center;
          position: relative;
          z-index: 1;
        }

        .titan-lp-step-circle {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: linear-gradient(135deg, #18181b, #3f3f46);
          color: #fff;
          font-size: 24px;
          font-weight: 800;
          margin-bottom: 28px;
          box-shadow: 0 8px 32px rgba(24, 24, 27, 0.3);
          position: relative;
        }

        .titan-lp-step-circle::after {
          content: '';
          position: absolute;
          inset: -4px;
          border-radius: 50%;
          border: 2px solid rgba(24, 24, 27, 0.2);
          animation: titan-lp-pulse-ring 4s ease-in-out infinite;
        }

        .titan-lp-step-icon {
          font-size: 36px;
          margin-bottom: 16px;
          display: block;
        }

        .titan-lp-step-title {
          font-size: 19px;
          font-weight: 700;
          margin: 0 0 12px 0;
          color: #ffffff;
        }

        .titan-lp-step-desc {
          font-size: 15px;
          color: #a1a1aa;
          line-height: 1.65;
          margin: 0;
          max-width: 260px;
          margin-left: auto;
          margin-right: auto;
        }

        /* === PRICING === */
        .titan-lp-pricing {
          background: #09090b;
        }

        .titan-lp-pricing-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 24px;
          align-items: stretch;
        }

        .titan-lp-plan-card {
          background: #18181b;
          border: 1px solid rgba(192, 192, 192, 0.06);
          border-radius: 24px;
          padding: 40px 32px;
          transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .titan-lp-plan-card:hover {
          transform: translateY(-8px);
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.4);
        }

        .titan-lp-plan-card.featured {
          border: 2px solid transparent;
          background-origin: border-box;
          background-clip: padding-box, border-box;
          background-image:
            linear-gradient(145deg, #18181b, #18181b),
            linear-gradient(135deg, #18181b, #3f3f46, #18181b);
          box-shadow: 0 12px 48px rgba(24, 24, 27, 0.2), 0 0 60px rgba(63, 63, 70, 0.08);
        }

        .titan-lp-plan-card.featured:hover {
          box-shadow: 0 24px 60px rgba(24, 24, 27, 0.3), 0 0 80px rgba(63, 63, 70, 0.12);
        }

        .titan-lp-plan-popular {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          background: linear-gradient(135deg, #18181b, #3f3f46);
          color: #fff;
          text-align: center;
          padding: 8px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 1.5px;
          text-transform: uppercase;
        }

        .titan-lp-plan-name {
          font-size: 22px;
          font-weight: 800;
          margin: 0 0 6px 0;
        }

        .titan-lp-plan-desc {
          font-size: 14px;
          color: #71717a;
          margin: 0 0 28px 0;
        }

        .titan-lp-plan-price {
          margin-bottom: 32px;
          line-height: 1.2;
        }

        .titan-lp-plan-price-amount {
          font-size: 52px;
          font-weight: 900;
          color: #ffffff;
          letter-spacing: -2px;
          line-height: 1.15;
          display: inline-block;
          padding: 4px 0;
        }

        .titan-lp-plan-price-period {
          font-size: 16px;
          color: #71717a;
          font-weight: 400;
        }

        .titan-lp-plan-features {
          list-style: none;
          padding: 0;
          margin: 0 0 36px 0;
          flex: 1;
        }

        .titan-lp-plan-features li {
          padding: 10px 0;
          font-size: 15px;
          color: #c0c0c0;
          display: flex;
          align-items: center;
          gap: 12px;
          border-bottom: 1px solid rgba(192, 192, 192, 0.06);
        }

        .titan-lp-plan-features li:last-child {
          border-bottom: none;
        }

        .titan-lp-plan-check {
          flex-shrink: 0;
          font-weight: 700;
          font-size: 16px;
        }

        .titan-lp-plan-cta {
          display: block;
          text-align: center;
          padding: 16px 28px;
          border-radius: 14px;
          font-weight: 700;
          font-size: 16px;
          text-decoration: none;
          transition: all 0.3s ease;
          cursor: pointer;
        }

        .titan-lp-plan-cta.gradient {
          background: linear-gradient(135deg, #18181b, #3f3f46);
          color: #fff;
          border: none;
        }

        .titan-lp-plan-cta.gradient:hover {
          box-shadow: 0 12px 32px rgba(24, 24, 27, 0.4);
          transform: translateY(-2px);
        }

        .titan-lp-plan-cta.outline {
          background: transparent;
          color: #c0c0c0;
          border: 2px solid rgba(192, 192, 192, 0.2);
        }

        .titan-lp-plan-cta.outline:hover {
          border-color: #c0c0c0;
          background: rgba(192, 192, 192, 0.06);
          color: #fff;
        }

        /* === TESTIMONIALS === */
        .titan-lp-testimonials {
          background: #0a0a0b;
        }

        .titan-lp-testimonials-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 32px;
        }

        .titan-lp-testimonial-card {
          background: #18181b;
          border: 1px solid rgba(192, 192, 192, 0.06);
          border-radius: 20px;
          padding: 36px;
          transition: all 0.3s ease;
        }

        .titan-lp-testimonial-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.3);
          border-color: rgba(192, 192, 192, 0.12);
        }

        .titan-lp-testimonial-stars {
          font-size: 20px;
          letter-spacing: 4px;
          color: #c0c0c0;
          margin-bottom: 20px;
        }

        .titan-lp-testimonial-quote {
          font-size: 16px;
          color: #c0c0c0;
          line-height: 1.75;
          margin: 0 0 28px 0;
          font-style: italic;
        }

        .titan-lp-testimonial-author {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .titan-lp-testimonial-avatar {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: linear-gradient(135deg, #18181b, #3f3f46);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-weight: 700;
          font-size: 20px;
          flex-shrink: 0;
        }

        .titan-lp-testimonial-name {
          font-weight: 700;
          font-size: 15px;
          color: #ffffff;
        }

        .titan-lp-testimonial-shop {
          font-size: 13px;
          color: #71717a;
          margin-top: 2px;
        }

        /* === FAQ === */
        .titan-lp-faq {
          background: #09090b;
        }

        .titan-lp-faq-list {
          max-width: 840px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .titan-lp-faq-item {
          background: #18181b;
          border: 1px solid rgba(192, 192, 192, 0.06);
          border-radius: 16px;
          overflow: hidden;
          transition: all 0.3s ease;
        }

        .titan-lp-faq-item:hover {
          border-color: rgba(192, 192, 192, 0.15);
        }

        .titan-lp-faq-item.open {
          border-color: rgba(24, 24, 27, 0.25);
        }

        .titan-lp-faq-question {
          padding: 22px 28px;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-weight: 600;
          font-size: 16px;
          color: #e4e4e7;
          background: transparent;
          border: none;
          width: 100%;
          text-align: left;
          transition: background 0.2s ease;
          user-select: none;
          font-family: inherit;
          gap: 16px;
        }

        .titan-lp-faq-question:hover {
          background: rgba(24, 24, 27, 0.04);
        }

        .titan-lp-faq-arrow {
          transition: transform 0.3s ease;
          font-size: 14px;
          color: #18181b;
          flex-shrink: 0;
        }

        .titan-lp-faq-arrow.open {
          transform: rotate(180deg);
        }

        .titan-lp-faq-answer {
          padding: 0 28px 24px;
          font-size: 15px;
          line-height: 1.75;
          color: #a1a1aa;
        }

        /* === FINAL CTA === */
        .titan-lp-final-cta {
          padding: 140px 32px;
          background: linear-gradient(135deg, #09090b 0%, #18181b 40%, #27272a 60%, #18181b 80%, #09090b 100%);
          background-size: 200% 200%;
          animation: titan-lp-gradient 10s ease infinite;
          text-align: center;
          position: relative;
          overflow: hidden;
        }

        .titan-lp-final-cta-content {
          position: relative;
          z-index: 2;
          max-width: 750px;
          margin: 0 auto;
        }

        .titan-lp-final-title {
          font-size: clamp(34px, 5vw, 56px);
          font-weight: 900;
          margin: 0 0 28px 0;
          color: #ffffff;
          line-height: 1.15;
          letter-spacing: -1px;
        }

        .titan-lp-final-text {
          font-size: 18px;
          color: #a1a1aa;
          margin: 0 0 48px 0;
          line-height: 1.7;
        }

        .titan-lp-final-note {
          margin-top: 28px;
          color: #71717a;
          font-size: 15px;
        }

        /* === FOOTER === */
        .titan-lp-footer {
          padding: 48px 32px;
          background: #09090b;
          text-align: center;
          border-top: 1px solid rgba(192, 192, 192, 0.05);
        }

        .titan-lp-footer p {
          color: #52525b;
          font-size: 14px;
          margin: 0;
        }

        /* === RESPONSIVE === */
        @media (max-width: 1200px) {
          .titan-lp-pricing-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 1023px) {
          .titan-lp-stats-grid {
            grid-template-columns: repeat(3, 1fr);
            gap: 20px;
          }

          .titan-lp-steps-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 40px;
          }

          .titan-lp-steps-grid::before {
            display: none;
          }

          .titan-lp-testimonials-grid {
            grid-template-columns: 1fr;
            max-width: 600px;
            margin-left: auto;
            margin-right: auto;
          }

          .titan-lp-pricing-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 767px) {
          .titan-lp-section {
            padding: 80px 20px;
          }

          .titan-lp-hero {
            padding: 100px 20px 60px;
            min-height: auto;
          }

          .titan-lp-stats-grid {
            grid-template-columns: 1fr;
            gap: 16px;
          }

          .titan-lp-stat-number {
            font-size: 56px;
          }

          .titan-lp-stat-box {
            padding: 36px 24px;
          }

          .titan-lp-steps-grid {
            grid-template-columns: 1fr;
            gap: 40px;
          }

          .titan-lp-pricing-grid {
            grid-template-columns: 1fr;
            max-width: 420px;
            margin-left: auto;
            margin-right: auto;
          }

          .titan-lp-features-grid {
            grid-template-columns: 1fr;
          }

          .titan-lp-hero-buttons {
            flex-direction: column;
            align-items: center;
          }

          .titan-lp-btn-primary,
          .titan-lp-btn-secondary {
            width: 100%;
            max-width: 340px;
            justify-content: center;
          }

          .titan-lp-final-cta {
            padding: 100px 20px;
          }

          .titan-lp-back {
            top: 12px;
            left: 12px;
            padding: 8px 16px;
            font-size: 13px;
          }

          .titan-lp-plan-price-amount {
            font-size: 44px;
          }
        }

        @media (max-width: 479px) {
          .titan-lp-hero-title {
            letter-spacing: -1px;
          }

          .titan-lp-stat-number {
            font-size: 48px;
          }

          .titan-lp-trust-badges {
            flex-direction: column;
            align-items: center;
            gap: 12px;
          }

          .titan-lp-section-header {
            margin-bottom: 48px;
          }
        }
      `}</style>

      {/* === BACK BUTTON === */}
      <a href="/app" className="titan-lp-back">
        ← Zurück zur App
      </a>

      {/* ================================================================ */}
      {/* === HERO SECTION === */}
      {/* ================================================================ */}
      <div className="titan-lp-hero">
        {/* Particles */}
        {Array.from({ length: 24 }).map((_, i) => (
          <div
            key={`p-${i}`}
            style={{
              position: "absolute",
              width: `${3 + (i % 4) * 2}px`,
              height: `${3 + (i % 4) * 2}px`,
              borderRadius: "50%",
              background: i % 3 === 0
                ? "rgba(24, 24, 27, 0.5)"
                : i % 3 === 1
                  ? "rgba(63, 63, 70, 0.4)"
                  : "rgba(192, 192, 192, 0.3)",
              left: `${(i * 4.3 + 2) % 98}%`,
              top: `${(i * 6.7 + 5) % 95}%`,
              animation: `titan-lp-particle ${7 + (i % 5) * 2}s ease-in-out infinite`,
              animationDelay: `${i * 0.5}s`,
              pointerEvents: "none",
            }}
          />
        ))}

        {/* Glow Orbs */}
        <div className="titan-lp-orb" style={{
          top: "5%", left: "10%", width: "500px", height: "500px",
          background: "radial-gradient(circle, rgba(24, 24, 27, 0.12) 0%, transparent 70%)",
          animation: "titan-lp-pulse-ring 8s ease-in-out infinite",
        }} />
        <div className="titan-lp-orb" style={{
          bottom: "5%", right: "5%", width: "450px", height: "450px",
          background: "radial-gradient(circle, rgba(63, 63, 70, 0.1) 0%, transparent 70%)",
          animation: "titan-lp-pulse-ring 10s ease-in-out infinite reverse",
        }} />
        <div className="titan-lp-orb" style={{
          top: "50%", left: "50%", width: "600px", height: "600px",
          transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, rgba(192, 192, 192, 0.03) 0%, transparent 60%)",
          animation: "titan-lp-pulse-ring 12s ease-in-out infinite",
        }} />

        <div className="titan-lp-hero-content">
          <div className="titan-lp-hero-badge">
            ✨ Die nächste Generation der Shop-Optimierung
          </div>

          <h1 className="titan-lp-hero-title">
            Titan GEO Core
          </h1>

          <p className="titan-lp-hero-tagline">
            Die <strong>KI-Revolution</strong> für deinen Shopify-Shop.
            Optimiere deine Produkte für ChatGPT, Perplexity, Gemini und die Zukunft der Suche.
          </p>

          <div className="titan-lp-hero-buttons">
            <a href="/app" className="titan-lp-btn-primary">
              Kostenlos starten →
            </a>
            <button
              className="titan-lp-btn-secondary"
              onClick={() => scrollTo("titan-features")}
            >
              Funktionen entdecken ↓
            </button>
          </div>

          <div className="titan-lp-trust-badges">
            {["Keine Kreditkarte nötig", "Shopify-zertifiziert", "DSGVO-konform", "Deutsche KI"].map((badge, i) => (
              <span key={i} className="titan-lp-trust-badge">
                <span className="titan-lp-trust-check">✓</span> {badge}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* === WHAT IS GEO === */}
      {/* ================================================================ */}
      <div className="titan-lp-section titan-lp-geo">
        <div className="titan-lp-section-inner">
          <div className="titan-lp-section-header">
            <div className="titan-lp-section-tag">WAS IST GEO?</div>
            <h2 className="titan-lp-section-title">
              Generative Engine Optimization
            </h2>
          </div>

          <p className="titan-lp-geo-text">
            Die Art, wie Menschen suchen, verändert sich grundlegend. ChatGPT, Perplexity, Google Gemini
            und Microsoft Copilot liefern direkte Antworten statt Links. Wenn deine Produkte nicht für
            diese KI-Systeme optimiert sind, wirst du unsichtbar.
          </p>

          {/* Stats */}
          <div id="titan-landing-stats" className="titan-lp-stats-grid">
            <div className="titan-lp-stat-box">
              <div
                className="titan-lp-stat-number purple"
                style={{
                  animation: countersStarted ? "titan-lp-counter-pop 0.6s ease" : "none",
                }}
              >
                {counters.visibility}X
              </div>
              <div className="titan-lp-stat-label">Mehr Sichtbarkeit</div>
              <div className="titan-lp-stat-detail">In KI-Suchmaschinen</div>
            </div>

            <div className="titan-lp-stat-box">
              <div
                className="titan-lp-stat-number green"
                style={{
                  animation: countersStarted ? "titan-lp-counter-pop 0.6s ease 0.2s" : "none",
                  animationFillMode: "both",
                }}
              >
                {counters.optimizations}+
              </div>
              <div className="titan-lp-stat-label">KI-Optimierungen</div>
              <div className="titan-lp-stat-detail">Verfügbare Analyse-Tools</div>
            </div>

            <div className="titan-lp-stat-box">
              <div
                className="titan-lp-stat-number blue"
                style={{
                  animation: countersStarted ? "titan-lp-counter-pop 0.6s ease 0.4s" : "none",
                  animationFillMode: "both",
                }}
              >
                {counters.languages}+
              </div>
              <div className="titan-lp-stat-label">Sprachen</div>
              <div className="titan-lp-stat-detail">Mit kultureller Anpassung</div>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* === FEATURES === */}
      {/* ================================================================ */}
      <div id="titan-features" className="titan-lp-section titan-lp-features">
        <div className="titan-lp-section-inner">
          <div className="titan-lp-section-header">
            <div className="titan-lp-section-tag">FEATURES</div>
            <h2 className="titan-lp-section-title">
              Alles, was dein Shop braucht
            </h2>
            <p className="titan-lp-section-subtitle">
              12 leistungsstarke Module, die deinen Shop für die Zukunft der Suche optimieren.
            </p>
          </div>

          {["Starter", "Pro", "Enterprise"].map(tier => {
            const tierFeatures = FEATURES.filter(f => f.tier === tier);
            return (
              <div key={tier} className="titan-lp-tier-group">
                <div className="titan-lp-tier-header">
                  <span className={`titan-lp-tier-badge ${tier.toLowerCase()}`}>
                    {tier}
                  </span>
                  <div className="titan-lp-tier-line" />
                </div>
                <div className="titan-lp-features-grid">
                  {tierFeatures.map((feature, idx) => (
                    <div key={idx} className="titan-lp-feature-card">
                      <span className="titan-lp-feature-icon">{feature.icon}</span>
                      <h3 className="titan-lp-feature-title">{feature.title}</h3>
                      <p className="titan-lp-feature-desc">{feature.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ================================================================ */}
      {/* === HOW IT WORKS === */}
      {/* ================================================================ */}
      <div className="titan-lp-section titan-lp-steps">
        <div className="titan-lp-section-inner">
          <div className="titan-lp-section-header">
            <div className="titan-lp-section-tag">SO FUNKTIONIERT'S</div>
            <h2 className="titan-lp-section-title">
              In 4 Schritten zum Erfolg
            </h2>
          </div>

          <div className="titan-lp-steps-grid">
            {STEPS.map((step, idx) => (
              <div key={idx} className="titan-lp-step">
                <div className="titan-lp-step-circle">
                  {step.num}
                </div>
                <span className="titan-lp-step-icon">{step.icon}</span>
                <h3 className="titan-lp-step-title">{step.title}</h3>
                <p className="titan-lp-step-desc">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* === PRICING === */}
      {/* ================================================================ */}
      <div className="titan-lp-section titan-lp-pricing">
        <div className="titan-lp-section-inner">
          <div className="titan-lp-section-header">
            <div className="titan-lp-section-tag">PREISE</div>
            <h2 className="titan-lp-section-title">
              Wähle deinen Plan
            </h2>
            <p className="titan-lp-section-subtitle">
              Starte kostenlos. Upgrade, wenn du bereit bist.
            </p>
          </div>

          <div className="titan-lp-pricing-grid">
            {PLANS.map((plan, idx) => (
              <div
                key={idx}
                className={`titan-lp-plan-card ${plan.featured ? "featured" : ""}`}
              >
                {plan.featured && (
                  <div className="titan-lp-plan-popular">
                    Beliebtester Plan
                  </div>
                )}
                <div style={{ paddingTop: plan.featured ? "20px" : "0", display: "flex", flexDirection: "column", flex: 1 }}>
                  <h3 className="titan-lp-plan-name" style={{ color: plan.accent }}>
                    {plan.name}
                  </h3>
                  <p className="titan-lp-plan-desc">{plan.desc}</p>

                  <div className="titan-lp-plan-price">
                    {plan.priceNum ? (
                      <>
                        <span className="titan-lp-plan-price-amount">{plan.price}</span>
                        <span className="titan-lp-plan-price-period"> /Monat</span>
                      </>
                    ) : (
                      <span className="titan-lp-plan-price-amount">{plan.price}</span>
                    )}
                  </div>

                  <ul className="titan-lp-plan-features">
                    {plan.features.map((f, fi) => (
                      <li key={fi}>
                        <span className="titan-lp-plan-check" style={{ color: plan.accent }}>✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>

                  <a
                    href="/app/billing"
                    className={`titan-lp-plan-cta ${plan.featured ? "gradient" : "outline"}`}
                  >
                    {plan.priceNum ? "Jetzt starten →" : "Kostenlos testen →"}
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* === TESTIMONIALS === */}
      {/* ================================================================ */}
      <div className="titan-lp-section titan-lp-testimonials">
        <div className="titan-lp-section-inner">
          <div className="titan-lp-section-header">
            <div className="titan-lp-section-tag">KUNDENSTIMMEN</div>
            <h2 className="titan-lp-section-title">
              Was unsere Kunden sagen
            </h2>
          </div>

          <div className="titan-lp-testimonials-grid">
            {TESTIMONIALS.map((t, idx) => (
              <div key={idx} className="titan-lp-testimonial-card">
                <div className="titan-lp-testimonial-stars">
                  {"★".repeat(t.rating)}
                </div>
                <p className="titan-lp-testimonial-quote">
                  &bdquo;{t.quote}&ldquo;
                </p>
                <div className="titan-lp-testimonial-author">
                  <div className="titan-lp-testimonial-avatar">
                    {t.name.charAt(0)}
                  </div>
                  <div>
                    <div className="titan-lp-testimonial-name">{t.name}</div>
                    <div className="titan-lp-testimonial-shop">{t.shop}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* === FAQ === */}
      {/* ================================================================ */}
      <div className="titan-lp-section titan-lp-faq">
        <div className="titan-lp-section-inner">
          <div className="titan-lp-section-header">
            <div className="titan-lp-section-tag">FAQ</div>
            <h2 className="titan-lp-section-title">
              Häufig gestellte Fragen
            </h2>
          </div>

          <div className="titan-lp-faq-list">
            {FAQS.map((faq, idx) => (
              <div
                key={idx}
                className={`titan-lp-faq-item ${openFaq === idx ? "open" : ""}`}
              >
                <button
                  className="titan-lp-faq-question"
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                >
                  <span>{faq.q}</span>
                  <span className={`titan-lp-faq-arrow ${openFaq === idx ? "open" : ""}`}>
                    ▼
                  </span>
                </button>
                {openFaq === idx && (
                  <div className="titan-lp-faq-answer">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* === FINAL CTA === */}
      {/* ================================================================ */}
      <div className="titan-lp-final-cta">
        {/* Orbs */}
        <div className="titan-lp-orb" style={{
          top: "15%", left: "8%", width: "350px", height: "350px",
          background: "radial-gradient(circle, rgba(24, 24, 27, 0.12) 0%, transparent 70%)",
          animation: "titan-lp-pulse-ring 7s ease-in-out infinite",
        }} />
        <div className="titan-lp-orb" style={{
          bottom: "15%", right: "10%", width: "300px", height: "300px",
          background: "radial-gradient(circle, rgba(63, 63, 70, 0.1) 0%, transparent 70%)",
          animation: "titan-lp-pulse-ring 9s ease-in-out infinite reverse",
        }} />

        <div className="titan-lp-final-cta-content">
          <h2 className="titan-lp-final-title">
            Bereit für die Zukunft der Suche?
          </h2>
          <p className="titan-lp-final-text">
            Schließe dich Hunderten von Shopify-Händlern an, die ihre Shops bereits
            für KI-Suchmaschinen optimiert haben. Starte jetzt — kostenlos.
          </p>
          <a href="/app" className="titan-lp-btn-primary" style={{ fontSize: "19px", padding: "20px 56px" }}>
            Jetzt kostenlos starten →
          </a>
          <div className="titan-lp-final-note">
            Keine Kreditkarte erforderlich  ·  Sofort einsatzbereit  ·  Jederzeit kündbar
          </div>
        </div>
      </div>

      {/* === FOOTER === */}
      <div className="titan-lp-footer">
        <p>
          © 2026 Titan GEO Core — Generative Engine Optimization für Shopify.
          Entwickelt mit ❤️ in Deutschland.
        </p>
      </div>
    </div>
  );
}
