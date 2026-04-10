import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
  isRouteErrorResponse,
} from "@remix-run/react";
import titanStyles from "./styles/titan.css?url";

export const links = () => [
  { rel: "stylesheet", href: titanStyles },
];

export function ErrorBoundary() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status}: ${error.statusText}`
    : error?.message || "Unbekannter Fehler";
  return (
    <html lang="de">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>Fehler - Titan GEO Core</title>
      </head>
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "40px", textAlign: "center", background: "#f8fafc" }}>
        <div style={{ maxWidth: "520px", margin: "80px auto", background: "#fff", borderRadius: "16px", padding: "40px", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
          <h1 style={{ color: "#ef4444", fontSize: "24px", marginBottom: "12px" }}>Ein Fehler ist aufgetreten</h1>
          <p style={{ color: "#64748b", marginBottom: "24px" }}>Bitte lade die Seite neu oder kontaktiere den Support.</p>
          <pre style={{ background: "#f1f5f9", padding: "16px", borderRadius: "8px", textAlign: "left", overflow: "auto", fontSize: "13px", color: "#334155" }}>{message}</pre>
        </div>
      </body>
    </html>
  );
}

export default function App() {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
