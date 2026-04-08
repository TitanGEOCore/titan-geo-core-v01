import { redirect } from "@remix-run/node";
import { handleGoogleCallback } from "../services/google/auth.server";
import prisma from "../db.server";

const ERROR_MESSAGES = {
  access_denied: "Zugriff wurde vom Nutzer verweigert. Bitte erneut versuchen und den Zugriff erlauben.",
  missing_params: "Fehlende Parameter in der Antwort von Google. Bitte erneut versuchen.",
  invalid_scope: "Ungueltige Berechtigungen angefragt. Bitte kontaktiere den Support.",
};

/**
 * Build the Shopify admin URL that loads the app at a given path.
 * After Google OAuth we're at the top-level (not in iframe), so we need
 * to redirect back into the Shopify admin to restore embedded context.
 */
async function getShopifyAdminUrl(shop, appPath = "settings") {
  const storeHandle = shop.replace(".myshopify.com", "");
  return `https://admin.shopify.com/store/${storeHandle}/apps/titan-geo-core/${appPath}`;
}

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state"); // shop domain
  const error = url.searchParams.get("error");

  // Determine the shop for redirect (from state param or DB fallback)
  let shop = state;
  if (!shop) {
    try {
      const session = await prisma.session.findFirst({
        where: { accessToken: { not: "" } },
        select: { shop: true },
      });
      shop = session?.shop;
    } catch (_) {}
  }

  if (error) {
    console.error("Google OAuth Fehler:", error);
    const message = ERROR_MESSAGES[error] || `Google-Fehler: ${error}`;
    if (shop) {
      const adminUrl = await getShopifyAdminUrl(shop, `settings?googleError=${encodeURIComponent(message)}`);
      return redirect(adminUrl);
    }
    return redirect(`/app/settings?googleError=${encodeURIComponent(message)}`);
  }

  if (!code || !state) {
    const message = ERROR_MESSAGES.missing_params;
    if (shop) {
      const adminUrl = await getShopifyAdminUrl(shop, `settings?googleError=${encodeURIComponent(message)}`);
      return redirect(adminUrl);
    }
    return redirect(`/app/settings?googleError=${encodeURIComponent(message)}`);
  }

  try {
    await handleGoogleCallback(code, state);
    // Redirect back into Shopify admin to restore embedded context
    const adminUrl = await getShopifyAdminUrl(state, "settings?googleSuccess=true");
    return redirect(adminUrl);
  } catch (err) {
    console.error("Google Callback Fehler:", err);
    const adminUrl = await getShopifyAdminUrl(state, `settings?googleError=${encodeURIComponent(err.message)}`);
    return redirect(adminUrl);
  }
};
