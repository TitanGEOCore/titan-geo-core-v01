import { redirect } from "@remix-run/node";
import { verifyAdminSession, getAdminSessions } from "./admin-login";

// Re-export session utilities so existing imports from "./app.admin-login" keep working
export { verifyAdminSession, getAdminSessions };

// If user hits /app/admin-login (nested under Shopify auth), redirect to standalone login
export const loader = async ({ request }) => {
  const cookieHeader = request.headers.get("Cookie") || "";
  if (verifyAdminSession(cookieHeader)) {
    return redirect("/app/admin");
  }
  return redirect("/admin-login");
};

// Forward any POST to the standalone route as well
export const action = async () => {
  return redirect("/admin-login");
};

export default function AppAdminLoginRedirect() {
  return null;
}
