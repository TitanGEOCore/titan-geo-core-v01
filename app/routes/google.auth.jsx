import { redirect } from "@remix-run/node";
import { getGoogleAuthUrl } from "../services/google/auth.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = getGoogleAuthUrl(session.shop);
  return redirect(url);
};
