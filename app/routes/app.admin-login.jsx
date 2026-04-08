import { redirect } from "@remix-run/node";
import { verifyAdminSession } from "../admin-session.server";

// If user hits /app/admin-login (nested under Shopify auth), redirect to standalone login
export const loader = async ({ request }) => {
  const cookieHeader = request.headers.get("Cookie") || "";
  if (verifyAdminSession(cookieHeader)) {
    return redirect("/titan-admin");
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
