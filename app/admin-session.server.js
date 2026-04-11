/**
 * Admin session management (server-only).
 * Uses in-memory session store with file-based persistence backup.
 * Sessions survive server restarts by being persisted to disk.
 */
import bcrypt from "bcryptjs";
import fs from "fs";
import os from "os";
import path from "path";
import prisma from "./db.server.js";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Session file path: configurable via env, defaults to OS temp directory.
const sessionFilePath = path.join(
  process.env.SESSION_PERSIST_DIR || os.tmpdir(),
  "titan-admin-sessions.json"
);

const adminSessions = new Map();

/**
 * Load sessions from disk into memory.
 * Called once at module initialization.
 */
function loadSessionsFromDisk() {
  try {
    if (fs.existsSync(sessionFilePath)) {
      const raw = fs.readFileSync(sessionFilePath, "utf-8");
      const entries = JSON.parse(raw);
      const now = Date.now();
      let loaded = 0;
      for (const [token, session] of entries) {
        // Only restore sessions that haven't expired
        if (now - session.createdAt < SESSION_TTL_MS) {
          adminSessions.set(token, session);
          loaded++;
        }
      }
      if (loaded > 0) {
        console.log(`[admin-session] Restored ${loaded} session(s) from disk.`);
      }
    }
  } catch (err) {
    console.warn("[admin-session] Could not load sessions from disk:", err.message);
  }
}

/**
 * Persist all current (non-expired) sessions to disk.
 * Silently fails — file persistence is a best-effort backup.
 */
function persistSessionsToDisk() {
  try {
    const dir = path.dirname(sessionFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Filter out expired sessions before writing
    const now = Date.now();
    const entries = Array.from(adminSessions.entries()).filter(
      ([, session]) => now - session.createdAt < SESSION_TTL_MS
    );
    fs.writeFileSync(sessionFilePath, JSON.stringify(entries), "utf-8");
  } catch (err) {
    console.warn("[admin-session] Could not persist sessions to disk:", err.message);
  }
}

// Load persisted sessions on module initialization
loadSessionsFromDisk();

export function getAdminSessions() {
  return adminSessions;
}

/**
 * Create a new admin session and persist it.
 * @param {string} token - The session token (e.g. crypto.randomUUID())
 * @param {object} sessionData - Session data (email, role, ip, etc.)
 * @returns {object} The created session object (with createdAt added)
 */
export function createAdminSession(token, sessionData) {
  const session = {
    ...sessionData,
    createdAt: Date.now(),
  };
  adminSessions.set(token, session);
  persistSessionsToDisk();
  return session;
}

/**
 * Delete an admin session by token and persist the change.
 * @param {string} token
 */
export function deleteAdminSession(token) {
  adminSessions.delete(token);
  persistSessionsToDisk();
}

export function verifyAdminSession(cookieHeader) {
  if (!cookieHeader) return false;
  const match = cookieHeader.match(/titan_admin_session=([^;]+)/);
  if (!match) return false;
  const token = decodeURIComponent(match[1]);

  // Fast path: check in-memory Map
  const session = adminSessions.get(token);
  if (session) {
    // Session gültig für 24 Stunden
    if (Date.now() - session.createdAt > SESSION_TTL_MS) {
      deleteAdminSession(token);
      return false;
    }
    return true;
  }

  // Fallback: try reloading from disk in case another process wrote it
  try {
    if (fs.existsSync(sessionFilePath)) {
      const raw = fs.readFileSync(sessionFilePath, "utf-8");
      const entries = JSON.parse(raw);
      for (const [storedToken, storedSession] of entries) {
        if (storedToken === token) {
          if (Date.now() - storedSession.createdAt > SESSION_TTL_MS) {
            return false;
          }
          // Restore to in-memory cache
          adminSessions.set(token, storedSession);
          return true;
        }
      }
    }
  } catch {
    // Disk read failed — treat as session not found
  }

  return false;
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

    const isValidPassword = await comparePassword(password, adminUser.password);

    if (!isValidPassword) {
      return { success: false, error: "Ungültige Anmeldedaten." };
    }

    // Migrate legacy plain-text password to bcrypt hash
    if (adminUser.password && !adminUser.password.startsWith("$2")) {
      try {
        const hashed = await hashPassword(password);
        await prisma.adminUser.update({
          where: { id: adminUser.id },
          data: { password: hashed },
        });
      } catch (_) {
        // Non-critical: migration failed, will retry on next login
      }
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
 * Compare password with stored value.
 * Supports bcrypt hashes and legacy plain-text (for migration).
 * @param {string} plaintext
 * @param {string} stored
 * @returns {Promise<boolean>}
 */
async function comparePassword(plaintext, stored) {
  // If stored is a bcrypt hash, use bcrypt.compare
  if (stored && stored.startsWith("$2")) {
    return bcrypt.compare(plaintext, stored);
  }
  // Legacy plain-text comparison (for migration)
  return plaintext === stored;
}

/**
 * Hash a plaintext password with bcrypt.
 * @param {string} plaintext
 * @returns {Promise<string>}
 */
export async function hashPassword(plaintext) {
  return bcrypt.hash(plaintext, 12);
}
