/**
 * Plan-Check Utility für Titan GEO Core
 * Ermittelt den effektiven Plan eines Shops und prüft die Plan-Hierarchie.
 */

/**
 * Gibt den effektiven Plan eines Shops zurück.
 * Wenn ein Admin-Override gesetzt ist, wird dieser verwendet.
 * Ansonsten wird "Starter" zurückgegeben (echte Billing-Prüfung erfolgt anderswo).
 *
 * @param {string} shop - Shop-Domain
 * @param {import("@prisma/client").PrismaClient} prisma - Prisma Client
 * @returns {Promise<string>} - Effektiver Plan-Name
 */
export async function getEffectivePlan(shop, prisma) {
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
