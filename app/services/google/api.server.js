import { google } from "googleapis";
import { getAuthenticatedClient } from "./auth.server.js";

export async function fetchGscData(shop, siteUrl, pageUrl) {
  const auth = await getAuthenticatedClient(shop);
  if (!auth) {
    throw new Error("Google nicht verbunden. Bitte zuerst in den Einstellungen verbinden.");
  }

  const searchconsole = google.searchconsole({ version: "v1", auth });

  try {
    const res = await searchconsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: getDateDaysAgo(28),
        endDate: getDateDaysAgo(1),
        dimensions: ["page"],
        dimensionFilterGroups: [
          {
            filters: [
              {
                dimension: "page",
                operator: "equals",
                expression: pageUrl,
              },
            ],
          },
        ],
      },
    });

    const row = res.data?.rows?.[0];
    return {
      impressions: row?.impressions || 0,
      clicks: row?.clicks || 0,
      ctr: row?.ctr ? (row.ctr * 100).toFixed(2) + "%" : "0%",
      position: row?.position ? row.position.toFixed(1) : "N/A",
    };
  } catch (err) {
    console.error("GSC API error:", err.message);
    if (err.code === 403) {
      throw new Error("Zugriff verweigert. Bitte stelle sicher, dass die Search Console API aktiviert ist und du Zugriff auf die Property hast.");
    }
    throw err;
  }
}

export async function syncToMerchantCenter(shop, merchantId, product) {
  const auth = await getAuthenticatedClient(shop);
  if (!auth) throw new Error("Google nicht verbunden");

  const content = google.content({ version: "v2.1", auth });

  try {
    const res = await content.products.insert({
      merchantId,
      requestBody: {
        offerId: product.id,
        title: product.title,
        description: product.description,
        link: product.url,
        imageLink: product.image,
        availability: "in stock",
        price: { value: product.price, currency: "EUR" },
        channel: "online",
        contentLanguage: "de",
        targetCountry: "DE",
      },
    });
    return res.data;
  } catch (err) {
    console.error("Merchant Center error:", err.message);
    throw err;
  }
}

function getDateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}
