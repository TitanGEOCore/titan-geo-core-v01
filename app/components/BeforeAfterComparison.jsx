import { Card, Text, Box, InlineGrid, Divider, BlockStack } from "@shopify/polaris";

export function BeforeAfterComparison({ before, after, label }) {
  return (
    <Card>
      <Text variant="headingSm" as="h3">{label}</Text>
      <Box paddingBlockStart="400">
        <InlineGrid columns={2} gap="400">
          <Box background="bg-surface-secondary" padding="400" borderRadius="200">
            <BlockStack gap="200">
              <Text variant="bodySm" as="p" tone="subdued" fontWeight="semibold">Vorher</Text>
              <Divider />
              <Text variant="bodyMd" as="div">{before || "—"}</Text>
            </BlockStack>
          </Box>
          <Box background="bg-surface-success" padding="400" borderRadius="200">
            <BlockStack gap="200">
              <Text variant="bodySm" as="p" tone="success" fontWeight="semibold">Nachher (GEO-optimiert)</Text>
              <Divider />
              <Text variant="bodyMd" as="div">{after || "—"}</Text>
            </BlockStack>
          </Box>
        </InlineGrid>
      </Box>
    </Card>
  );
}
