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
    }
    if (optimizeFetcher.data?.error) {
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
    { id: "overview", content: "Übersicht" },
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
              Upgrade auf Titan GEO Pro für unbegrenzte Optimierungen.
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
                {/* Score overlay badge */}
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
                          ? "var(--titan-success, #10b981)"
                          : product.geoScore >= 40
                            ? "var(--titan-warning, #f59e0b)"
                            : "var(--titan-danger, #ef4444)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "white",
                      fontSize: "12px",
                      fontWeight: "bold",
                      border: "2px solid white",
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
                              ? "rgba(16, 185, 129, 0.1)"
                              : product.geoScore >= 40
                                ? "rgba(245, 158, 11, 0.1)"
                                : "rgba(239, 68, 68, 0.1)"
                            : "rgba(148, 163, 184, 0.1)",
                        fontSize: "13px",
                        fontWeight: "600",
                        color:
                          product.geoScore !== null
                            ? product.geoScore >= 70
                              ? "var(--titan-success, #10b981)"
                              : product.geoScore >= 40
                                ? "var(--titan-warning, #f59e0b)"
                                : "var(--titan-danger, #ef4444)"
                            : "#94a3b8",
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
                        <Box
                          background="bg-surface-secondary"
                          padding="400"
                          borderRadius="200"
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
                        </Box>
                        <Box
                          background="bg-surface-success"
                          padding="400"
                          borderRadius="200"
                        >
                          <BlockStack gap="100">
                            <Text
                              variant="bodySm"
                              tone="success"
                              fontWeight="semibold"
                            >
                              Nachher
                            </Text>
                            <Divider />
                            <Text>
                              {latestVersion.newData.optimizedTitle || "---"}
                            </Text>
                          </BlockStack>
                        </Box>
                      </InlineGrid>

                      {/* Meta Description Comparison */}
                      <Text variant="headingSm" as="h3">
                        Meta Description
                      </Text>
                      <InlineGrid columns={2} gap="400">
                        <Box
                          background="bg-surface-secondary"
                          padding="400"
                          borderRadius="200"
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
                        </Box>
                        <Box
                          background="bg-surface-success"
                          padding="400"
                          borderRadius="200"
                        >
                          <BlockStack gap="100">
                            <Text
                              variant="bodySm"
                              tone="success"
                              fontWeight="semibold"
                            >
                              Nachher
                            </Text>
                            <Divider />
                            <Text>
                              {latestVersion.newData.optimizedMetaDesc || "---"}
                            </Text>
                          </BlockStack>
                        </Box>
                      </InlineGrid>

                      {/* Body Comparison */}
                      <Text variant="headingSm" as="h3">
                        Beschreibung
                      </Text>
                      <InlineGrid columns={2} gap="400">
                        <Box
                          background="bg-surface-secondary"
                          padding="400"
                          borderRadius="200"
                          minHeight="200px"
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
                        </Box>
                        <Box
                          background="bg-surface-success"
                          padding="400"
                          borderRadius="200"
                          minHeight="200px"
                        >
                          <BlockStack gap="100">
                            <Text
                              variant="bodySm"
                              tone="success"
                              fontWeight="semibold"
                            >
                              Nachher
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
                        </Box>
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
                          Noch kein Vergleich verfügbar
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
                              {version.newData.optimizedTitle || "Unverändert"}"
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
                              Zurücksetzen
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

              {/* JSON-LD Tab */}
              {selectedTab === 3 && (
                <BlockStack gap="400">
                  <Text variant="headingSm" as="h3">
                    Strukturierte Daten (JSON-LD)
                  </Text>
                  {product.geoData ? (
                    <Card>
                      <pre
                        style={{
                          background: "#1a1a2e",
                          color: "#0ff",
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
                          <Text variant="bodySm">Länge</Text>
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
                          <Text variant="bodySm">Länge</Text>
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
                            Wörter
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
          title="Auf vorherige Version zurücksetzen?"
          primaryAction={{
            content: "Zurücksetzen",
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
              zurückgesetzt. Dieser Vorgang kann nicht rückgängig gemacht werden.
            </Text>
          </Modal.Section>
        </Modal>
      )}
    </Page>
  );
}
