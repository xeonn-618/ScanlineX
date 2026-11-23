import React from "react";

interface AppFooterProps {
  status: "ready" | "busy" | "error";
  isApplying: boolean;
  onRefresh: () => void;
  onApply: () => void;
}

export const AppFooter: React.FC<AppFooterProps> = ({
  status,
  isApplying,
  onRefresh,
  onApply,
}) => {
  return (
    <footer
      style={{
        padding: "10px 12px",
        borderTop: "1px solid var(--border-grid)",
        backgroundColor: "var(--bg-canvas)",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        flexShrink: 0,
        position: "relative",
        zIndex: 10,
      }}
    >
      <button
        className="uxp-cta-secondary"
        onClick={onRefresh}
        disabled={status === "busy" || isApplying}
        title="Fetch pixels from active Photoshop document"
      >
        Refresh Layer
      </button>
      <button
        className="uxp-cta-primary"
        style={{ flex: 1 }}
        onClick={onApply}
        disabled={status === "busy" || isApplying}
        title="Render full resolution offscreen and commit to Photoshop layer"
      >
        {isApplying ? "Applying..." : "Apply to Layer"}
      </button>
    </footer>
  );
};
