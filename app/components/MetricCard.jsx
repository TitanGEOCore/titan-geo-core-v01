import { Card, Text, Box } from "@shopify/polaris";

export function MetricCard({ title, value, subtitle, tone = "base" }) {
  return (
    <Card>
      <Box paddingBlockEnd="200">
        <Text variant="bodySm" as="p" tone="subdued">{title}</Text>
      </Box>
      <Text variant="headingXl" as="p" fontWeight="bold">{value}</Text>
      {subtitle && (
        <Box paddingBlockStart="200">
          <Text variant="bodySm" as="p" tone={tone === "success" ? "success" : tone === "critical" ? "critical" : "subdued"}>
            {subtitle}
          </Text>
        </Box>
      )}
    </Card>
  );
}
