import { Badge } from "@shopify/polaris";

export function GeoScoreBadge({ score }) {
  if (score === null || score === undefined) {
    return <Badge tone="new">Nicht analysiert</Badge>;
  }

  const numScore = Number(score);

  if (numScore >= 80) return <Badge tone="success">{numScore}/100</Badge>;
  if (numScore >= 60) return <Badge tone="warning">{numScore}/100</Badge>;
  if (numScore >= 40) return <Badge tone="attention">{numScore}/100</Badge>;
  return <Badge tone="critical">{numScore}/100</Badge>;
}
