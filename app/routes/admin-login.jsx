import { json, redirect } from "@remix-run/node";
import { useActionData, Form, useNavigation } from "@remix-run/react";
import { useState, useEffect } from "react";
import { createAdminSession, verifyAdminSession, verifyAdminCredentials } from "../admin-session.server";

export const loader = async ({ request }) => {
  const cookieHeader = request.headers.get("Cookie") || "";
  if (verifyAdminSession(cookieHeader)) {
    return redirect("/titan-admin");
  }
  return json({});
};

export const action = async ({ request }) => {
  const formData = await request.formData();
  const email = formData.get("email");
  const password = formData.get("password");

  const result = await verifyAdminCredentials(email, password);

  if (!result.success) {
    return json({ error: result.error }, { status: 401 });
  }

  // Create session token
  const token = crypto.randomUUID();
  createAdminSession(token, {
    email: result.user.email,
    role: result.user.role,
    ip: request.headers.get("x-forwarded-for") || "unknown",
  });

  // Return JSON with Set-Cookie — client will do hard redirect
  // This avoids Remix's client-side fetch race condition with cookies
  return json(
    { success: true, redirectTo: "/titan-admin" },
    {
      headers: {
        "Set-Cookie": `titan_admin_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=86400`,
      },
    }
  );
};

