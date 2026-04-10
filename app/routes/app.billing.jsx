import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import {
  Page, BlockStack, Text, InlineStack, Button, Banner, Box, Card, Divider, Badge,
} from "@shopify/polaris";
import { authenticate, GROWTH_PLAN, PRO_PLAN, ENTERPRISE_PLAN } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  try {
    const { billing, session } = await authenticate.admin(request);
    const shop = session.shop;

    const isTest = process.env.NODE_ENV !== "production";

    let currentPlan = "Starter";
    try {
      const { hasActivePayment, appSubscriptions } = await billing.check({
        plans: [GROWTH_PLAN, PRO_PLAN, ENTERPRISE_PLAN],
        isTest,
      });

      if (hasActivePayment && appSubscriptions?.length > 0) {
        const sub = appSubscriptions[0];
        if (sub.name === ENTERPRISE_PLAN) currentPlan = "Enterprise";
        else if (sub.name === PRO_PLAN) currentPlan = "Pro";
        else if (sub.name === GROWTH_PLAN) currentPlan = "Growth";
      }
    } catch (billingError) {
      console.error("Billing check error:", billingError);
      // Continue with Starter plan as default
    }

    const usage = await prisma.usageTracker.count({ where: { shop } });

    return json({ currentPlan, usage });
  } catch (error) {
    console.error("Billing loader error:", error);
    return json({ currentPlan: "Starter", usage: 0 });
  }
};

export const action = async ({ request }) => {
  const formData = await request.formData();
  const plan = formData.get("plan");

  const planMap = {
    growth: GROWTH_PLAN,
    pro: PRO_PLAN,
    enterprise: ENTERPRISE_PLAN,
  };

  if (planMap[plan]) {
    // Dynamically determine isTest flag
    const isTest = process.env.NODE_ENV !== "production";

    try {
      const { billing } = await authenticate.admin(request);
      await billing.request({
        plan: planMap[plan],
        isTest,
      });
    } catch (error) {
      // billing.request throws a redirect to Shopify's billing confirmation — that's expected
      // If the error is a Response (redirect), re-throw it to let Remix handle it
      if (error instanceof Response) {
        throw error;
      }
      console.error("Billing action error:", error);
      throw error;
    }
  }

  return null;
};

