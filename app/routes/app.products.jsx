import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useFetcher } from "@remix-run/react";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  IndexTable,
  Thumbnail,
  Badge,
  Button,
  Banner,
  EmptyState,
  Box,
  TextField,
  Select,
  useIndexResourceState,
  Tooltip,
  ProgressBar,
} from "@shopify/polaris";
import { ImageIcon } from "@shopify/polaris-icons";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useState, useEffect, useMemo } from "react";
import { authenticate } from "../shopify.server";
import { getUsageStats } from "../services/shopify/mutations.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const direction = url.searchParams.get("direction") || "next";

  const paginationArgs = cursor
    ? direction === "next"
      ? `first: 25, after: "${cursor}"`
      : `last: 25, before: "${cursor}"`
    : "first: 25";

  const response = await admin.graphql(
    `#graphql
    query getProducts {
      products(${paginationArgs}) {
        pageInfo {
          hasNextPage
          hasPreviousPage
          startCursor
          endCursor
        }
        nodes {
          id
          title
          handle
          status
          updatedAt
          featuredImage {
            url
            altText
          }
          metafield(namespace: "custom", key: "geo_score") {
            value
          }
        }
      }
    }`
  );

  const data = await response.json();
  const products = data.data?.products?.nodes || [];
  const pageInfo = data.data?.products?.pageInfo || {};

  const usage = await getUsageStats(shop);

  return json({
    products: products.map((p) => ({
      id: p.id.replace("gid://shopify/Product/", ""),
      shopifyId: p.id,
      title: p.title,
      handle: p.handle,
      status: p.status,
      updatedAt: p.updatedAt,
      image: p.featuredImage?.url,
      imageAlt: p.featuredImage?.altText,
      geoScore: p.metafield?.value ? Number(p.metafield.value) : null,
    })),
    pageInfo,
    usageCount: usage.used,
    freeLimit: usage.limit,
    limitReached: usage.remaining === 0,
  });
};

