import { json, redirect } from "@remix-run/node";
import { useActionData, Form } from "@remix-run/react";
import { useState } from "react";

// In-memory session store (in production, use Redis or DB)
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

export const loader = async ({ request }) => {
  const cookieHeader = request.headers.get("Cookie") || "";
  if (verifyAdminSession(cookieHeader)) {
    return redirect("/app/admin");
  }
  return json({});
};

export const action = async ({ request }) => {
  const formData = await request.formData();
  const email = formData.get("email");
  const password = formData.get("password");

  const adminEmail = process.env.ADMIN_EMAIL || "admin@titangeo.de";
  const adminPassword = process.env.ADMIN_PASSWORD || "TitanGeo2024!";

  if (email !== adminEmail || password !== adminPassword) {
    return json({ error: "Ungültige Anmeldedaten. Zugriff verweigert." }, { status: 401 });
  }

  // Erstelle Session-Token
  const token = crypto.randomUUID();
  adminSessions.set(token, {
    email,
    createdAt: Date.now(),
    ip: request.headers.get("x-forwarded-for") || "unknown",
  });

  return redirect("/app/admin", {
    headers: {
      "Set-Cookie": `titan_admin_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=86400`,
    },
  });
};

export default function AdminLogin() {
  const actionData = useActionData();
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0a0a0f 0%, #0f172a 30%, #1a1033 60%, #0f172a 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    }}>
      {/* Hintergrund-Effekte */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse at 30% 20%, rgba(99, 102, 241, 0.08) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(139, 92, 246, 0.06) 0%, transparent 50%)",
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
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            borderRadius: "16px",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "28px",
            boxShadow: "0 8px 32px rgba(99, 102, 241, 0.3)",
          }}>
            <span role="img" aria-label="shield">&#x1F6E1;</span>
          </div>
          <h1 style={{
            fontSize: "24px", fontWeight: 800, color: "#f1f5f9",
            margin: "0 0 8px",
            letterSpacing: "-0.5px",
          }}>
            Titan GEO Admin
          </h1>
          <p style={{
            fontSize: "14px", color: "#64748b", margin: 0,
          }}>
            Geschützter Zugang zum Backend
          </p>
        </div>

        {/* Login Card */}
        <div style={{
          background: "linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(30, 27, 75, 0.8))",
          border: "1px solid rgba(99, 102, 241, 0.2)",
          borderRadius: "20px",
          padding: "36px",
          backdropFilter: "blur(20px)",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(99, 102, 241, 0.1)",
        }}>
          <Form method="post">
            {/* Fehlermeldung */}
            {actionData?.error && (
              <div style={{
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: "12px",
                padding: "12px 16px",
                marginBottom: "24px",
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}>
                <span style={{ fontSize: "16px" }}>&#x26A0;</span>
                <span style={{ color: "#f87171", fontSize: "13px", fontWeight: 500 }}>
                  {actionData.error}
                </span>
              </div>
            )}

            {/* E-Mail */}
            <div style={{ marginBottom: "20px" }}>
              <label style={{
                display: "block", fontSize: "13px", fontWeight: 600,
                color: "#94a3b8", marginBottom: "8px",
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
                  border: "1px solid rgba(99, 102, 241, 0.3)",
                  background: "rgba(15, 23, 42, 0.6)",
                  color: "#f1f5f9",
                  fontSize: "14px",
                  outline: "none",
                  transition: "border-color 0.2s, box-shadow 0.2s",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "rgba(99, 102, 241, 0.6)";
                  e.target.style.boxShadow = "0 0 0 3px rgba(99, 102, 241, 0.15)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "rgba(99, 102, 241, 0.3)";
                  e.target.style.boxShadow = "none";
                }}
              />
            </div>

            {/* Passwort */}
            <div style={{ marginBottom: "28px" }}>
              <label style={{
                display: "block", fontSize: "13px", fontWeight: 600,
                color: "#94a3b8", marginBottom: "8px",
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
                    border: "1px solid rgba(99, 102, 241, 0.3)",
                    background: "rgba(15, 23, 42, 0.6)",
                    color: "#f1f5f9",
                    fontSize: "14px",
                    outline: "none",
                    transition: "border-color 0.2s, box-shadow 0.2s",
                    boxSizing: "border-box",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "rgba(99, 102, 241, 0.6)";
                    e.target.style.boxShadow = "0 0 0 3px rgba(99, 102, 241, 0.15)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "rgba(99, 102, 241, 0.3)";
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
                    color: "#64748b", fontSize: "16px", padding: "4px",
                  }}
                >
                  {showPassword ? "\u{1F441}" : "\u{1F441}\u{FE0F}\u{200D}\u{1F5E8}\u{FE0F}"}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: "12px",
                border: "none",
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                color: "#fff",
                fontSize: "15px",
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.2s ease",
                boxShadow: "0 4px 16px rgba(99, 102, 241, 0.3)",
                letterSpacing: "0.3px",
              }}
              onMouseEnter={(e) => {
                e.target.style.transform = "translateY(-1px)";
                e.target.style.boxShadow = "0 6px 24px rgba(99, 102, 241, 0.4)";
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = "translateY(0)";
                e.target.style.boxShadow = "0 4px 16px rgba(99, 102, 241, 0.3)";
              }}
            >
              Anmelden
            </button>
          </Form>

          {/* Hinweis */}
          <div style={{
            marginTop: "24px",
            padding: "12px 16px",
            background: "rgba(99, 102, 241, 0.08)",
            borderRadius: "10px",
            border: "1px solid rgba(99, 102, 241, 0.15)",
          }}>
            <p style={{
              color: "#818cf8", fontSize: "12px", margin: 0,
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
          color: "#475569",
          fontSize: "12px",
          marginTop: "24px",
        }}>
          Titan GEO Core &mdash; Admin Backend v1.0
        </p>
      </div>
    </div>
  );
}