export default function AdminLogin() {
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const [showPassword, setShowPassword] = useState(false);

  // Hard redirect after successful login — ensures cookie is applied first
  useEffect(() => {
    if (actionData?.success && actionData?.redirectTo) {
      window.location.href = actionData.redirectTo;
    }
  }, [actionData]);

  return (
    <div style={{
      minHeight: "100vh",
      background: "#09090b",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    }}>
      {/* Background effects */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse at 30% 20%, rgba(39, 39, 42, 0.4) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(24, 24, 27, 0.5) 0%, transparent 50%)",
      }} />

      <div style={{
        width: "100%",
        maxWidth: "420px",
        position: "relative",
        zIndex: 1,
      }}>
        {/* Logo / Header */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{
            width: "64px", height: "64px", margin: "0 auto 16px",
            background: "#18181b",
            borderRadius: "16px",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "28px",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
          }}>
            <span role="img" aria-label="shield">&#x1F6E1;</span>
          </div>
          <h1 style={{
            fontSize: "24px", fontWeight: 800, color: "#fafafa",
            margin: "0 0 8px",
            letterSpacing: "-0.5px",
          }}>
            Titan GEO Admin
          </h1>
          <p style={{
            fontSize: "14px", color: "#71717a", margin: 0,
          }}>
            Gesch&uuml;tzter Zugang zum Backend
          </p>
        </div>

        {/* Login Card */}
        <div style={{
          background: "rgba(24, 24, 27, 0.9)",
          border: "1px solid rgba(255, 255, 255, 0.06)",
          borderRadius: "20px",
          padding: "36px",
          backdropFilter: "blur(20px)",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.03)",
        }}>
          <Form method="post">
            {/* Error message */}
            {actionData?.error && (
              <div style={{
                background: "rgba(39, 39, 42, 0.8)",
                border: "1px solid rgba(161, 161, 170, 0.2)",
                borderRadius: "12px",
                padding: "12px 16px",
                marginBottom: "24px",
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}>
                <span style={{ fontSize: "16px" }}>&#x26A0;</span>
                <span style={{ color: "#d4d4d8", fontSize: "13px", fontWeight: 500 }}>
                  {actionData.error}
                </span>
              </div>
            )}

            {/* Success message while redirecting */}
            {actionData?.success && (
              <div style={{
                background: "rgba(39, 39, 42, 0.8)",
                border: "1px solid rgba(161, 161, 170, 0.2)",
                borderRadius: "12px",
                padding: "12px 16px",
                marginBottom: "24px",
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}>
                <span style={{ fontSize: "16px" }}>&#x2713;</span>
                <span style={{ color: "#d4d4d8", fontSize: "13px", fontWeight: 500 }}>
                  Anmeldung erfolgreich. Weiterleitung...
                </span>
              </div>
            )}

            {/* E-Mail */}
            <div style={{ marginBottom: "20px" }}>
              <label style={{
                display: "block", fontSize: "13px", fontWeight: 600,
                color: "#a1a1aa", marginBottom: "8px",
                textTransform: "uppercase", letterSpacing: "0.5px",
              }}>
                E-Mail-Adresse
              </label>
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                placeholder="admin@titangeo.de"
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "12px",
                  border: "1px solid rgba(212, 212, 216, 0.3)",
                  background: "rgba(9, 9, 11, 0.6)",
                  color: "#fafafa",
                  fontSize: "14px",
                  outline: "none",
                  transition: "border-color 0.2s, box-shadow 0.2s",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "rgba(212, 212, 216, 0.6)";
                  e.target.style.boxShadow = "0 0 0 3px rgba(212, 212, 216, 0.1)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "rgba(212, 212, 216, 0.3)";
                  e.target.style.boxShadow = "none";
                }}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom: "28px" }}>
              <label style={{
                display: "block", fontSize: "13px", fontWeight: 600,
                color: "#a1a1aa", marginBottom: "8px",
                textTransform: "uppercase", letterSpacing: "0.5px",
              }}>
                Passwort
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  required
                  autoComplete="current-password"
                  placeholder="Passwort eingeben"
                  style={{
                    width: "100%",
                    padding: "12px 48px 12px 16px",
                    borderRadius: "12px",
                    border: "1px solid rgba(212, 212, 216, 0.3)",
                    background: "rgba(9, 9, 11, 0.6)",
                    color: "#fafafa",
                    fontSize: "14px",
                    outline: "none",
                    transition: "border-color 0.2s, box-shadow 0.2s",
                    boxSizing: "border-box",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "rgba(212, 212, 216, 0.6)";
                    e.target.style.boxShadow = "0 0 0 3px rgba(212, 212, 216, 0.1)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "rgba(212, 212, 216, 0.3)";
                    e.target.style.boxShadow = "none";
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute", right: "12px", top: "50%",
                    transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer",
                    color: "#71717a", fontSize: "16px", padding: "4px",
                  }}
                >
                  {showPassword ? "\u{1F441}" : "\u{1F441}\u{FE0F}\u{200D}\u{1F5E8}\u{FE0F}"}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting || actionData?.success}
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: "12px",
                border: "none",
                background: (isSubmitting || actionData?.success) ? "rgba(212, 212, 216, 0.7)" : "#ffffff",
                color: "#09090b",
                fontSize: "15px",
                fontWeight: 700,
                cursor: (isSubmitting || actionData?.success) ? "wait" : "pointer",
                transition: "all 0.2s ease",
                boxShadow: "0 4px 16px rgba(255, 255, 255, 0.06)",
                letterSpacing: "0.3px",
                opacity: isSubmitting ? 0.8 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isSubmitting && !actionData?.success) {
                  e.target.style.transform = "translateY(-1px)";
                  e.target.style.boxShadow = "0 6px 24px rgba(255, 255, 255, 0.1)";
                }
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = "translateY(0)";
                e.target.style.boxShadow = "0 4px 16px rgba(255, 255, 255, 0.06)";
              }}
            >
              {actionData?.success ? "Weiterleitung..." : isSubmitting ? "Anmeldung..." : "Anmelden"}
            </button>
          </Form>

          {/* Hinweis */}
          <div style={{
            marginTop: "24px",
            padding: "12px 16px",
            background: "rgba(255, 255, 255, 0.04)",
            borderRadius: "10px",
            border: "1px solid rgba(255, 255, 255, 0.06)",
          }}>
            <p style={{
              color: "#a1a1aa", fontSize: "12px", margin: 0,
              textAlign: "center", lineHeight: "1.5",
            }}>
              Nur autorisierte Administratoren haben Zugang.
              <br />
              Alle Anmeldeversuche werden protokolliert.
            </p>
          </div>
        </div>

        {/* Footer */}
        <p style={{
          textAlign: "center",
          color: "#52525b",
          fontSize: "12px",
          marginTop: "24px",
        }}>
          Titan GEO Core &mdash; Admin Backend v1.0
        </p>
      </div>
    </div>
  );
}
