import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useSearchParams } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  TextField,
  Button,
  Banner,
  Badge,
  Divider,
  Box,
  FormLayout,
  SkeletonBodyText,
  CalloutCard,
  ProgressBar,
  Checkbox,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useState, useEffect, useCallback } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getRedirectUri } from "../services/google/auth.server";
import { getEffectivePlan } from "../middleware/plan-check.server";
import { getAllUsageStats } from "../middleware/usage-limits.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const settings = await prisma.shopSettings.findUnique({ where: { shop } });
  const tokens = await prisma.externalTokens.findUnique({ where: { shop } });

  // Effektiver Plan und Nutzungsdaten
  const currentPlan = await getEffectivePlan(shop, prisma);
  const usageStats = getAllUsageStats(shop, currentPlan);

  // API-Aufrufe gesamt aus UsageTracker
  let totalApiCalls = 0;
  try {
    totalApiCalls = await prisma.usageTracker.count({ where: { shop } });
  } catch (e) {
    // Tabelle existiert möglicherweise noch nicht
  }

  return json({
    shop,
    brandVoice: settings?.brandVoice || "",
    targetAudience: settings?.targetAudience || "",
    noGos: settings?.noGos || "",
    googleConnected: !!(tokens?.gscRefresh),
    lastUpdated: settings?.updatedAt || null,
    googleRedirectUri: getRedirectUri(),
    currentPlan,
    usageStats,
    totalApiCalls,
  });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "save_brand_dna") {
    await prisma.shopSettings.upsert({
      where: { shop: session.shop },
      update: {
        brandVoice: formData.get("brandVoice") || "",
        targetAudience: formData.get("targetAudience") || "",
        noGos: formData.get("noGos") || "",
      },
      create: {
        shop: session.shop,
        brandVoice: formData.get("brandVoice") || "",
        targetAudience: formData.get("targetAudience") || "",
        noGos: formData.get("noGos") || "",
      },
    });
    return json({ success: true, message: "Brand DNA gespeichert!" });
  }

  if (intent === "disconnect_google") {
    await prisma.externalTokens.deleteMany({ where: { shop: session.shop } });
    return json({ success: true, message: "Google wurde getrennt." });
  }

  if (intent === "save_notifications") {
    // Benachrichtigungseinstellungen werden client-seitig verwaltet
    // In Zukunft: In ShopSettings speichern
    return json({ success: true, message: "Benachrichtigungen gespeichert!" });
  }

  return json({ error: "Unbekannte Aktion" });
};

