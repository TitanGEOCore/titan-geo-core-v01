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
      <body style={{
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        padding: "40px",
        textAlign: "center",
        background: "#fafafa",
        color: "#09090b",
        margin: 0,
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <div style={{
          maxWidth: "520px",
          width: "100%",
          background: "#ffffff",
          borderRadius: "16px",
          padding: "48px 40px",
          boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
          border: "1px solid rgba(0,0,0,0.06)",
        }}>
          <div style={{
            width: "48px",
            height: "48px",
            borderRadius: "12px",
            background: "#09090b",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
            fontSize: "20px",
          }}>
            <span style={{ color: "#ffffff" }}>!</span>
          </div>
          <h1 style={{
            color: "#09090b",
            fontSize: "20px",
            fontWeight: 800,
            marginBottom: "8px",
            letterSpacing: "-0.3px",
          }}>
            Ein Fehler ist aufgetreten
          </h1>
          <p style={{
            color: "#71717a",
            marginBottom: "24px",
            fontSize: "14px",
            lineHeight: "1.5",
          }}>
            Bitte lade die Seite neu oder kontaktiere den Support.
          </p>
          <pre style={{
            background: "#f4f4f5",
            padding: "16px",
            borderRadius: "10px",
            textAlign: "left",
            overflow: "auto",
            fontSize: "13px",
            color: "#3f3f46",
            border: "1px solid #e4e4e7",
            lineHeight: "1.5",
          }}>
            {message}
          </pre>
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
