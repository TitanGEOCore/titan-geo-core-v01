import { EmptyState, Card } from "@shopify/polaris";

export function EmptyStatePlaceholder({ heading, description, action, image }) {
  return (
    <Card>
      <EmptyState
        heading={heading}
        action={action}
        image={image || "https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"}
      >
        <p>{description}</p>
      </EmptyState>
    </Card>
  );
}
