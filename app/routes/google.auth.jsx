import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useEffect } from "react";
import { getGoogleAuthUrl } from "../services/google/auth.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = getGoogleAuthUrl(session.shop);
  // Return the URL as JSON instead of redirecting the iframe
  return json({ authUrl: url });
};

/**
 * This route breaks out of the Shopify embedded iframe
 * by navigating the top-level window to Google's OAuth consent page.
 */
export default function GoogleAuth() {
  const { authUrl } = useLoaderData();

  useEffect(() => {
    if (authUrl) {
      // Use App Bridge's open() or top-level navigation to break out of iframe
      if (window.top !== window.self) {
        // We're in an iframe — navigate the parent window
        window.open(authUrl, "_top");
      } else {
        window.location.href = authUrl;
      }
    }
  }, [authUrl]);

  return (
    <div style={{ padding: "40px", textAlign: "center" }}>
      <p>Weiterleitung zu Google...</p>
      <p style={{ fontSize: "14px", color: "#6b7280", marginTop: "8px" }}>
        Falls die Weiterleitung nicht automatisch erfolgt,{" "}
        <a href={authUrl} target="_top" rel="noopener noreferrer">
          klicke hier
        </a>.
      </p>
    </div>
  );
}
