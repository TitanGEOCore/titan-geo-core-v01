import { useState, useEffect } from "react";

/**
 * LoadingOverlay — Monochrome Luxury loading overlay with progress.
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
        {/* Spinner */}
        <div style={styles.spinnerContainer}>
          <div style={styles.spinnerOuter}>
            <div style={styles.spinnerInner} />
          </div>
        </div>

        {title && <div style={styles.title}>{title}</div>}
        {currentStep && <div style={styles.currentStep}>{currentStep}{dots}</div>}

        {/* Progress Bar */}
        <div style={styles.progressContainer}>
          <div style={styles.progressTrack}>
            <div style={{ ...styles.progressFill, width: `${clampedProgress}%` }} />
          </div>
          <div style={styles.progressLabel}>{Math.round(clampedProgress)}%</div>
        </div>

        {/* Step List */}
        {steps.length > 0 && (
          <div style={styles.stepList}>
            {steps.map((step, idx) => (
              <div key={idx} style={styles.stepItem(step.status)}>
                <span style={styles.stepIcon(step.status)}>
                  {step.status === "done" ? "\u2713" : step.status === "error" ? "\u2717" : step.status === "active" ? "\u25CF" : "\u25CB"}
                </span>
                <span style={styles.stepLabel(step.status)}>{step.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes titan-loading-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes titan-loading-pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        @keyframes titan-loading-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
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
    background: "rgba(9, 9, 11, 0.75)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 99999,
    padding: "20px",
  },
  card: {
    background: "linear-gradient(145deg, #18181b 0%, #09090b 100%)",
    borderRadius: "24px",
    padding: "40px 36px",
    maxWidth: "480px",
    width: "100%",
    textAlign: "center",
    boxShadow: "0 25px 60px rgba(0, 0, 0, 0.6), 0 0 40px rgba(0, 0, 0, 0.2)",
    border: "1px solid rgba(255, 255, 255, 0.06)",
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
    background: "conic-gradient(from 0deg, #ffffff, #a1a1aa, #3f3f46, #ffffff)",
    animation: "titan-loading-spin 1.2s linear infinite",
  },
  spinnerInner: {
    width: "100%",
    height: "100%",
    borderRadius: "50%",
    background: "#18181b",
  },
  title: {
    fontSize: "20px",
    fontWeight: 700,
    color: "#fafafa",
    marginBottom: "8px",
    letterSpacing: "-0.3px",
  },
  currentStep: {
    fontSize: "14px",
    color: "#a1a1aa",
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
    background: "rgba(255, 255, 255, 0.08)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: "4px",
    background: "linear-gradient(90deg, #3f3f46, #a1a1aa, #d4d4d8)",
    backgroundSize: "200% 100%",
    animation: "titan-loading-shimmer 2s ease-in-out infinite",
    transition: "width 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
  },
  progressLabel: {
    fontSize: "13px",
    fontWeight: 700,
    color: "#d4d4d8",
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
    borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
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
      status === "done" ? "rgba(255, 255, 255, 0.1)"
      : status === "error" ? "rgba(161, 161, 170, 0.15)"
      : status === "active" ? "rgba(255, 255, 255, 0.15)"
      : "rgba(255, 255, 255, 0.04)",
    color:
      status === "done" ? "#fafafa"
      : status === "error" ? "#a1a1aa"
      : status === "active" ? "#d4d4d8"
      : "#52525b",
    ...(status === "active" ? { animation: "titan-loading-pulse 1.5s ease-in-out infinite" } : {}),
  }),
  stepLabel: (status) => ({
    fontSize: "13px",
    color:
      status === "done" ? "#d4d4d8"
      : status === "error" ? "#a1a1aa"
      : status === "active" ? "#fafafa"
      : "#52525b",
    fontWeight: status === "active" ? 600 : 400,
  }),
};
