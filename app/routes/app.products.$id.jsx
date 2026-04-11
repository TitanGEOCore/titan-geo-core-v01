import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  InlineGrid,
  Box,
  Button,
  Tabs,
  Badge,
  Divider,
  Thumbnail,
  Banner,
  Spinner,
  Modal,
  ProgressBar,
  TextField,
  Select,
  Tag,
  FormLayout,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useState, useCallback, useEffect } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { GeoScoreBadge } from "../components/GeoScoreBadge";
import { getUsageStats } from "../services/shopify/mutations.server";

export const loader = async ({ request, params }) => {
  const { admin, session } = await authenticate.admin(request);
  const productId = params.id;
  const shopifyProductId = `gid://shopify/Product/${productId}`;

  // Fetch product from Shopify
  const response = await admin.graphql(
    `#graphql
    query getProduct($id: ID!) {
      product(id: $id) {
        id
        title
        handle
        descriptionHtml
        status
        onlineStoreUrl
        featuredImage {
          url
          altText
        }
        seo {
          title
          description
        }
        metafield_score: metafield(namespace: "custom", key: "geo_score") {
          value
        }
        metafield_data: metafield(namespace: "custom", key: "geo_data") {
          value
        }
      }
    }`,
    { variables: { id: shopifyProductId } }
  );

  const data = await response.json();
  const product = data.data?.product;

  if (!product) {
    throw new Response("Produkt nicht gefunden", { status: 404 });
  }

  // Fetch version history
  const versions = await prisma.contentVersion.findMany({
    where: { shop: session.shop, productId: shopifyProductId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  // Usage stats
  const optimizationCount = await prisma.usageTracker.count({
    where: { shop: session.shop, productId: shopifyProductId },
  });

  // Global usage stats for limit enforcement display
  const usage = await getUsageStats(session.shop);

  return json({
    product: {
      id: productId,
      shopifyId: shopifyProductId,
      title: product.title,
      handle: product.handle,
      descriptionHtml: product.descriptionHtml,
      status: product.status,
      onlineStoreUrl: product.onlineStoreUrl,
      image: product.featuredImage?.url,
      imageAlt: product.featuredImage?.altText,
      seoTitle: product.seo?.title,
      seoDescription: product.seo?.description,
      geoScore: product.metafield_score?.value
        ? Number(product.metafield_score.value)
        : null,
      geoData: product.metafield_data?.value
        ? JSON.parse(product.metafield_data.value)
        : null,
    },
    versions: versions.map((v) => ({
      id: v.id,
      createdAt: v.createdAt,
      previousData: JSON.parse(v.previousData),
      newData: JSON.parse(v.newData),
    })),
    optimizationCount,
    usageUsed: usage.used,
    usageLimit: usage.limit,
    usageRemaining: usage.remaining,
    limitReached: usage.remaining === 0,
    shop: session.shop,
  });
};

export const action = async ({ request, params }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const productId = params.id;
  const shopifyProductId = `gid://shopify/Product/${productId}`;

  if (intent === "rollback") {
    const versionId = formData.get("versionId");
    const version = await prisma.contentVersion.findUnique({
      where: { id: versionId },
    });

    if (!version) {
      return json({ error: "Version nicht gefunden" }, { status: 404 });
    }

    const previousData = JSON.parse(version.previousData);

    // Get current product data for backup before rollback
    const currentProductQuery = await admin.graphql(`
      query getProduct($id: ID!) {
        product(id: $id) {
          id
          title
          descriptionHtml
          seo { title description }
        }
      }
    `, { variables: { id: shopifyProductId } });
    const currentProductData = await currentProductQuery.json();
    const currentProduct = currentProductData.data?.product;

    try {
      // Restore the product with previous data
      const mutation = `#graphql
        mutation productUpdate($input: ProductInput!) {
          productUpdate(input: $input) {
            product { id title }
            userErrors { field message }
          }
        }
      `;

      await admin.graphql(mutation, {
        variables: {
          input: {
            id: shopifyProductId,
            title: previousData.title,
            descriptionHtml: previousData.descriptionHtml,
            seo: {
              title: previousData.seo?.title || previousData.title,
              description: previousData.seo?.description || "",
            },
          },
        },
      });

      // Create a new ContentVersion entry for this rollback
      // Store the current state as previousData for the new rollback entry
      await prisma.contentVersion.create({
        data: {
          shop: session.shop,
          productId: shopifyProductId,
          previousData: JSON.stringify({
            title: currentProduct?.title,
            descriptionHtml: currentProduct?.descriptionHtml,
            seo: currentProduct?.seo,
          }),
          newData: JSON.stringify({
            title: previousData.title,
            descriptionHtml: previousData.descriptionHtml,
            seo: previousData.seo,
            rollbackedFrom: versionId,
          }),
        },
      });

      return json({
        success: true,
        message:
          "Rollback erfolgreich! Produkt wurde auf vorherige Version zurückgesetzt.",
      });
    } catch (err) {
      return json(
        { error: `Rollback fehlgeschlagen: ${err.message}` },
        { status: 500 }
      );
    }
  }

  return json({ error: "Unbekannte Aktion" }, { status: 400 });
};

export default function ProductDetail() {
  const {
    product,
    versions,
    optimizationCount,
    usageUsed,
    usageLimit,
    usageRemaining,
    limitReached,
  } = useLoaderData();
  const [selectedTab, setSelectedTab] = useState(0);
  const [rollbackModalActive, setRollbackModalActive] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [quizActive, setQuizActive] = useState(false);
  const [quizStep, setQuizStep] = useState(0);
  const [quizData, setQuizData] = useState({
    description: "",
    usp: "",
    audience: "",
    vibe: "",
    keywords: "",
  });
  const [selectedVibes, setSelectedVibes] = useState([]);
  const auditFetcher = useFetcher();
  const optimizeFetcher = useFetcher();
  const rollbackFetcher = useFetcher();
  const navigate = useNavigate();
  const shopify = useAppBridge();

  const isAuditing = auditFetcher.state !== "idle";
  const isOptimizing = optimizeFetcher.state !== "idle";

  useEffect(() => {
    if (optimizeFetcher.data?.success) {
      shopify.toast.show("Optimierung erfolgreich deployed!");
      setQuizActive(false);
      setQuizStep(0);
    }
    if (optimizeFetcher.data?.status === "NEEDS_CONTEXT") {
      // Open the Product Context Builder quiz
      setQuizActive(true);
      setQuizStep(0);
    }
    if (optimizeFetcher.data?.error && optimizeFetcher.data?.status !== "NEEDS_CONTEXT") {
      shopify.toast.show(optimizeFetcher.data.error, { isError: true });
    }
    if (optimizeFetcher.data?.requiresUpgrade) {
      shopify.toast.show(
        "Free-Tier Limit erreicht. Bitte upgrade auf Titan GEO Pro.",
        { isError: true }
      );
    }
  }, [optimizeFetcher.data]);

  useEffect(() => {
    if (rollbackFetcher.data?.success) {
      shopify.toast.show("Rollback erfolgreich!");
      setRollbackModalActive(false);
    }
  }, [rollbackFetcher.data]);

  const tabs = [
    { id: "overview", content: "\u00dcbersicht" },
    { id: "before-after", content: "Vorher / Nachher" },
    { id: "history", content: `Verlauf (${versions.length})` },
    { id: "jsonld", content: "JSON-LD" },
    { id: "seo", content: "SEO Analyse" },
  ];

  const handleTabChange = useCallback((index) => setSelectedTab(index), []);

  const handleAudit = () => {
    auditFetcher.submit(
      { productId: product.shopifyId },
      { method: "post", action: "/app/api/audit" }
    );
  };

  const handleOptimize = () => {
    optimizeFetcher.submit(
      { productId: product.shopifyId },
      { method: "post", action: "/app/api/optimize" }
    );
  };

  const handleQuizSubmit = () => {
    const manualContextPayload = JSON.stringify({
      description: quizData.description,
      usp: quizData.usp,
      audience: quizData.audience,
      vibe: selectedVibes.join(", "),
      keywords: quizData.keywords,
    });
    optimizeFetcher.submit(
      { productId: product.shopifyId, manualContext: manualContextPayload },
      { method: "post", action: "/app/api/optimize" }
    );
  };

  const VIBE_OPTIONS = [
    "Luxuri\u00f6s", "Premium", "Hochwertig", "Minimalistisch",
    "Praktisch", "Robust", "Nachhaltig", "Eco-Friendly",
    "Verspielt", "Modern", "Klassisch", "Innovativ",
    "G\u00fcnstig", "Preis-Leistung", "Professionell", "Handgemacht",
  ];

  const AUDIENCE_OPTIONS = [
    { label: "-- Zielgruppe w\u00e4hlen --", value: "" },
    { label: "Frauen 18-35", value: "Frauen 18-35" },
    { label: "Frauen 35-55", value: "Frauen 35-55" },
    { label: "M\u00e4nner 18-35", value: "M\u00e4nner 18-35" },
    { label: "M\u00e4nner 35-55", value: "M\u00e4nner 35-55" },
    { label: "Eltern & Familien", value: "Eltern & Familien" },
    { label: "Teenager & Gen Z", value: "Teenager & Gen Z" },
    { label: "Senioren 55+", value: "Senioren 55+" },
    { label: "B2B / Unternehmen", value: "B2B / Unternehmen" },
    { label: "Fitness & Sport", value: "Fitness & Sport" },
    { label: "Technik-Enthusiasten", value: "Technik-Enthusiasten" },
    { label: "Luxus-K\u00e4ufer", value: "Luxus-K\u00e4ufer" },
    { label: "Alle / Allgemein", value: "Alle / Allgemein" },
  ];

  const quizSteps = [
    { title: "Was ist dieses Produkt?", subtitle: "Beschreibe es in 1-2 S\u00e4tzen" },
    { title: "USP & Features", subtitle: "Was macht es besonders?" },
    { title: "Zielgruppe & Vibe", subtitle: "Wer kauft das und wie soll es wirken?" },
  ];

  const quizProgress = ((quizStep + 1) / quizSteps.length) * 100;
  const canProceed = quizStep === 0 ? quizData.description.length > 10
    : quizStep === 1 ? quizData.usp.length > 5
    : selectedVibes.length > 0;

  const latestVersion = versions[0];

  return (
    <Page
      backAction={{ content: "Produkte", url: "/app/products" }}
      title={product.title}
      titleMetadata={<GeoScoreBadge score={product.geoScore} />}
      primaryAction={{
        content: limitReached
          ? "Limit erreicht"
          : isOptimizing
            ? "Wird optimiert..."
            : "Optimieren & Deploy",
        onAction: handleOptimize,
        loading: isOptimizing,
        disabled: isOptimizing || isAuditing || limitReached,
      }}
      secondaryActions={[
        {
          content: isAuditing ? "Wird analysiert..." : "GEO Audit",
          onAction: handleAudit,
          loading: isAuditing,
          disabled: isAuditing || isOptimizing,
        },
        ...(product.onlineStoreUrl
          ? [
              {
                content: "Im Store ansehen",
                url: product.onlineStoreUrl,
                external: true,
              },
            ]
          : []),
      ]}
    >
      <BlockStack gap="600">
        {/* Usage Limit Banner */}
        {limitReached && (
          <Banner
            title="Free-Tier Limit erreicht"
            tone="warning"
            action={{ content: "Auf Pro upgraden", url: "/app/billing" }}
          >
            <p>
              Du hast alle {usageLimit} kostenlosen Optimierungen aufgebraucht.
              Upgrade auf Titan GEO Pro f\u00fcr unbegrenzte Optimierungen.
            </p>
          </Banner>
        )}

        {/* Audit Result Banner */}
        {auditFetcher.data?.geoScore !== undefined && (
          <Banner
            title={`GEO Score: ${auditFetcher.data.geoScore}/100`}
            tone={auditFetcher.data.geoScore >= 70 ? "success" : auditFetcher.data.geoScore >= 40 ? "warning" : "critical"}
          >
            <p>
              {auditFetcher.data.assessment || "Analyse abgeschlossen."}
            </p>
          </Banner>
        )}

        {auditFetcher.data?.error && (
          <Banner title="Fehler bei der Analyse" tone="critical">
            <p>{auditFetcher.data.error}</p>
          </Banner>
        )}

        {optimizeFetcher.data?.error && (
          <Banner title="Fehler bei der Optimierung" tone="critical">
            <p>{optimizeFetcher.data.error}</p>
          </Banner>
        )}

        {/* Product Info Header */}
        <div className="titan-card-premium">
          <div style={{ padding: "20px 24px" }}>
            <InlineStack gap="500" blockAlign="start" wrap={false}>
              <div style={{ position: "relative", flexShrink: 0 }}>
                {product.image ? (
                  <Thumbnail
                    source={product.image}
                    alt={product.imageAlt || product.title}
                    size="large"
                  />
                ) : (
                  <Thumbnail source="" alt="" size="large" />
                )}
                {/* Score overlay badge — monochrome */}
                {product.geoScore !== null && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: "-6px",
                      right: "-6px",
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                      background:
                        product.geoScore >= 70
                          ? "var(--titan-success, #18181b)"
                          : product.geoScore >= 40
                            ? "var(--titan-warning, #3f3f46)"
                            : "var(--titan-danger, #a1a1aa)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#ffffff",
                      fontSize: "12px",
                      fontWeight: "bold",
                      border: "2px solid #ffffff",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                    }}
                  >
                    {product.geoScore}
                  </div>
                )}
              </div>
              <BlockStack gap="200" inlineAlign="start">
                <InlineStack gap="200" blockAlign="center">
                  <Text variant="headingMd" as="h2">
                    {product.title}
                  </Text>
                  <Badge
                    tone={product.status === "ACTIVE" ? "success" : "info"}
                  >
                    {product.status === "ACTIVE" ? "Aktiv" : product.status}
                  </Badge>
                </InlineStack>
                <Text variant="bodySm" as="p" tone="subdued">
                  Handle: /{product.handle}
                </Text>
                <InlineStack gap="400">
                  <InlineStack gap="200" blockAlign="center">
                    <Text variant="bodySm" as="span">GEO Score:</Text>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "2px 8px",
                        borderRadius: "12px",
                        background:
                          product.geoScore !== null
                            ? product.geoScore >= 70
                              ? "rgba(9, 9, 11, 0.08)"
                              : product.geoScore >= 40
                                ? "rgba(63, 63, 70, 0.08)"
                                : "rgba(161, 161, 170, 0.12)"
                            : "rgba(161, 161, 170, 0.1)",
                        fontSize: "13px",
                        fontWeight: "600",
                        color:
                          product.geoScore !== null
                            ? product.geoScore >= 70
                              ? "var(--titan-success, #09090b)"
                              : product.geoScore >= 40
                                ? "var(--titan-warning, #3f3f46)"
                                : "var(--titan-danger, #a1a1aa)"
                            : "#a1a1aa",
                      }}
                    >
                      {product.geoScore !== null
                        ? `${product.geoScore}/100`
                        : "Nicht bewertet"}
                    </div>
                  </InlineStack>
                  <Text variant="bodySm" as="p">
                    Optimierungen:{" "}
                    <Text as="span" fontWeight="semibold">
                      {optimizationCount}x
                    </Text>
                  </Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Kontingent: {usageUsed}/{usageLimit}
                  </Text>
                </InlineStack>
                {usageRemaining <= 2 && usageRemaining > 0 && (
                  <Text variant="bodySm" as="p" tone="caution">
                    Noch {usageRemaining} kostenlose Optimierung{usageRemaining === 1 ? "" : "en"} verbleibend
                  </Text>
                )}
              </BlockStack>
            </InlineStack>
          </div>
        </div>

        {/* Tabs */}
        <Card padding="0">
          <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange}>
            <Box padding="400">
              {/* Overview Tab */}
              {selectedTab === 0 && (
                <BlockStack gap="400">
                  <Text variant="headingSm" as="h3">
                    Aktueller SEO Status
                  </Text>
                  <InlineGrid columns={2} gap="400">
                    <Card>
                      <BlockStack gap="200">
                        <Text variant="bodySm" as="p" tone="subdued">
                          SEO Titel
                        </Text>
                        <Text variant="bodyMd" as="p">
                          {product.seoTitle || product.title}
                        </Text>
                        <Text variant="bodySm" as="p" tone="subdued">
                          {(product.seoTitle || product.title).length} Zeichen
                          {(product.seoTitle || product.title).length > 60
                            ? " -- zu lang"
                            : " -- OK"}
                        </Text>
                      </BlockStack>
                    </Card>
                    <Card>
                      <BlockStack gap="200">
                        <Text variant="bodySm" as="p" tone="subdued">
                          Meta Description
                        </Text>
                        <Text variant="bodyMd" as="p">
                          {product.seoDescription || "Nicht gesetzt"}
                        </Text>
                        <Text variant="bodySm" as="p" tone="subdued">
                          {(product.seoDescription || "").length} Zeichen
                          {(product.seoDescription || "").length > 160
                            ? " -- zu lang"
                            : (product.seoDescription || "").length < 50
                              ? " -- zu kurz"
                              : " -- OK"}
                        </Text>
                      </BlockStack>
                    </Card>
                  </InlineGrid>

                  <Text variant="headingSm" as="h3">
                    Produktbeschreibung
                  </Text>
                  <Card>
                    <div
                      style={{ maxHeight: "300px", overflow: "auto" }}
                      dangerouslySetInnerHTML={{
                        __html:
                          product.descriptionHtml ||
                          "<p>Keine Beschreibung</p>",
                      }}
                    />
                  </Card>
                </BlockStack>
              )}

              {/* Before/After Tab */}
              {selectedTab === 1 && (
                <BlockStack gap="400">
                  {latestVersion ? (
                    <>
                      <Text variant="bodySm" as="p" tone="subdued">
                        Letzte Optimierung:{" "}
                        {new Date(latestVersion.createdAt).toLocaleDateString(
                          "de-DE",
                          {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          }
                        )}
                      </Text>

                      {/* Title Comparison */}
                      <Text variant="headingSm" as="h3">
                        Titel
                      </Text>
                      <InlineGrid columns={2} gap="400">
                        <div
                          style={{
                            background: "#f4f4f5",
                            padding: "16px",
                            borderRadius: "8px",
                            border: "1px solid #e4e4e7",
                          }}
                        >
                          <BlockStack gap="100">
                            <Text
                              variant="bodySm"
                              tone="subdued"
                              fontWeight="semibold"
                            >
                              Vorher
                            </Text>
                            <Divider />
                            <Text>
                              {latestVersion.previousData.title || "---"}
                            </Text>
                          </BlockStack>
                        </div>
                        <div
                          style={{
                            background: "#fafafa",
                            padding: "16px",
                            borderRadius: "8px",
                            border: "1px solid #18181b",
                          }}
                        >
                          <BlockStack gap="100">
                            <Text
                              variant="bodySm"
                              fontWeight="semibold"
                              as="span"
                            >
                              <span style={{ color: "#09090b" }}>Nachher</span>
                            </Text>
                            <Divider />
                            <Text>
                              {latestVersion.newData.optimizedTitle || "---"}
                            </Text>
                          </BlockStack>
                        </div>
                      </InlineGrid>

                      {/* Meta Description Comparison */}
                      <Text variant="headingSm" as="h3">
                        Meta Description
                      </Text>
                      <InlineGrid columns={2} gap="400">
                        <div
                          style={{
                            background: "#f4f4f5",
                            padding: "16px",
                            borderRadius: "8px",
                            border: "1px solid #e4e4e7",
                          }}
                        >
                          <BlockStack gap="100">
                            <Text
                              variant="bodySm"
                              tone="subdued"
                              fontWeight="semibold"
                            >
                              Vorher
                            </Text>
                            <Divider />
                            <Text>
                              {latestVersion.previousData.seo?.description ||
                                "---"}
                            </Text>
                          </BlockStack>
                        </div>
                        <div
                          style={{
                            background: "#fafafa",
                            padding: "16px",
                            borderRadius: "8px",
                            border: "1px solid #18181b",
                          }}
                        >
                          <BlockStack gap="100">
                            <Text
                              variant="bodySm"
                              fontWeight="semibold"
                              as="span"
                            >
                              <span style={{ color: "#09090b" }}>Nachher</span>
                            </Text>
                            <Divider />
                            <Text>
                              {latestVersion.newData.optimizedMetaDesc || "---"}
                            </Text>
                          </BlockStack>
                        </div>
                      </InlineGrid>

                      {/* Body Comparison */}
                      <Text variant="headingSm" as="h3">
                        Beschreibung
                      </Text>
                      <InlineGrid columns={2} gap="400">
                        <div
                          style={{
                            background: "#f4f4f5",
                            padding: "16px",
                            borderRadius: "8px",
                            border: "1px solid #e4e4e7",
                            minHeight: "200px",
                          }}
                        >
                          <BlockStack gap="100">
                            <Text
                              variant="bodySm"
                              tone="subdued"
                              fontWeight="semibold"
                            >
                              Vorher
                            </Text>
                            <Divider />
                            <div
                              style={{ maxHeight: "300px", overflow: "auto" }}
                              dangerouslySetInnerHTML={{
                                __html:
                                  latestVersion.previousData.descriptionHtml ||
                                  "---",
                              }}
                            />
                          </BlockStack>
                        </div>
                        <div
                          style={{
                            background: "#fafafa",
                            padding: "16px",
                            borderRadius: "8px",
                            border: "1px solid #18181b",
                            minHeight: "200px",
                          }}
                        >
                          <BlockStack gap="100">
                            <Text
                              variant="bodySm"
                              fontWeight="semibold"
                              as="span"
                            >
                              <span style={{ color: "#09090b" }}>Nachher</span>
                            </Text>
                            <Divider />
                            <div
                              style={{ maxHeight: "300px", overflow: "auto" }}
                              dangerouslySetInnerHTML={{
                                __html:
                                  latestVersion.newData.optimizedHtmlBody ||
                                  "---",
                              }}
                            />
                          </BlockStack>
                        </div>
                      </InlineGrid>
                    </>
                  ) : (
                    <Box padding="800">
                      <BlockStack gap="300" inlineAlign="center">
                        <Text
                          variant="headingSm"
                          as="p"
                          alignment="center"
                        >
                          Noch kein Vergleich verf\u00fcgbar
                        </Text>
                        <Text
                          variant="bodyMd"
                          as="p"
                          tone="subdued"
                          alignment="center"
                        >
                          Optimiere dieses Produkt, um den
                          Vorher/Nachher-Vergleich zu sehen.
                        </Text>
                        <Button variant="primary" onClick={handleOptimize}>
                          Jetzt optimieren
                        </Button>
                      </BlockStack>
                    </Box>
                  )}
                </BlockStack>
              )}

              {/* History Tab */}
              {selectedTab === 2 && (
                <BlockStack gap="400">
                  {versions.length > 0 ? (
                    versions.map((version, index) => (
                      <Card key={version.id}>
                        <InlineStack
                          align="space-between"
                          blockAlign="center"
                        >
                          <BlockStack gap="100">
                            <InlineStack gap="200" blockAlign="center">
                              <Badge>{`Version ${versions.length - index}`}</Badge>
                              <Text variant="bodyMd" as="p">
                                {new Date(
                                  version.createdAt
                                ).toLocaleDateString("de-DE", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </Text>
                            </InlineStack>
                            <Text variant="bodySm" as="p" tone="subdued">
                              Titel: "
                              {version.newData.optimizedTitle || "Unver\u00e4ndert"}"
                            </Text>
                          </BlockStack>
                          {index > 0 && (
                            <Button
                              variant="plain"
                              tone="critical"
                              onClick={() => {
                                setSelectedVersion(version);
                                setRollbackModalActive(true);
                              }}
                            >
                              Zur\u00fccksetzen
                            </Button>
                          )}
                          {index === 0 && <Badge tone="info">Aktuell</Badge>}
                        </InlineStack>
                      </Card>
                    ))
                  ) : (
                    <Box padding="800">
                      <Text
                        variant="bodyMd"
                        as="p"
                        tone="subdued"
                        alignment="center"
                      >
                        Noch keine Versionen vorhanden.
                      </Text>
                    </Box>
                  )}
                </BlockStack>
              )}

              {/* JSON-LD Tab — monochrome code block */}
              {selectedTab === 3 && (
                <BlockStack gap="400">
                  <Text variant="headingSm" as="h3">
                    Strukturierte Daten (JSON-LD)
                  </Text>
                  {product.geoData ? (
                    <Card>
                      <pre
                        style={{
                          background: "#09090b",
                          color: "#d4d4d8",
                          padding: "16px",
                          borderRadius: "8px",
                          overflow: "auto",
                          maxHeight: "500px",
                          fontSize: "13px",
                          lineHeight: "1.5",
                        }}
                      >
                        {JSON.stringify(product.geoData, null, 2)}
                      </pre>
                    </Card>
                  ) : (
                    <Banner tone="info">
                      <p>
                        Noch keine JSON-LD Daten. Optimiere das Produkt, um
                        strukturierte Daten zu generieren.
                      </p>
                    </Banner>
                  )}
                </BlockStack>
              )}

              {/* SEO Analysis Tab */}
              {selectedTab === 4 && (
                <BlockStack gap="400">
                  <Text variant="headingSm" as="h3">
                    SEO Analyse
                  </Text>
                  <InlineGrid columns={2} gap="400">
                    <Card>
                      <BlockStack gap="200">
                        <Text variant="headingSm" as="h4">
                          Titel
                        </Text>
                        <Divider />
                        <InlineStack align="space-between">
                          <Text variant="bodySm">L\u00e4nge</Text>
                          <Badge
                            tone={
                              (product.seoTitle || product.title).length <= 60
                                ? "success"
                                : "warning"
                            }
                          >
                            {(product.seoTitle || product.title).length} / 60
                          </Badge>
                        </InlineStack>
                        <InlineStack align="space-between">
                          <Text variant="bodySm">Vorhanden</Text>
                          <Badge
                            tone={product.seoTitle ? "success" : "warning"}
                          >
                            {product.seoTitle ? "Ja" : "Nutzt Produkttitel"}
                          </Badge>
                        </InlineStack>
                      </BlockStack>
                    </Card>
                    <Card>
                      <BlockStack gap="200">
                        <Text variant="headingSm" as="h4">
                          Meta Description
                        </Text>
                        <Divider />
                        <InlineStack align="space-between">
                          <Text variant="bodySm">L\u00e4nge</Text>
                          <Badge
                            tone={
                              (product.seoDescription || "").length >= 50 &&
                              (product.seoDescription || "").length <= 160
                                ? "success"
                                : "warning"
                            }
                          >
                            {(product.seoDescription || "").length} / 160
                          </Badge>
                        </InlineStack>
                        <InlineStack align="space-between">
                          <Text variant="bodySm">Vorhanden</Text>
                          <Badge
                            tone={
                              product.seoDescription ? "success" : "critical"
                            }
                          >
                            {product.seoDescription ? "Ja" : "Fehlt!"}
                          </Badge>
                        </InlineStack>
                      </BlockStack>
                    </Card>
                    <Card>
                      <BlockStack gap="200">
                        <Text variant="headingSm" as="h4">
                          Strukturierte Daten
                        </Text>
                        <Divider />
                        <InlineStack align="space-between">
                          <Text variant="bodySm">JSON-LD</Text>
                          <Badge
                            tone={product.geoData ? "success" : "critical"}
                          >
                            {product.geoData ? "Vorhanden" : "Fehlt"}
                          </Badge>
                        </InlineStack>
                        <InlineStack align="space-between">
                          <Text variant="bodySm">GEO Score</Text>
                          <Badge
                            tone={
                              product.geoScore >= 70
                                ? "success"
                                : product.geoScore >= 40
                                  ? "warning"
                                  : "critical"
                            }
                          >
                            {product.geoScore !== null
                              ? `${product.geoScore}/100`
                              : "Nicht bewertet"}
                          </Badge>
                        </InlineStack>
                      </BlockStack>
                    </Card>
                    <Card>
                      <BlockStack gap="200">
                        <Text variant="headingSm" as="h4">
                          Beschreibung
                        </Text>
                        <Divider />
                        <InlineStack align="space-between">
                          <Text variant="bodySm">HTML-Inhalt</Text>
                          <Badge
                            tone={
                              product.descriptionHtml ? "success" : "critical"
                            }
                          >
                            {product.descriptionHtml ? "Vorhanden" : "Fehlt"}
                          </Badge>
                        </InlineStack>
                        <InlineStack align="space-between">
                          <Text variant="bodySm">Wortanzahl</Text>
                          <Badge
                            tone={
                              (product.descriptionHtml || "")
                                .replace(/<[^>]*>/g, "")
                                .split(/\s+/)
                                .filter(Boolean).length > 100
                                ? "success"
                                : "warning"
                            }
                          >
                            ~
                            {
                              (product.descriptionHtml || "")
                                .replace(/<[^>]*>/g, "")
                                .split(/\s+/)
                                .filter(Boolean).length
                            }{" "}
                            W\u00f6rter
                          </Badge>
                        </InlineStack>
                      </BlockStack>
                    </Card>
                  </InlineGrid>
                </BlockStack>
              )}
            </Box>
          </Tabs>
        </Card>
      </BlockStack>

      {/* Rollback Modal */}
      {rollbackModalActive && selectedVersion && (
        <Modal
          open={rollbackModalActive}
          onClose={() => setRollbackModalActive(false)}
          title="Auf vorherige Version zur\u00fccksetzen?"
          primaryAction={{
            content: "Zur\u00fccksetzen",
            destructive: true,
            onAction: () => {
              rollbackFetcher.submit(
                { intent: "rollback", versionId: selectedVersion.id },
                { method: "post" }
              );
            },
            loading: rollbackFetcher.state !== "idle",
          }}
          secondaryActions={[
            {
              content: "Abbrechen",
              onAction: () => setRollbackModalActive(false),
            },
          ]}
        >
          <Modal.Section>
            <Text>
              Das Produkt wird auf den Stand von{" "}
              {new Date(selectedVersion.createdAt).toLocaleDateString("de-DE", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              zur\u00fcckgesetzt. Dieser Vorgang kann nicht r\u00fcckg\u00e4ngig gemacht werden.
            </Text>
          </Modal.Section>
        </Modal>
      )}

      {/* Product Context Builder Quiz — monochrome treatment */}
      <Modal
        open={quizActive}
        onClose={() => setQuizActive(false)}
        title="Product Context Builder"
        large
        primaryAction={
          quizStep < quizSteps.length - 1
            ? { content: "Weiter \u2192", onAction: () => setQuizStep(s => s + 1), disabled: !canProceed }
            : { content: isOptimizing ? "KI optimiert..." : "Optimierung starten", onAction: handleQuizSubmit, loading: isOptimizing, disabled: !canProceed }
        }
        secondaryActions={[
          ...(quizStep > 0 ? [{ content: "\u2190 Zur\u00fcck", onAction: () => setQuizStep(s => s - 1) }] : []),
          { content: "Abbrechen", onAction: () => setQuizActive(false) },
        ]}
      >
        <Modal.Section>
          <div style={{ background: "#f4f4f5", margin: "-16px", padding: "16px" }}>
            <BlockStack gap="400">
              {/* Progress — monochrome step indicators */}
              <div>
                <InlineStack align="space-between">
                  <Text variant="bodySm" tone="subdued">Schritt {quizStep + 1} von {quizSteps.length}</Text>
                  <Text variant="bodySm" tone="subdued">{Math.round(quizProgress)}%</Text>
                </InlineStack>
                <div style={{ marginTop: "8px" }}>
                  <div style={{
                    width: "100%",
                    height: "4px",
                    background: "#e4e4e7",
                    borderRadius: "2px",
                    overflow: "hidden",
                  }}>
                    <div style={{
                      width: `${quizProgress}%`,
                      height: "100%",
                      background: "#18181b",
                      borderRadius: "2px",
                      transition: "width 0.3s ease",
                    }} />
                  </div>
                </div>
                {/* Step dots */}
                <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "12px" }}>
                  {quizSteps.map((_, i) => (
                    <div
                      key={i}
                      style={{
                        width: i <= quizStep ? "24px" : "8px",
                        height: "8px",
                        borderRadius: "4px",
                        background: i <= quizStep ? "#09090b" : "#d4d4d8",
                        transition: "all 0.3s ease",
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Step Header */}
              <BlockStack gap="100">
                <Text variant="headingLg" as="h2">{quizSteps[quizStep]?.title}</Text>
                <Text variant="bodyMd" tone="subdued">{quizSteps[quizStep]?.subtitle}</Text>
              </BlockStack>

              <Divider />

              {/* Step 0: Product Description */}
              {quizStep === 0 && (
                <div style={{ background: "#ffffff", padding: "16px", borderRadius: "8px", border: "1px solid #e4e4e7" }}>
                  <BlockStack gap="400">
                    <Banner tone="info">
                      <p>Dieses Produkt hat zu wenig Kontext f\u00fcr die KI. Hilf uns mit ein paar kurzen Angaben — die KI erstellt daraus professionellen Content.</p>
                    </Banner>
                    <TextField
                      label="Was ist dieses Produkt?"
                      placeholder="z.B. Ein handgefertigter Lederg\u00fcrtel aus italienischem Vollnarbenleder mit Messingschnalle"
                      value={quizData.description}
                      onChange={(v) => setQuizData(d => ({ ...d, description: v }))}
                      multiline={3}
                      autoComplete="off"
                      helpText={`${quizData.description.length} Zeichen — mindestens 10 ben\u00f6tigt`}
                    />
                    <TextField
                      label="Wichtige Keywords (optional)"
                      placeholder="z.B. Lederg\u00fcrtel, Herreng\u00fcrtel, handgemacht, italienisches Leder"
                      value={quizData.keywords}
                      onChange={(v) => setQuizData(d => ({ ...d, keywords: v }))}
                      autoComplete="off"
                      helpText="Kommagetrennte Suchbegriffe, die Kunden verwenden w\u00fcrden"
                    />
                  </BlockStack>
                </div>
              )}

              {/* Step 1: USP & Features */}
              {quizStep === 1 && (
                <div style={{ background: "#ffffff", padding: "16px", borderRadius: "8px", border: "1px solid #e4e4e7" }}>
                  <BlockStack gap="400">
                    <TextField
                      label="USP — Was macht dieses Produkt besonders?"
                      placeholder="z.B. Handgen\u00e4ht in einer Manufaktur in der Toskana. 5mm dick. H\u00e4lt ein Leben lang. Patiniert mit der Zeit."
                      value={quizData.usp}
                      onChange={(v) => setQuizData(d => ({ ...d, usp: v }))}
                      multiline={4}
                      autoComplete="off"
                      helpText="Material, Qualit\u00e4t, Besonderheiten, Vorteile gegen\u00fcber der Konkurrenz"
                    />
                  </BlockStack>
                </div>
              )}

              {/* Step 2: Audience & Vibe — monochrome vibe buttons */}
              {quizStep === 2 && (
                <div style={{ background: "#ffffff", padding: "16px", borderRadius: "8px", border: "1px solid #e4e4e7" }}>
                  <BlockStack gap="400">
                    <Select
                      label="Prim\u00e4re Zielgruppe"
                      options={AUDIENCE_OPTIONS}
                      value={quizData.audience}
                      onChange={(v) => setQuizData(d => ({ ...d, audience: v }))}
                    />
                    <BlockStack gap="200">
                      <Text variant="bodyMd" fontWeight="semibold">Wie soll das Produkt wirken? (w\u00e4hle 1-4)</Text>
                      <InlineStack gap="200" wrap>
                        {VIBE_OPTIONS.map((vibe) => {
                          const isSelected = selectedVibes.includes(vibe);
                          return (
                            <button
                              key={vibe}
                              type="button"
                              onClick={() => {
                                setSelectedVibes(prev =>
                                  isSelected
                                    ? prev.filter(v => v !== vibe)
                                    : prev.length < 4 ? [...prev, vibe] : prev
                                );
                              }}
                              style={{
                                padding: "8px 16px",
                                borderRadius: "20px",
                                border: isSelected ? "2px solid #09090b" : "1px solid #e4e4e7",
                                background: isSelected ? "#09090b" : "#ffffff",
                                color: isSelected ? "#ffffff" : "#3f3f46",
                                fontSize: "14px",
                                fontWeight: isSelected ? 600 : 400,
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                              }}
                            >
                              {isSelected && "\u2713 "}{vibe}
                            </button>
                          );
                        })}
                      </InlineStack>
                      {selectedVibes.length > 0 && (
                        <InlineStack gap="100">
                          <Text variant="bodySm" tone="subdued">Gew\u00e4hlt:</Text>
                          {selectedVibes.map(v => <Tag key={v} onRemove={() => setSelectedVibes(prev => prev.filter(x => x !== v))}>{v}</Tag>)}
                        </InlineStack>
                      )}
                    </BlockStack>
                  </BlockStack>
                </div>
              )}
            </BlockStack>
          </div>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
