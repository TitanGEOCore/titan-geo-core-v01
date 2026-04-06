import { Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "../shopify.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();
  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <a href="/app" rel="home">Dashboard</a>
        <a href="/app/products">Produkte</a>
        <a href="/app/keywords">Keyword-Recherche</a>
        <a href="/app/health">SEO Health Check</a>
        <a href="/app/alt-texts">Alt-Text Optimizer</a>
        <a href="/app/content-audit">Content Audit</a>
        <a href="/app/meta-generator">Meta Generator</a>
        <a href="/app/internal-links">Interne Verlinkung</a>
        <a href="/app/templates">Brand Templates</a>
        <a href="/app/competitor">Wettbewerber-Analyse</a>
        <a href="/app/ranking-tracker">Ranking Tracker</a>
        <a href="/app/multi-lang">Multi-Language</a>
        <a href="/app/roi">ROI Dashboard</a>
        <a href="/app/shop-analysis">Shop-Analyse</a>
        <a href="/app/landing">Über Titan GEO</a>

        <a href="/app/settings">Einstellungen</a>
        <a href="/app/billing">Pläne & Preise</a>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
