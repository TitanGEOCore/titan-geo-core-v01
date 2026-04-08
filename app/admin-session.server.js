/**
 * Admin session management (server-only).
 * In-memory session store — in production, consider Redis or DB.
 */
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