const plans = [
  {
    name: "Starter",
    price: "0",
    period: "Kostenlos für immer",
    description: "Perfekt zum Ausprobieren und für kleine Shops",
    featured: false,
    planKey: "starter",
    trialText: null,
    features: [
      { text: "5 GEO-Optimierungen gesamt", included: true },
      { text: "3 Keyword-Recherchen/Tag", included: true },
      { text: "3 Content Audits/Tag", included: true },
      { text: "SEO Health Check (20 Produkte)", included: true },
      { text: "3 Brand Templates", included: true },
      { text: "Meta Generator (10/Tag)", included: true },
      { text: "Alt-Text Generator (5/Tag)", included: true },
      { text: "JSON-LD Schema", included: true },
      { text: "Theme Editor Integration", included: true },
      { text: "24h Cooldown auf limitierte Features", included: true },
      { text: "Wettbewerber-Analyse", included: false },
      { text: "Interne Verlinkung", included: false },
      { text: "ROI Dashboard", included: false },
      { text: "IndexNow Indexing", included: false },
      { text: "Ranking Tracker", included: false },
      { text: "Multi-Language", included: false },
      { text: "Bulk-Operationen", included: false },
      { text: "API-Zugang", included: false },
    ],
  },
  {
    name: "Growth",
    price: "19.99",
    period: "/Monat",
    description: "Für wachsende Shops die mehr Sichtbarkeit wollen",
    featured: false,
    planKey: "growth",
    trialText: "7 Tage kostenlos testen",
    features: [
      { text: "50 GEO-Optimierungen/Monat", included: true },
      { text: "20 Keyword-Recherchen/Tag", included: true },
      { text: "20 Content Audits/Tag", included: true },
      { text: "SEO Health Check (alle Produkte)", included: true },
      { text: "10 Brand Templates", included: true },
      { text: "Meta Generator (50/Tag)", included: true },
      { text: "Alt-Text Generator (30/Tag)", included: true },
      { text: "Wettbewerber-Analyse (5/Tag)", included: true },
      { text: "Interne Verlinkung", included: true },
      { text: "ROI Dashboard", included: true },
      { text: "IndexNow Indexing", included: true },
      { text: "E-Mail Support", included: true },
      { text: "Ranking Tracker", included: false },
      { text: "Multi-Language", included: false },
      { text: "Bulk-Operationen", included: false },
      { text: "API-Zugang", included: false },
      { text: "Custom Template Builder", included: false },
      { text: "White-Label Option", included: false },
    ],
  },
  {
    name: "Pro",
    price: "39.99",
    period: "/Monat",
    description: "Für ambitionierte Shops die Sichtbarkeit maximieren wollen",
    featured: true,
    planKey: "pro",
    trialText: "7 Tage kostenlos testen",
    features: [
      { text: "Unbegrenzte GEO-Optimierungen", included: true },
      { text: "Unbegrenzte Keyword-Recherchen", included: true },
      { text: "Unbegrenzte Content Audits", included: true },
      { text: "Alle Brand Templates + Custom Builder", included: true },
      { text: "Wettbewerber-Analyse (unbegrenzt)", included: true },
      { text: "Ranking Tracker", included: true },
      { text: "Interne Verlinkung (Auto-Apply)", included: true },
      { text: "Multi-Language (5 Sprachen)", included: true },
      { text: "Bulk-Operationen", included: true },
      { text: "Priority Support", included: true },
      { text: "ROI Dashboard + Google SC", included: true },
      { text: "IndexNow Indexing", included: true },
      { text: "API-Zugang", included: false },
      { text: "Dedizierter Account Manager", included: false },
      { text: "White-Label Option", included: false },
      { text: "SLA 99.9%", included: false },
    ],
  },
  {
    name: "Enterprise",
    price: "79.99",
    period: "/Monat",
    description: "Für große Shops und Agenturen mit Premium-Anforderungen",
    featured: false,
    planKey: "enterprise",
    trialText: "14 Tage kostenlos testen",
    features: [
      { text: "Alles aus Pro, plus:", included: true },
      { text: "Multi-Language (16 Sprachen)", included: true },
      { text: "API-Zugang", included: true },
      { text: "Dedizierter Account Manager", included: true },
      { text: "Custom Onboarding", included: true },
      { text: "SLA 99.9%", included: true },
      { text: "White-Label Option", included: true },
      { text: "Benutzerdefinierte Integrationen", included: true },
      { text: "Priority Support (< 1h)", included: true },
    ],
  },
];

