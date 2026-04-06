import { useState, useEffect } from "react";

/**
 * LoadingOverlay — Wiederverwendbares Lade-Overlay mit Fortschrittsanzeige.
 *
 * Props:
 *   isOpen      {boolean}  — Overlay sichtbar/unsichtbar
 *   title       {string}   — Haupttitel (z.B. "Shop wird übersetzt...")
 *   currentStep {string}   — Aktueller Schritt-Text (z.B. "Analysiere Produkt 3 von 17...")
 *   progress    {number}   — Fortschritt 0–100
 *   steps       {Array<{label: string, status: "pending"|"active"|"done"|"error"}>}
 *
 * Beispiel-Verwendung in einer Route:
 *
 *   import LoadingOverlay from "../components/LoadingOverlay";
 *
 *   // Im Component:
 *   const [loadingState, setLoadingState] = useState({
 *     isOpen: false,
 *     title: "",
 *     currentStep: "",
 *     progress: 0,
 *     steps: [],
 *   });
 *
 *   // Starten:
 *   setLoadingState({
 *     isOpen: true,
 *     title: "Kompletten Shop übersetzen",
 *     currentStep: "Übersetze Produkt 1 von 17...",
 *     progress: 6,
 *     steps: [
 *       { label: "Produkte laden", status: "done" },
 *       { label: "Produkt 1 übersetzen", status: "active" },
 *       { label: "Produkt 2 übersetzen", status: "pending" },
 *     ],
 *   });
 *
 *   // Im JSX:
 *   <LoadingOverlay {...loadingState} />
 */
export default function LoadingOverlay({ isOpen, title, currentStep, progress = 0, steps = [] }) {
  const [dots, setDots] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setDots(d => d.length >= 3 ? "" : d + ".");
    }, 500);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const clampedProgress = Math.max(0, Math.min(100, progress));

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        {/* Animated Gradient Spinner */}
        <div style={styles.spinnerContainer}>
          <div style={styles.spinnerOuter}>
            <div style={styles.spinnerInner} />
          </div>
        </div>

        {/* Title */}
        {title && (
          <div style={styles.title}>{title}</div>
        )}

        {/* Current Step Text */}
        {currentStep && (
          <div style={styles.currentStep}>{currentStep}{dots}</div>
        )}

        {/* Progress Bar */}
        <div style={styles.progressContainer}>
          <div style={styles.progressTrack}>
            <div style={{
              ...styles.progressFill,
              width: `${clampedProgress}%`,
            }} />
          </div>
          <div style={styles.progressLabel}>{Math.round(clampedProgress)}%</div>
        </div>

        {/* Step List */}
        {steps.length > 0 && (
          <div style={styles.stepList}>
            {steps.map((step, idx) => (
              <div key={idx} style={styles.stepItem(step.status)}>
                <span style={styles.stepIcon(step.status)}>
                  {step.status === "done" ? "✓" : step.status === "error" ? "✗" : step.status === "active" ? "●" : "○"}
                </span>
                <span style={styles.stepLabel(step.status)}>{step.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CSS Keyframes via style tag */}
      <style>{`
        @keyframes titan-loading-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes titan-loading-pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        @keyframes titan-loading-gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes titan-loading-fadein {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0, 0, 0, 0.7)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 99999,
    padding: "20px",
  },
  card: {
    background: "linear-gradient(145deg, #1e1b4b 0%, #1f2937 50%, #111827 100%)",
    borderRadius: "24px",
    padding: "40px 36px",
    maxWidth: "480px",
    width: "100%",
    textAlign: "center",
    boxShadow: "0 25px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(99, 102, 241, 0.15)",
    border: "1px solid rgba(99, 102, 241, 0.2)",
    animation: "titan-loading-fadein 0.3s ease-out",
  },
  spinnerContainer: {
    display: "flex",
    justifyContent: "center",
    marginBottom: "24px",
  },
  spinnerOuter: {
    width: "56px",
    height: "56px",
    borderRadius: "50%",
    padding: "3px",
    background: "conic-gradient(from 0deg, #6366f1, #06b6d4, #10b981, #6366f1)",
    animation: "titan-loading-spin 1.2s linear infinite",
  },
  spinnerInner: {
    width: "100%",
    height: "100%",
    borderRadius: "50%",
    background: "#1e1b4b",
  },
  title: {
    fontSize: "20px",
    fontWeight: 700,
    color: "#fff",
    marginBottom: "8px",
    letterSpacing: "0.3px",
  },
  currentStep: {
    fontSize: "14px",
    color: "#94a3b8",
    marginBottom: "24px",
    minHeight: "20px",
    animation: "titan-loading-pulse 2s ease-in-out infinite",
  },
  progressContainer: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "24px",
  },
  progressTrack: {
    flex: 1,
    height: "8px",
    borderRadius: "4px",
    background: "rgba(255, 255, 255, 0.1)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: "4px",
    background: "linear-gradient(90deg, #6366f1, #06b6d4, #10b981)",
    backgroundSize: "200% 100%",
    animation: "titan-loading-gradient 2s ease-in-out infinite",
    transition: "width 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
  },
  progressLabel: {
    fontSize: "13px",
    fontWeight: 700,
    color: "#06b6d4",
    minWidth: "40px",
    textAlign: "right",
  },
  stepList: {
    textAlign: "left",
    maxHeight: "200px",
    overflowY: "auto",
    paddingRight: "4px",
  },
  stepItem: (status) => ({
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "6px 0",
    borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
    opacity: status === "pending" ? 0.4 : 1,
    transition: "opacity 0.3s ease",
  }),
  stepIcon: (status) => ({
    width: "18px",
    height: "18px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "10px",
    fontWeight: 700,
    flexShrink: 0,
    background:
      status === "done" ? "rgba(16, 185, 129, 0.2)"
      : status === "error" ? "rgba(239, 68, 68, 0.2)"
      : status === "active" ? "rgba(99, 102, 241, 0.3)"
      : "rgba(255, 255, 255, 0.05)",
    color:
      status === "done" ? "#10b981"
      : status === "error" ? "#ef4444"
      : status === "active" ? "#818cf8"
      : "#64748b",
    ...(status === "active" ? { animation: "titan-loading-pulse 1.5s ease-in-out infinite" } : {}),
  }),
  stepLabel: (status) => ({
    fontSize: "13px",
    color:
      status === "done" ? "#6ee7b7"
      : status === "error" ? "#fca5a5"
      : status === "active" ? "#c7d2fe"
      : "#64748b",
    fontWeight: status === "active" ? 600 : 400,
    textDecoration: status === "done" ? "none" : "none",
  }),
};
