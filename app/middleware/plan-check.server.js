/**
 * Plan-Check Utility für Titan GEO Core
 * Ermittelt den effektiven Plan eines Shops und prüft die Plan-Hierarchie.
 */

/**
 * Gibt den effektiven Plan eines Shops zurück.
 * Prüft Admin-Shop ENV, Developer-Shops, planOverride und fällt auf Starter zurück.
 *
 * @param {string} shop - Shop-Domain
 * @param {import("@prisma/client").PrismaClient} prisma - Prisma Client
 * @returns {Promise<string>} - Effektiver Plan-Name
 */
export async function getEffectivePlan(shop, prisma) {
  // Admin shop override from ENV
  if (process.env.ADMIN_SHOP && shop === process.env.ADMIN_SHOP) {
    return "Admin";
  }
  // Developer shops get Admin plan
  const devShops = process.env.DEVELOPER_SHOPS;
  if (devShops && devShops.split(',').map(s => s.trim()).includes(shop)) {
    return "Admin";
  }
  const settings = await prisma.shopSettings.findUnique({ where: { shop } });
  // Wenn planOverride gesetzt ist (durch Admin), diesen verwenden
  if (settings?.planOverride) return settings.planOverride;
  // Ansonsten "Starter" zurückgeben (echte Billing-Prüfung erfolgt anderswo)
  return "Starter";
}

/**
 * Prüft ob der aktuelle Plan mindestens dem erforderlichen Plan entspricht.
 * Hierarchie: Starter < Growth < Pro < Enterprise < Admin
 * Admin hat unbegrenzten Zugriff über allen anderen Plänen.
 *
 * @param {string} currentPlan - Aktueller Plan des Shops
 * @param {string} requiredPlan - Mindestens benötigter Plan
 * @returns {boolean} - true wenn currentPlan >= requiredPlan
 */
export function isPlanAtLeast(currentPlan, requiredPlan) {
  const hierarchy = ["Starter", "Growth", "Pro", "Enterprise", "Admin"];
  return hierarchy.indexOf(currentPlan) >= hierarchy.indexOf(requiredPlan);
}
