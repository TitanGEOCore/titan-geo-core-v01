/**
 * TitanHeader — Centralized premium page header component.
 * Monochrome Luxury Design System.
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
      background: "linear-gradient(135deg, #09090b 0%, #18181b 50%, #27272a 100%)",
      borderRadius: "16px",
      padding: "32px 28px",
      marginBottom: "0",
      position: "relative",
      overflow: "hidden",
      border: "1px solid rgba(255, 255, 255, 0.04)",
    }}>
      {/* Decorative glow */}
      <div style={{
        position: "absolute",
        top: "-50%",
        right: "-20%",
        width: "400px",
        height: "400px",
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(161,161,170,0.06) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute",
        bottom: "-40%",
        left: "-10%",
        width: "300px",
        height: "300px",
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(212,212,216,0.04) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
          <h1 style={{
            fontSize: "22px",
            fontWeight: 800,
            color: "#fafafa",
            margin: 0,
            letterSpacing: "-0.5px",
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
              background: "rgba(255,255,255,0.06)",
              color: "#d4d4d8",
              border: "1px solid rgba(255,255,255,0.1)",
            }}>
              {badge}
            </span>
          )}
        </div>
        <p style={{
          fontSize: "14px",
          color: "#a1a1aa",
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
