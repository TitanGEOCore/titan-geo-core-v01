import { redirect } from "@remix-run/node";
import { handleGoogleCallback } from "../services/google/auth.server";

const ERROR_MESSAGES = {
  access_denied: "Zugriff wurde vom Nutzer verweigert. Bitte erneut versuchen und den Zugriff erlauben.",
  missing_params: "Fehlende Parameter in der Antwort von Google. Bitte erneut versuchen.",
  invalid_scope: "Ungültige Berechtigungen angefragt. Bitte kontaktiere den Support.",
};

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state"); // shop domain
  const error = url.searchParams.get("error");

  if (error) {
    console.error("Google OAuth Fehler:", error);
    const message = ERROR_MESSAGES[error] || `Google-Fehler: ${error}`;
    return redirect(`/app/settings?googleError=${encodeURIComponent(message)}`);
  }

  if (!code || !state) {
    return redirect(
      `/app/settings?googleError=${encodeURIComponent(ERROR_MESSAGES.missing_params)}`
    );
  }

  try {
    await handleGoogleCallback(code, state);
    return redirect(`/app/settings?googleSuccess=true`);
  } catch (err) {
    console.error("Google Callback Fehler:", err);
    return redirect(
      `/app/settings?googleError=${encodeURIComponent(err.message)}`
    );
  }
};
