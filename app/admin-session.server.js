/**
 * Admin session management (server-only).
 * Uses in-memory session store with database-backed authentication.
 */
import prisma from "./db.server.js";

const adminSessions = new Map();

export function getAdminSessions() {
  return adminSessions;
}

export function verifyAdminSession(cookieHeader) {
  if (!cookieHeader) return false;
  const match = cookieHeader.match(/titan_admin_session=([^;]+)/);
  if (!match) return false;
  const token = decodeURIComponent(match[1]);
  const session = adminSessions.get(token);
  if (!session) return false;
  // Session gültig für 24 Stunden
  if (Date.now() - session.createdAt > 24 * 60 * 60 * 1000) {
    adminSessions.delete(token);
    return false;
  }
  return true;
}

/**
 * Verify admin credentials against database.
 * Falls zurück auf ENV-basierte Auth, wenn keine AdminUser existieren.
 * 
 * @param {string} email 
 * @param {string} password 
 * @returns {Promise<{success: boolean, user?: object, error?: string}>}
 */
export async function verifyAdminCredentials(email, password) {
  // First check if we have any admin users in DB
  const adminUserCount = await prisma.adminUser.count();
  
  if (adminUserCount > 0) {
    // Use database authentication
    const adminUser = await prisma.adminUser.findUnique({
      where: { email },
    });
    
    if (!adminUser) {
      return { success: false, error: "Ungültige Anmeldedaten." };
    }
    
    // Simple password check (in production, use bcrypt.compare)
    // For now, support both hashed and plain comparison
    const isValidPassword = adminUser.password === password || 
                           await comparePassword(password, adminUser.password);
    
    if (!isValidPassword) {
      return { success: false, error: "Ungültige Anmeldedaten." };
    }
    
    return { 
      success: true, 
      user: { 
        id: adminUser.id, 
        email: adminUser.email, 
        role: adminUser.role 
      } 
    };
  }
  
  // Fallback to ENV-based auth
  const adminEmail = process.env.ADMIN_EMAIL || "admin@titangeo.de";
  const adminPassword = process.env.ADMIN_PASSWORD || "TitanGeo2024!";
  
  if (email === adminEmail && password === adminPassword) {
    return { 
      success: true, 
      user: { 
        id: "env-admin", 
        email: adminEmail, 
        role: "Admin" 
      } 
    };
  }
  
  return { success: false, error: "Ungültige Anmeldedaten." };
}

/**
 * Compare password with hash.
 * @param {string} password 
 * @param {string} hash 
 * @returns {Promise<boolean>}
 */
async function comparePassword(password, hash) {
  // Simple comparison - in production use bcrypt
  // This is a placeholder for when bcrypt is added
  return password === hash;
}