const comparisonFeatures = [
  ["GEO-Optimierungen", "5 gesamt", "50/Monat", "Unbegrenzt", "Unbegrenzt"],
  ["Keyword-Recherchen", "3/Tag", "20/Tag", "Unbegrenzt", "Unbegrenzt"],
  ["Content Audits", "3/Tag", "20/Tag", "Unbegrenzt", "Unbegrenzt"],
  ["SEO Health Check", "20 Produkte", "Alle Produkte", "Alle Produkte", "Alle Produkte"],
  ["Brand Templates", "3", "10", "Alle + Custom", "Alle + Custom"],
  ["Meta Generator", "10/Tag", "50/Tag", "Unbegrenzt", "Unbegrenzt"],
  ["Alt-Text Generator", "5/Tag", "30/Tag", "Unbegrenzt", "Unbegrenzt"],
  ["JSON-LD Schema", "✓", "✓", "✓", "✓"],
  ["Theme Editor Integration", "✓", "✓", "✓", "✓"],
  ["Wettbewerber-Analyse", "—", "5/Tag", "Unbegrenzt", "Unbegrenzt"],
  ["Interne Verlinkung", "—", "✓", "Auto-Apply", "Auto-Apply"],
  ["ROI Dashboard", "—", "✓", "✓ + Google SC", "✓ + Google SC"],
  ["IndexNow Indexing", "—", "✓", "✓", "✓"],
  ["Ranking Tracker", "—", "—", "✓", "✓"],
  ["Multi-Language", "—", "—", "5 Sprachen", "16 Sprachen"],
  ["Bulk-Operationen", "—", "—", "✓", "✓"],
  ["API-Zugang", "—", "—", "—", "✓"],
  ["Dedizierter Account Manager", "—", "—", "—", "✓"],
  ["Custom Onboarding", "—", "—", "—", "✓"],
  ["SLA 99.9%", "—", "—", "—", "✓"],
  ["White-Label Option", "—", "—", "—", "✓"],
  ["Benutzerdefinierte Integrationen", "—", "—", "—", "✓"],
  ["Support", "Community", "E-Mail", "Priority", "Priority (< 1h)"],
];

