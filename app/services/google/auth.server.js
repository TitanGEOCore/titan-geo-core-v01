import { google } from "googleapis";
import prisma from "../../db.server.js";

/**
 * Gibt die aktuelle Redirect-URI zurück.
 * WICHTIG: Diese URI MUSS in der Google Cloud Console unter
 * "Autorisierte Weiterleitungs-URIs" eingetragen sein.
 * Bei Tunnel-Neustarts ändert sich SHOPIFY_APP_URL — dann muss
 * die URI in der Cloud Console aktualisiert werden.
 */
export function getRedirectUri() {
  const baseUrl = (
    process.env.SHOPIFY_APP_URL ||
    process.env.GOOGLE_REDIRECT_URI?.replace("/google/callback", "") ||
    ""
  ).replace(/\/+$/, ""); // trailing slashes entfernen
  return `${baseUrl}/google/callback`;
}

function createOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Google OAuth ist nicht konfiguriert. Bitte GOOGLE_CLIENT_ID und GOOGLE_CLIENT_SECRET in der .env setzen."
    );
  }

  return new google.auth.OAuth2(clientId, clientSecret, getRedirectUri());
}

const SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/content",
];

export function getGoogleAuthUrl(shop) {
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    state: shop,
    prompt: "consent",
  });
}

export async function handleGoogleCallback(code, shop) {
  const client = createOAuth2Client();

  let tokens;
  try {
    const response = await client.getToken(code);
    tokens = response.tokens;
  } catch (err) {
    console.error("Google Token-Austausch fehlgeschlagen:", err.message);

    if (err.message?.includes("redirect_uri_mismatch")) {
      throw new Error(
        `Redirect-URI stimmt nicht überein. Die aktuelle URI "${getRedirectUri()}" muss exakt in der Google Cloud Console eingetragen sein.`
      );
    }
    if (err.message?.includes("invalid_grant")) {
      throw new Error(
        "Autorisierungscode abgelaufen oder bereits verwendet. Bitte versuche es erneut."
      );
    }
    if (err.code === 403 || err.message?.includes("access_denied")) {
      throw new Error(
        "Zugriff verweigert (403). Stelle sicher, dass die Search Console API und Content API in der Google Cloud Console aktiviert sind."
      );
    }
    throw new Error(`Google-Authentifizierung fehlgeschlagen: ${err.message}`);
  }

  if (!tokens.refresh_token) {
    console.warn(
      "Kein refresh_token erhalten. Der Nutzer hat möglicherweise den Zugriff bereits gewährt. Bestehender Token wird beibehalten."
    );
  }

  await prisma.externalTokens.upsert({
    where: { shop },
    update: {
      ...(tokens.refresh_token ? { gscRefresh: tokens.refresh_token } : {}),
      ...(tokens.refresh_token ? { merchantRefresh: tokens.refresh_token } : {}),
    },
    create: {
      shop,
      gscRefresh: tokens.refresh_token || "",
      merchantRefresh: tokens.refresh_token || "",
    },
  });

  return tokens;
}

export async function getAuthenticatedClient(shop) {
  const record = await prisma.externalTokens.findUnique({ where: { shop } });
  if (!record?.gscRefresh) return null;

  const client = createOAuth2Client();
  client.setCredentials({ refresh_token: record.gscRefresh });
  return client;
}