export default function Products() {
  const { products, pageInfo, usageCount, freeLimit, limitReached } =
    useLoaderData();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const auditFetcher = useFetcher();
  const optimizeFetcher = useFetcher();
  const [auditingId, setAuditingId] = useState(null);
  const [optimizingId, setOptimizingId] = useState(null);
  const [searchValue, setSearchValue] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const [healthCheckId, setHealthCheckId] = useState(null);

  const resourceName = { singular: "Produkt", plural: "Produkte" };

  // Compute stats
  const totalProducts = products.length;
  const optimizedProducts = products.filter(
    (p) => p.geoScore !== null && p.geoScore >= 40
  );
  const optimizedCount = optimizedProducts.length;
  const pendingCount = products.filter(
    (p) => p.geoScore === null || p.geoScore < 40
  ).length;
  const averageScore =
    products.filter((p) => p.geoScore !== null).length > 0
      ? Math.round(
          products
            .filter((p) => p.geoScore !== null)
            .reduce((sum, p) => sum + p.geoScore, 0) /
            products.filter((p) => p.geoScore !== null).length
        )
      : 0;
  const scoredCount = products.filter((p) => p.geoScore !== null).length;

  // Filter and sort products
  const filteredProducts = useMemo(() => {
    let result = [...products];

    // Search filter
    if (searchValue.trim()) {
      const query = searchValue.toLowerCase();
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(query) ||
          p.handle.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (statusFilter === "optimized") {
      result = result.filter(
        (p) => p.geoScore !== null && p.geoScore >= 40
      );
    } else if (statusFilter === "pending") {
      result = result.filter(
        (p) => p.geoScore === null || p.geoScore < 40
      );
    } else if (statusFilter === "excellent") {
      result = result.filter(
        (p) => p.geoScore !== null && p.geoScore >= 70
      );
    }

    // Sort
    if (sortBy === "score_desc") {
      result.sort((a, b) => (b.geoScore ?? -1) - (a.geoScore ?? -1));
    } else if (sortBy === "score_asc") {
      result.sort((a, b) => (a.geoScore ?? -1) - (b.geoScore ?? -1));
    } else if (sortBy === "name") {
      result.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === "date") {
      result.sort(
        (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
      );
    }

    return result;
  }, [products, searchValue, statusFilter, sortBy]);

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(filteredProducts);

  useEffect(() => {
    if (
      auditFetcher.data?.geoScore !== undefined &&
      auditFetcher.state === "idle"
    ) {
      shopify.toast.show(`GEO Score: ${auditFetcher.data.geoScore}/100`);
      if (healthCheckId === auditingId) {
        setHealthCheckId(null);
      }
      setAuditingId(null);
    }
    if (auditFetcher.data?.error && auditFetcher.state === "idle") {
      shopify.toast.show(auditFetcher.data.error, { isError: true });
      setAuditingId(null);
      setHealthCheckId(null);
    }
  }, [auditFetcher.data, auditFetcher.state]);

  useEffect(() => {
    if (optimizeFetcher.data?.success && optimizeFetcher.state === "idle") {
      shopify.toast.show("Optimierung erfolgreich deployed!");
      setOptimizingId(null);
    }
    if (optimizeFetcher.data?.error && optimizeFetcher.state === "idle") {
      shopify.toast.show(optimizeFetcher.data.error, { isError: true });
      setOptimizingId(null);
    }
  }, [optimizeFetcher.data, optimizeFetcher.state]);

  const handleAudit = (shopifyId) => {
    setAuditingId(shopifyId);
    auditFetcher.submit(
      { productId: shopifyId },
      { method: "post", action: "/app/api/audit" }
    );
  };

  const handleOptimize = (shopifyId) => {
    setOptimizingId(shopifyId);
    optimizeFetcher.submit(
      { productId: shopifyId },
      { method: "post", action: "/app/api/optimize" }
    );
  };

  const handleHealthCheck = (shopifyId) => {
    setHealthCheckId(shopifyId);
    handleAudit(shopifyId);
  };

  const handleBulkOptimize = () => {
    if (limitReached) {
      shopify.toast.show(
        "Free-Tier Limit erreicht. Bitte upgrade auf Pro.",
        { isError: true }
      );
      return;
    }
    shopify.toast.show(
      `${selectedResources.length} Produkte werden optimiert...`
    );
    selectedResources.forEach((id, i) => {
      const product = filteredProducts.find((p) => p.id === id);
      if (product) {
        setTimeout(() => handleOptimize(product.shopifyId), i * 3000);
      }
    });
  };

  const promotedBulkActions = [
    {
      content: "Bulk Audit starten",
      onAction: () => {
        shopify.toast.show(
          `${selectedResources.length} Produkte werden analysiert...`
        );
        selectedResources.forEach((id, i) => {
          const product = filteredProducts.find((p) => p.id === id);
          if (product) {
            setTimeout(() => handleAudit(product.shopifyId), i * 2000);
          }
        });
      },
    },
    {
      content: "Bulk Optimieren",
      onAction: handleBulkOptimize,
    },
  ];

  const getScoreColor = (score) => {
    if (score === null) return "#94a3b8";
    if (score >= 70) return "var(--titan-success, #10b981)";
    if (score >= 40) return "var(--titan-warning, #f59e0b)";
    return "var(--titan-danger, #ef4444)";
  };

  const getScoreLabel = (score) => {
    if (score === null) return "Ausstehend";
    if (score >= 70) return "Optimiert";
    if (score >= 40) return "Teilweise";
    return "Kritisch";
  };

  if (products.length === 0) {
    return (
      <Page
        title="Produkte"
        backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
      >
        <Card>
          <EmptyState
            heading="Keine Produkte gefunden"
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            <p>
              Fuege zuerst Produkte zu deinem Store hinzu, um sie zu
              optimieren.
            </p>
          </EmptyState>
        </Card>
      </Page>
    );
  }

  const rowMarkup = filteredProducts.map((product, index) => (
    <IndexTable.Row
      id={product.id}
      key={product.id}
      selected={selectedResources.includes(product.id)}
      position={index}
      onClick={() => navigate(`/app/products/${product.id}`)}
    >
      <IndexTable.Cell>
        <InlineStack gap="300" blockAlign="center" wrap={false}>
          <div
            style={{
              borderRadius: "10px",
              overflow: "hidden",
              border: `2px solid ${getScoreColor(product.geoScore)}20`,
              flexShrink: 0,
            }}
          >
            <Thumbnail
              source={product.image || ImageIcon}
              alt={product.imageAlt || product.title}
              size="small"
            />
          </div>
          <BlockStack gap="050">
            <Text variant="bodyMd" as="span" fontWeight="semibold">
              {product.title}
            </Text>
            <Text variant="bodySm" as="span" tone="subdued">
              /{product.handle}
            </Text>
          </BlockStack>
        </InlineStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Badge tone={product.status === "ACTIVE" ? "success" : "info"}>
          {product.status === "ACTIVE" ? "Aktiv" : product.status}
        </Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="200" blockAlign="center">
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 10px",
              borderRadius: "20px",
              background: `${getScoreColor(product.geoScore)}15`,
              border: `1px solid ${getScoreColor(product.geoScore)}30`,
            }}
          >
            <div
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: getScoreColor(product.geoScore),
              }}
            />
            <Text variant="bodySm" as="span" fontWeight="semibold">
              {product.geoScore !== null
                ? `${product.geoScore}/100`
                : "---"}
            </Text>
          </div>
        </InlineStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text variant="bodySm" as="span" tone="subdued">
          {getScoreLabel(product.geoScore)}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="200">
          <Tooltip content="GEO Audit durchfuehren">
            <Button
              size="slim"
              onClick={(e) => {
                e.stopPropagation();
                handleHealthCheck(product.shopifyId);
              }}
              loading={
                auditingId === product.shopifyId &&
                healthCheckId === product.shopifyId
              }
              disabled={auditingId === product.shopifyId}
            >
              Health Check
            </Button>
          </Tooltip>
          <Tooltip content="Zur Produktdetailseite">
            <Button
              size="slim"
              variant="primary"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/app/products/${product.id}`);
              }}
            >
              Optimieren
            </Button>
          </Tooltip>
        </InlineStack>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page
      title="Produkte"
      backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
    >
      <BlockStack gap="500">
        {/* Usage Limit Banner */}
        {limitReached && (
          <Banner
            title="Free-Tier Limit erreicht"
            tone="warning"
            action={{ content: "Auf Pro upgraden", url: "/app/billing" }}
          >
            <p>
              Du hast alle {freeLimit} kostenlosen Optimierungen aufgebraucht.
              Upgrade auf Titan GEO Pro fuer unbegrenzte Optimierungen.
            </p>
          </Banner>
        )}

        {/* Health Check Quick Result */}
        {healthCheckId &&
          auditFetcher.data?.geoScore !== undefined &&
          auditFetcher.state === "idle" && (
            <Banner
              title={`Health Check Ergebnis: ${auditFetcher.data.geoScore}/100`}
              tone={
                auditFetcher.data.geoScore >= 70
                  ? "success"
                  : auditFetcher.data.geoScore >= 40
                    ? "warning"
                    : "critical"
              }
              onDismiss={() => setHealthCheckId(null)}
            >
              <p>
                {auditFetcher.data.assessment ||
                  "Analyse abgeschlossen. Oeffne die Produktdetailseite fuer mehr Details."}
              </p>
            </Banner>
          )}

        {/* Score Summary Bar */}
        <div className="titan-card-premium">
          <div style={{ padding: "20px 24px" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: "20px",
              }}
            >
              {/* Total Products */}
              <div style={{ textAlign: "center" }}>
                <Text variant="bodySm" as="p" tone="subdued">
                  Produkte gesamt
                </Text>
                <div style={{ marginTop: "4px" }}>
                  <Text variant="headingLg" as="p" fontWeight="bold">
                    {totalProducts}
                  </Text>
                </div>
              </div>

              {/* Optimized */}
              <div style={{ textAlign: "center" }}>
                <Text variant="bodySm" as="p" tone="subdued">
                  Optimiert
                </Text>
                <div style={{ marginTop: "4px" }}>
                  <Text
                    variant="headingLg"
                    as="p"
                    fontWeight="bold"
                  >
                    <span style={{ color: "var(--titan-success, #10b981)" }}>
                      {optimizedCount}
                    </span>
                  </Text>
                </div>
              </div>

              {/* Average Score */}
              <div style={{ textAlign: "center" }}>
                <Text variant="bodySm" as="p" tone="subdued">
                  Durchschnittl. Score
                </Text>
                <div style={{ marginTop: "4px" }}>
                  <Text variant="headingLg" as="p" fontWeight="bold">
                    <span
                      style={{
                        color:
                          averageScore >= 70
                            ? "var(--titan-success, #10b981)"
                            : averageScore >= 40
                              ? "var(--titan-warning, #f59e0b)"
                              : "var(--titan-danger, #ef4444)",
                      }}
                    >
                      {scoredCount > 0 ? averageScore : "---"}
                    </span>
                  </Text>
                </div>
              </div>

              {/* Pending */}
              <div style={{ textAlign: "center" }}>
                <Text variant="bodySm" as="p" tone="subdued">
                  Ausstehend
                </Text>
                <div style={{ marginTop: "4px" }}>
                  <Text variant="headingLg" as="p" fontWeight="bold">
                    <span style={{ color: "var(--titan-warning, #f59e0b)" }}>
                      {pendingCount}
                    </span>
                  </Text>
                </div>
              </div>

              {/* Usage */}
              <div style={{ textAlign: "center" }}>
                <Text variant="bodySm" as="p" tone="subdued">
                  Optimierungen
                </Text>
                <div style={{ marginTop: "4px" }}>
                  <Text variant="headingLg" as="p" fontWeight="bold">
                    {usageCount}/{freeLimit}
                  </Text>
                </div>
                <div style={{ marginTop: "6px" }}>
                  <ProgressBar
                    progress={Math.min(
                      (usageCount / freeLimit) * 100,
                      100
                    )}
                    tone={limitReached ? "critical" : "primary"}
                    size="small"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Search and Filter Bar */}
        <Card>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto auto",
              gap: "12px",
              alignItems: "end",
            }}
          >
            <TextField
              label="Suche"
              value={searchValue}
              onChange={setSearchValue}
              placeholder="Produkt suchen..."
              clearButton
              onClearButtonClick={() => setSearchValue("")}
              autoComplete="off"
              labelHidden
              prefix={<span style={{ opacity: 0.5 }}>Suche</span>}
            />
            <Select
              label="Status"
              labelHidden
              options={[
                { label: "Alle Produkte", value: "all" },
                { label: "Optimiert (Score 40+)", value: "optimized" },
                { label: "Exzellent (Score 70+)", value: "excellent" },
                { label: "Ausstehend", value: "pending" },
              ]}
              value={statusFilter}
              onChange={setStatusFilter}
            />
            <Select
              label="Sortierung"
              labelHidden
              options={[
                { label: "Name (A-Z)", value: "name" },
                { label: "Score (hoch-niedrig)", value: "score_desc" },
                { label: "Score (niedrig-hoch)", value: "score_asc" },
                { label: "Zuletzt bearbeitet", value: "date" },
              ]}
              value={sortBy}
              onChange={setSortBy}
            />
          </div>
          {(searchValue || statusFilter !== "all") && (
            <div style={{ marginTop: "8px" }}>
              <InlineStack gap="200" blockAlign="center">
                <Text variant="bodySm" as="span" tone="subdued">
                  {filteredProducts.length} von {totalProducts} Produkten
                </Text>
                <Button
                  variant="plain"
                  size="slim"
                  onClick={() => {
                    setSearchValue("");
                    setStatusFilter("all");
                  }}
                >
                  Filter zuruecksetzen
                </Button>
              </InlineStack>
            </div>
          )}
        </Card>

        {/* Products Table */}
        {filteredProducts.length > 0 ? (
          <Card padding="0">
            <IndexTable
              resourceName={resourceName}
              itemCount={filteredProducts.length}
              selectedItemsCount={
                allResourcesSelected ? "All" : selectedResources.length
              }
              onSelectionChange={handleSelectionChange}
              headings={[
                { title: "Produkt" },
                { title: "Status" },
                { title: "GEO Score" },
                { title: "Bewertung" },
                { title: "Aktionen" },
              ]}
              promotedBulkActions={promotedBulkActions}
              selectable
            >
              {rowMarkup}
            </IndexTable>
          </Card>
        ) : (
          <Card>
            <Box padding="800">
              <BlockStack gap="300" inlineAlign="center">
                <Text variant="headingSm" as="p" alignment="center">
                  Keine Produkte gefunden
                </Text>
                <Text
                  variant="bodyMd"
                  as="p"
                  tone="subdued"
                  alignment="center"
                >
                  Passe deine Suchkriterien oder Filter an.
                </Text>
                <Button
                  onClick={() => {
                    setSearchValue("");
                    setStatusFilter("all");
                  }}
                >
                  Filter zuruecksetzen
                </Button>
              </BlockStack>
            </Box>
          </Card>
        )}

        {/* Pagination */}
        {(pageInfo.hasPreviousPage || pageInfo.hasNextPage) && (
          <InlineStack align="center" gap="400" blockAlign="center">
            {pageInfo.hasPreviousPage && (
              <Button
                url={`/app/products?cursor=${pageInfo.startCursor}&direction=prev`}
              >
                Vorherige Seite
              </Button>
            )}
            <Text variant="bodySm" as="span" tone="subdued">
              Seite
            </Text>
            {pageInfo.hasNextPage && (
              <Button
                url={`/app/products?cursor=${pageInfo.endCursor}&direction=next`}
              >
                Naechste Seite
              </Button>
            )}
          </InlineStack>
        )}
      </BlockStack>
    </Page>
  );
}