export default function Billing() {
  const { currentPlan, usage } = useLoaderData();
  const submit = useSubmit();
  const handleSubscribe = (planKey) => {
    const formData = new FormData();
    formData.set("plan", planKey);
    submit(formData, { method: "post" });
  };

  return (
    <Page
      title="Pläne & Preise"
      subtitle="Wähle den Plan der zu deinem Shop passt"
      backAction={{ content: "Dashboard", url: "/app" }}
    >
      <div className="titan-fade-in">
        <BlockStack gap="600">

          {currentPlan !== "Starter" && (
            <Banner tone="success" title={`Dein aktueller Plan: ${currentPlan}`}>
              <p>Du nutzt aktuell den {currentPlan}-Plan. Vielen Dank für dein Vertrauen!</p>
            </Banner>
          )}

          {/* Pricing Cards */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "20px",
          }}>
            {plans.map((plan) => (
              <div
                key={plan.name}
                style={{
                  background: plan.featured ? "#fafaff" : "#ffffff",
                  borderRadius: "16px",
                  padding: "28px 24px",
                  display: "flex",
                  flexDirection: "column",
                  position: "relative",
                  overflow: "hidden",
                  border: plan.featured ? "2px solid transparent" : "1px solid #e2e8f0",
                  backgroundImage: plan.featured
                    ? "linear-gradient(#fafaff, #fafaff), linear-gradient(135deg, #6366f1, #a855f7, #ec4899, #6366f1)"
                    : "none",
                  backgroundOrigin: plan.featured ? "border-box" : "padding-box",
                  backgroundClip: plan.featured ? "padding-box, border-box" : "padding-box",
                  animation: plan.featured ? "titan-gradient-border 3s linear infinite" : "none",
                  boxShadow: plan.featured ? "0 0 30px rgba(99, 102, 241, 0.15)" : "0 2px 12px rgba(0,0,0,0.06)",
                }}
              >
                {plan.featured && (
                  <div style={{
                    position: "absolute",
                    top: "12px",
                    right: "12px",
                    background: "linear-gradient(135deg, #6366f1, #a855f7)",
                    color: "#fff",
                    fontSize: "11px",
                    fontWeight: 700,
                    padding: "4px 12px",
                    borderRadius: "20px",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}>
                    Beliebtester Plan
                  </div>
                )}

                <div style={{ marginBottom: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    <span style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>
                      {plan.name}
                    </span>
                    {plan.name === currentPlan && (
                      <Badge tone="info">Aktiv</Badge>
                    )}
                  </div>
                  <div style={{ fontSize: "13px", color: "#94a3b8", lineHeight: "1.5" }}>
                    {plan.description}
                  </div>
                </div>

                <div style={{ marginBottom: "20px" }}>
                  <span style={{
                    fontSize: "36px",
                    fontWeight: 900,
                    color: "#0f172a",
                    letterSpacing: "-1px",
                  }}>
                    {plan.price === "0" ? "Gratis" : `$${plan.price}`}
                  </span>
                  {plan.price !== "0" && (
                    <span style={{ fontSize: "14px", color: "#94a3b8", marginLeft: "4px" }}>
                      {plan.period}
                    </span>
                  )}
                  {plan.trialText && (
                    <div style={{ fontSize: "12px", color: "#10b981", fontWeight: 600, marginTop: "4px" }}>
                      {plan.trialText}
                    </div>
                  )}
                </div>

                <div style={{
                  height: "1px",
                  background: "linear-gradient(to right, transparent, #e2e8f0, transparent)",
                  margin: "0 0 20px 0",
                }} />

                <ul style={{
                  listStyle: "none",
                  padding: 0,
                  margin: "0 0 24px 0",
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}>
                  {plan.features.map((feature, i) => (
                    <li
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "8px",
                        fontSize: "13px",
                        color: feature.included ? "#334155" : "#cbd5e1",
                        lineHeight: "1.4",
                      }}
                    >
                      <span style={{
                        flexShrink: 0,
                        marginTop: "1px",
                        fontSize: "14px",
                        color: feature.included ? "#10b981" : "#475569",
                      }}>
                        {feature.included ? "✓" : "✗"}
                      </span>
                      {feature.text}
                    </li>
                  ))}
                </ul>

                <div style={{ marginTop: "auto" }}>
                  {plan.name === currentPlan ? (
                    <Button disabled fullWidth>
                      Aktueller Plan
                    </Button>
                  ) : plan.planKey === "starter" ? (
                    <Button
                      disabled={currentPlan === "Starter"}
                      fullWidth
                    >
                      {currentPlan === "Starter" ? "Aktueller Plan" : "Downgrade"}
                    </Button>
                  ) : (
                    <Button
                      variant={plan.featured ? "primary" : "secondary"}
                      fullWidth
                      onClick={() => handleSubscribe(plan.planKey)}
                    >
                      {plan.featured ? "Jetzt upgraden" : `${plan.name} wählen`}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Feature Comparison Table */}
          <Card>
            <BlockStack gap="400">
              <div style={{ padding: "4px 0" }}>
                <Text variant="headingSm" as="h2">Vollständiger Feature-Vergleich</Text>
              </div>
              <Divider />
              <div style={{ overflowX: "auto" }}>
                <table style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "13px",
                }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                      <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700, color: "#0f172a" }}>Feature</th>
                      <th style={{ textAlign: "center", padding: "12px 16px", fontWeight: 700, color: "#0f172a" }}>Starter</th>
                      <th style={{ textAlign: "center", padding: "12px 16px", fontWeight: 700, color: "#0f172a" }}>Growth</th>
                      <th style={{ textAlign: "center", padding: "12px 16px", fontWeight: 700, color: "#6366f1" }}>Pro</th>
                      <th style={{ textAlign: "center", padding: "12px 16px", fontWeight: 700, color: "#0f172a" }}>Enterprise</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonFeatures.map(([feature, starter, growth, pro, enterprise], i) => (
                      <tr key={i} style={{
                        borderBottom: "1px solid #f1f5f9",
                        background: i % 2 === 0 ? "#fafbfc" : "#ffffff",
                      }}>
                        <td style={{ padding: "10px 16px", fontWeight: 600, color: "#334155" }}>{feature}</td>
                        <td style={{ padding: "10px 16px", textAlign: "center", color: starter === "—" ? "#cbd5e1" : "#334155" }}>{starter}</td>
                        <td style={{ padding: "10px 16px", textAlign: "center", color: growth === "—" ? "#cbd5e1" : "#334155" }}>{growth}</td>
                        <td style={{ padding: "10px 16px", textAlign: "center", color: pro === "—" ? "#cbd5e1" : "#6366f1", fontWeight: pro === "—" ? 400 : 600 }}>{pro}</td>
                        <td style={{ padding: "10px 16px", textAlign: "center", color: enterprise === "—" ? "#cbd5e1" : "#334155" }}>{enterprise}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </BlockStack>
          </Card>

          {/* FAQ Section */}
          <Card>
            <BlockStack gap="400">
              <div style={{ padding: "4px 0" }}>
                <Text variant="headingSm" as="h2">Häufig gestellte Fragen</Text>
              </div>
              <Divider />
              <details style={{ padding: "8px 0" }}>
                <summary style={{ fontWeight: 600, cursor: "pointer", color: "#0f172a" }}>Kann ich jederzeit kündigen?</summary>
                <div style={{ padding: "8px 0 0 0", color: "#64748b", fontSize: "14px", lineHeight: "1.6" }}>
                  Ja, du kannst deinen Plan jederzeit kündigen. Es gibt keine Mindestvertragslaufzeit. Bei Kündigung behältst du den Zugang bis zum Ende der Abrechnungsperiode.
                </div>
              </details>
              <details style={{ padding: "8px 0" }}>
                <summary style={{ fontWeight: 600, cursor: "pointer", color: "#0f172a" }}>Was passiert mit meinen Optimierungen wenn ich downgrade?</summary>
                <div style={{ padding: "8px 0 0 0", color: "#64748b", fontSize: "14px", lineHeight: "1.6" }}>
                  Alle bereits durchgeführten Optimierungen bleiben erhalten. Du kannst weiterhin alle Versionen einsehen und bei Bedarf zurücksetzen. Nur neue Optimierungen sind auf den gewählten Plan begrenzt.
                </div>
              </details>
              <details style={{ padding: "8px 0" }}>
                <summary style={{ fontWeight: 600, cursor: "pointer", color: "#0f172a" }}>Gibt es eine kostenlose Testphase?</summary>
                <div style={{ padding: "8px 0 0 0", color: "#64748b", fontSize: "14px", lineHeight: "1.6" }}>
                  Ja! Growth und Pro bieten 7 Tage, Enterprise sogar 14 Tage kostenlose Testphase. Du wirst erst nach Ablauf der Testphase belastet.
                </div>
              </details>
              <details style={{ padding: "8px 0" }}>
                <summary style={{ fontWeight: 600, cursor: "pointer", color: "#0f172a" }}>Was ist der Unterschied zwischen Growth und Pro?</summary>
                <div style={{ padding: "8px 0 0 0", color: "#64748b", fontSize: "14px", lineHeight: "1.6" }}>
                  Growth bietet großzügige tägliche Limits für wachsende Shops. Pro schaltet unbegrenzte Nutzung, Ranking Tracker, Multi-Language und Bulk-Operationen frei — ideal für Shops die maximale Sichtbarkeit anstreben.
                </div>
              </details>
              <details style={{ padding: "8px 0" }}>
                <summary style={{ fontWeight: 600, cursor: "pointer", color: "#0f172a" }}>Was beinhaltet der Enterprise-Plan zusätzlich?</summary>
                <div style={{ padding: "8px 0 0 0", color: "#64748b", fontSize: "14px", lineHeight: "1.6" }}>
                  Enterprise umfasst alles aus Pro plus 16 Sprachen Multi-Language, API-Zugang, dedizierten Account Manager, Custom Onboarding, SLA 99.9%, White-Label Option, benutzerdefinierte Integrationen und Priority Support mit weniger als 1 Stunde Reaktionszeit.
                </div>
              </details>
            </BlockStack>
          </Card>
        </BlockStack>
      </div>

      <style>{`
        @keyframes titan-gradient-border {
          0% { filter: hue-rotate(0deg); }
          100% { filter: hue-rotate(360deg); }
        }
      `}</style>
    </Page>
  );
}
