import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  const { topic, shop } = await authenticate.webhook(request);

  switch (topic) {
    case "APP_UNINSTALLED":
      await prisma.session.deleteMany({ where: { shop } });
      await prisma.shopSettings.deleteMany({ where: { shop } });
      await prisma.usageTracker.deleteMany({ where: { shop } });
      await prisma.externalTokens.deleteMany({ where: { shop } });
      break;
    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT": {
      // Delete customer-related data for the shop
      if (shop) {
        // We don't store direct customer data, but clean up any usage tracking
        console.log(`[GDPR] Customer data redact request for shop: ${shop}`);
      }
      break;
    }
    case "SHOP_REDACT": {
      // Shop uninstalled - delete ALL data for this shop
      if (shop) {
        await Promise.all([
          prisma.usageTracker.deleteMany({ where: { shop } }),
          prisma.contentVersion.deleteMany({ where: { shop } }),
          prisma.shopAnalysisReport.deleteMany({ where: { shop } }),
          prisma.shopSettings.deleteMany({ where: { shop } }),
          prisma.session.deleteMany({ where: { shop } }),
          prisma.externalTokens.deleteMany({ where: { shop } }),
        ]);
        console.log(`[GDPR] All data deleted for shop: ${shop}`);
      }
      break;
    }
    default:
      throw new Response("Unhandled webhook topic", { status: 404 });
  }

  return new Response();
};