export default function Settings() {
  const data = useLoaderData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const [searchParams] = useSearchParams();

  const [brandVoice, setBrandVoice] = useState(data.brandVoice);
  const [targetAudience, setTargetAudience] = useState(data.targetAudience);
  const [noGos, setNoGos] = useState(data.noGos);

  // Benachrichtigungen
  const [notifyOnLimit, setNotifyOnLimit] = useState(true);
  const [weeklyReport, setWeeklyReport] = useState(false);
  const [featureNotifications, setFeatureNotifications] = useState(true);

  const isSaving = navigation.state === "submitting";

  // Handle Google OAuth callback messages
  useEffect(() => {
    const googleError = searchParams.get("googleError");
    const googleSuccess = searchParams.get("googleSuccess");
    if (googleSuccess) {
      shopify.toast.show("Google erfolgreich verbunden!");
    }
    if (googleError) {
      shopify.toast.show(`Google Fehler: ${googleError}`, { isError: true });
    }
  }, [searchParams]);

  const handleSave = () => {
    const formData = new FormData();
    formData.set("intent", "save_brand_dna");
    formData.set("brandVoice", brandVoice);
    formData.set("targetAudience", targetAudience);
    formData.set("noGos", noGos);
    submit(formData, { method: "post" });
    shopify.toast.show("Brand DNA wird gespeichert...");
  };

  const handleDisconnectGoogle = () => {
    const formData = new FormData();
    formData.set("intent", "disconnect_google");
    submit(formData, { method: "post" });
  };

  return (
    <Page title="Einstellungen" subtitle="Konfiguriere deine Brand DNA und Integrationen" backAction={{ content: "Dashboard", url: "/app" }}>
      <BlockStack gap="600">
        {/* Brand DNA Section */}
        <Layout>
          <Layout.AnnotatedSection
            id="brand-dna"
            title="Brand DNA"
            description="Definiere die DNA deiner Marke. Diese Einstellungen steuern wie die KI deine Produkttexte formuliert. Sie sind das absolute Gesetz für jede Optimierung."
          >
            <Card>
              <BlockStack gap="400">
                <TextField
                  label="Brand Voice"
                  value={brandVoice}
                  onChange={setBrandVoice}
                  multiline={4}
                  helpText="Wie spricht deine Marke? Beschreibe den Tonfall, Stil und die Persönlichkeit. z.B. 'Premium, sachlich, leicht humorvoll, duzt den Kunden'"
                  placeholder="z.B. Premium, sachlich, leicht humorvoll, duzt den Kunden"
                  autoComplete="off"
                />
                <TextField
                  label="Zielgruppe"
                  value={targetAudience}
                  onChange={setTargetAudience}
                  multiline={3}
                  helpText="Wer sind deine Kunden? Alter, Interessen, Kaufmotivation. Je genauer, desto besser."
                  placeholder="z.B. Design-affine Millennials, 25-40 Jahre, urban, qualitätsbewusst"
                  autoComplete="off"
                />
                <TextField
                  label="No-Gos"
                  value={noGos}
                  onChange={setNoGos}
                  multiline={3}
                  helpText="Was darf die KI NIEMALS verwenden? Wörter, Phrasen, Stile die tabu sind."
                  placeholder="z.B. Keine Superlative wie 'bester', keine Emojis, kein 'Sie'"
                  autoComplete="off"
                />
                <InlineStack align="end">
                  <Button variant="primary" onClick={handleSave} loading={isSaving}>
                    Brand DNA speichern
                  </Button>
                </InlineStack>
                {data.lastUpdated && (
                  <Text variant="bodySm" tone="subdued">
                    Zuletzt aktualisiert: {new Date(data.lastUpdated).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </Text>
                )}
              </BlockStack>
            </Card>
          </Layout.AnnotatedSection>
        </Layout>

        {/* Google Integration Section */}
        <Layout>
          <Layout.AnnotatedSection
            id="google"
            title="Google Integration"
            description="Verbinde Google Search Console für ROI-Tracking und Merchant Center für Shopping-Feeds."
          >
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text variant="headingSm" as="h3">Google Search Console</Text>
                    <Text variant="bodySm" tone="subdued">
                      Verfolge Impressionen, Klicks und Rankings deiner optimierten Produkte.
                    </Text>
                  </BlockStack>
                  <Badge tone={data.googleConnected ? "success" : "warning"}>
                    {data.googleConnected ? "Verbunden" : "Nicht verbunden"}
                  </Badge>
                </InlineStack>
                <Divider />
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text variant="headingSm" as="h3">Google Merchant Center</Text>
                    <Text variant="bodySm" tone="subdued">
                      Synchronisiere optimierte Produktdaten mit Google Shopping.
                    </Text>
                  </BlockStack>
                  <Badge tone={data.googleConnected ? "success" : "warning"}>
                    {data.googleConnected ? "Verbunden" : "Nicht verbunden"}
                  </Badge>
                </InlineStack>
                <Divider />
                {data.googleConnected ? (
                  <InlineStack gap="300">
                    <Button tone="critical" variant="plain" onClick={handleDisconnectGoogle}>
                      Google trennen
                    </Button>
                  </InlineStack>
                ) : (
                  <BlockStack gap="300">
                    <Banner tone="info">
                      <p>Verbinde Google, um ROI-Daten deiner Optimierungen zu tracken und Produkte mit dem Merchant Center zu synchronisieren.</p>
                    </Banner>
                    <Banner tone="warning" title="Google Cloud Console einrichten">
                      <BlockStack gap="200">
                        <p>Bevor du Google verbinden kannst, muss die Google Cloud Console konfiguriert sein:</p>
                        <ol style={{ paddingLeft: "20px", margin: "4px 0" }}>
                          <li>Öffne die <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer">Google Cloud Console</a></li>
                          <li>Aktiviere die <strong>Google Search Console API</strong> und <strong>Content API for Shopping</strong></li>
                          <li>Erstelle unter "APIs & Dienste &gt; Anmeldedaten" eine <strong>OAuth 2.0 Client-ID</strong> (Typ: Webanwendung)</li>
                          <li>Trage die folgende URI als <strong>Autorisierte Weiterleitungs-URI</strong> ein:</li>
                        </ol>
                        <Box padding="200" background="bg-surface-secondary" borderRadius="100">
                          <Text variant="bodyMd" as="p" fontWeight="semibold" breakWord>
                            {data.googleRedirectUri}
                          </Text>
                        </Box>
                        <Text variant="bodySm" tone="caution" as="p">
                          Hinweis: Bei jedem Tunnel-Neustart ändert sich die URL. Die Redirect-URI in der Cloud Console muss dann ebenfalls aktualisiert werden.
                        </Text>
                      </BlockStack>
                    </Banner>
                    <Button variant="primary" url="/google/auth">
                      Mit Google verbinden
                    </Button>
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Layout.AnnotatedSection>
        </Layout>

        {/* Aktueller Plan */}
        <Layout>
          <Layout.AnnotatedSection
            id="plan"
            title="Aktueller Plan"
            description="Dein aktiver Titan GEO Plan und Upgrade-Möglichkeiten."
          >
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h3">Dein Plan</Text>
                    <Text variant="bodySm" tone="subdued">
                      Aktuell aktiver Plan für deinen Shop.
                    </Text>
                  </BlockStack>
                  <Badge tone={
                    data.currentPlan === "Admin" ? "info" :
                    data.currentPlan === "Enterprise" ? "success" :
                    data.currentPlan === "Pro" ? "success" :
                    data.currentPlan === "Growth" ? "attention" : "warning"
                  }>
                    {data.currentPlan === "Admin" ? "Admin (Unbegrenzt)" : data.currentPlan}
                  </Badge>
                </InlineStack>
                {data.currentPlan !== "Enterprise" && data.currentPlan !== "Admin" && (
                  <>
                    <Divider />
                    <InlineStack align="end">
                      <Button variant="primary" url="/app/billing">
                        Plan upgraden
                      </Button>
                    </InlineStack>
                  </>
                )}
              </BlockStack>
            </Card>
          </Layout.AnnotatedSection>
        </Layout>

        {/* Verbrauchsübersicht */}
        <Layout>
          <Layout.AnnotatedSection
            id="usage"
            title="Verbrauchsübersicht"
            description="Deine heutige Nutzung und verbleibende Kontingente für jedes Feature."
          >
            <Card>
              <BlockStack gap="500">
                {/* GEO-Optimierungen */}
                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text variant="bodyMd" fontWeight="semibold">GEO-Optimierungen</Text>
                    <Text variant="bodySm" tone="subdued">
                      {data.usageStats.geo_optimization.used} / {data.usageStats.geo_optimization.limit === -1 ? "Unbegrenzt" : data.usageStats.geo_optimization.limit}
                    </Text>
                  </InlineStack>
                  {data.usageStats.geo_optimization.limit !== -1 && (
                    <ProgressBar
                      progress={data.usageStats.geo_optimization.limit > 0
                        ? Math.min(100, (data.usageStats.geo_optimization.used / data.usageStats.geo_optimization.limit) * 100)
                        : 0}
                      tone={data.usageStats.geo_optimization.used >= data.usageStats.geo_optimization.limit ? "critical" : "primary"}
                      size="small"
                    />
                  )}
                </BlockStack>

                <Divider />

                {/* Keyword-Recherchen */}
                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text variant="bodyMd" fontWeight="semibold">Keyword-Recherchen heute</Text>
                    <Text variant="bodySm" tone="subdued">
                      {data.usageStats.keyword_research.used} / {data.usageStats.keyword_research.limit === -1 ? "Unbegrenzt" : data.usageStats.keyword_research.limit}
                    </Text>
                  </InlineStack>
                  {data.usageStats.keyword_research.limit !== -1 && (
                    <ProgressBar
                      progress={data.usageStats.keyword_research.limit > 0
                        ? Math.min(100, (data.usageStats.keyword_research.used / data.usageStats.keyword_research.limit) * 100)
                        : 0}
                      tone={data.usageStats.keyword_research.used >= data.usageStats.keyword_research.limit ? "critical" : "primary"}
                      size="small"
                    />
                  )}
                </BlockStack>

                <Divider />

                {/* Content Audits */}
                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text variant="bodyMd" fontWeight="semibold">Content Audits heute</Text>
                    <Text variant="bodySm" tone="subdued">
                      {data.usageStats.content_audit.used} / {data.usageStats.content_audit.limit === -1 ? "Unbegrenzt" : data.usageStats.content_audit.limit}
                    </Text>
                  </InlineStack>
                  {data.usageStats.content_audit.limit !== -1 && (
                    <ProgressBar
                      progress={data.usageStats.content_audit.limit > 0
                        ? Math.min(100, (data.usageStats.content_audit.used / data.usageStats.content_audit.limit) * 100)
                        : 0}
                      tone={data.usageStats.content_audit.used >= data.usageStats.content_audit.limit ? "critical" : "primary"}
                      size="small"
                    />
                  )}
                </BlockStack>

                <Divider />

                {/* Alt-Texte */}
                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text variant="bodyMd" fontWeight="semibold">Alt-Texte heute</Text>
                    <Text variant="bodySm" tone="subdued">
                      {data.usageStats.alt_text_generation.used} / {data.usageStats.alt_text_generation.limit === -1 ? "Unbegrenzt" : data.usageStats.alt_text_generation.limit}
                    </Text>
                  </InlineStack>
                  {data.usageStats.alt_text_generation.limit !== -1 && (
                    <ProgressBar
                      progress={data.usageStats.alt_text_generation.limit > 0
                        ? Math.min(100, (data.usageStats.alt_text_generation.used / data.usageStats.alt_text_generation.limit) * 100)
                        : 0}
                      tone={data.usageStats.alt_text_generation.used >= data.usageStats.alt_text_generation.limit ? "critical" : "primary"}
                      size="small"
                    />
                  )}
                </BlockStack>

                <Divider />

                {/* API-Aufrufe gesamt */}
                <InlineStack align="space-between">
                  <Text variant="bodyMd" fontWeight="semibold">API-Aufrufe gesamt</Text>
                  <Badge tone="info">{data.totalApiCalls}</Badge>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.AnnotatedSection>
        </Layout>

        {/* Benachrichtigungen */}
        <Layout>
          <Layout.AnnotatedSection
            id="notifications"
            title="Benachrichtigungen"
            description="Lege fest, welche Benachrichtigungen du erhalten möchtest."
          >
            <Card>
              <BlockStack gap="400">
                <Checkbox
                  label="E-Mail bei Limit-Erreichen"
                  helpText="Erhalte eine E-Mail, wenn du dein tägliches Nutzungslimit für ein Feature erreichst."
                  checked={notifyOnLimit}
                  onChange={setNotifyOnLimit}
                />
                <Divider />
                <Checkbox
                  label="Wöchentlicher SEO-Report"
                  helpText="Jeden Montag eine Zusammenfassung deiner SEO-Performance und Optimierungen."
                  checked={weeklyReport}
                  onChange={setWeeklyReport}
                />
                <Divider />
                <Checkbox
                  label="Neue Feature-Benachrichtigungen"
                  helpText="Werde informiert, wenn neue Features und Updates für Titan GEO verfügbar sind."
                  checked={featureNotifications}
                  onChange={setFeatureNotifications}
                />
              </BlockStack>
            </Card>
          </Layout.AnnotatedSection>
        </Layout>

        {/* Subscription Section */}
        <Layout>
          <Layout.AnnotatedSection
            id="subscription"
            title="Abonnement"
            description="Verwalte deinen Titan GEO Plan."
          >
            <CalloutCard
              title="Titan GEO Pro"
              illustration="https://cdn.shopify.com/s/assets/admin/checkout/settings-customizecart-702d57c108542974c89d2beb30ee3ca0.svg"
              primaryAction={{ content: "Plan verwalten", url: "/app/billing" }}
            >
              <p>Unbegrenzte Optimierungen, Priority-Support und erweiterte Analysen für $39.99/Monat.</p>
            </CalloutCard>
          </Layout.AnnotatedSection>
        </Layout>
      </BlockStack>
    </Page>
  );
}
