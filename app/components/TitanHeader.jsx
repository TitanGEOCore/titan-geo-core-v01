/**
 * TitanHeader — Centralized premium page header component.
 * Used on every main route for consistent brand identity.
 *
 * @param {string} title - Primary heading
 * @param {string} description - Subtitle / context
 * @param {string} [badge] - Optional badge text (e.g. "Pro", "Beta")
 * @param {string} [badgeTone] - Badge tone: "info" | "success" | "warning" | "critical"
 * @param {React.ReactNode} [children] - Optional extra content below description
 */
export function TitanHeader({ title, description, badge, badgeTone = "info", children }) {
  return (
    <div style={{
      background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #172554 100%)",
      borderRadius: "16px",
      padding: "32px 28px",
      marginBottom: "0",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Decorative glow */}
      <div style={{
        position: "absolute",
        top: "-50%",
        right: "-20%",
        width: "400px",
        height: "400px",
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute",
        bottom: "-40%",
        left: "-10%",
        width: "300px",
        height: "300px",
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
          <h1 style={{
            fontSize: "22px",
            fontWeight: 800,
            color: "#f1f5f9",
            margin: 0,
            letterSpacing: "-0.3px",
            lineHeight: 1.3,
          }}>
            {title}
          </h1>
          {badge && (
            <span style={{
              fontSize: "11px",
              fontWeight: 700,
              padding: "3px 10px",
              borderRadius: "20px",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              background:
                badgeTone === "success" ? "rgba(16,185,129,0.2)" :
                badgeTone === "warning" ? "rgba(245,158,11,0.2)" :
                badgeTone === "critical" ? "rgba(239,68,68,0.2)" :
                "rgba(99,102,241,0.2)",
              color:
                badgeTone === "success" ? "#34d399" :
                badgeTone === "warning" ? "#fbbf24" :
                badgeTone === "critical" ? "#f87171" :
                "#818cf8",
              border: `1px solid ${
                badgeTone === "success" ? "rgba(16,185,129,0.3)" :
                badgeTone === "warning" ? "rgba(245,158,11,0.3)" :
                badgeTone === "critical" ? "rgba(239,68,68,0.3)" :
                "rgba(99,102,241,0.3)"
              }`,
            }}>
              {badge}
            </span>
          )}
        </div>
        <p style={{
          fontSize: "14px",
          color: "#94a3b8",
          margin: 0,
          lineHeight: 1.6,
          maxWidth: "640px",
        }}>
          {description}
        </p>
        {children && <div style={{ marginTop: "12px" }}>{children}</div>}
      </div>
    </div>
  );
}
