import React from "react";
import type { ViewportMode } from "../engine/ScanlineEngine";

interface AppViewportProps {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  viewportRef: React.RefObject<HTMLDivElement>;
  viewMode: ViewportMode;
  onSetViewMode: (mode: ViewportMode) => void;
  splitX: number;
  onWipeMouseDown: (e: React.MouseEvent) => void;
  activeLayer: { width: number; height: number; docWidth?: number; docHeight?: number } | null;
}

export const AppViewport: React.FC<AppViewportProps> = ({
  canvasRef,
  viewportRef,
  viewMode,
  onSetViewMode,
  splitX,
  onWipeMouseDown,
  activeLayer,
}) => {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderBottom: "1px solid var(--border-grid)",
        backgroundColor: "var(--bg-canvas)",
        flexShrink: 0,
      }}
    >
      <div
        ref={viewportRef}
        style={{
          position: "relative",
          width: "100%",
          height: "190px",
          backgroundColor: "#000",
          borderRadius: "var(--radius-control)",
          border: "1px solid var(--border-grid)",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />

        <div style={{ position: "absolute", top: "8px", left: "8px", zIndex: 4 }}>
          <div className="uxp-segmented" style={{ background: "rgba(8, 8, 10, 0.85)" }}>
            <button
              className={`uxp-segmented-btn ${viewMode === "composite" ? "active" : ""}`}
              onClick={() => onSetViewMode("composite")}
            >
              Composite
            </button>
            <button
              className={`uxp-segmented-btn ${viewMode === "lines" ? "active" : ""}`}
              onClick={() => onSetViewMode("lines")}
            >
              Lines Only
            </button>
            <button
              className={`uxp-segmented-btn ${viewMode === "split" ? "active" : ""}`}
              onClick={() => onSetViewMode("split")}
            >
              Split
            </button>
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            top: "8px",
            right: "8px",
            zIndex: 4,
            padding: "2px 6px",
            borderRadius: "var(--radius-control)",
            backgroundColor: "rgba(8, 8, 10, 0.88)",
            border: "1px solid var(--border-control)",
            fontSize: "10.5px",
            color: "var(--text-secondary)",
          }}
          className="tabular-nums"
        >
          {activeLayer
            ? `${activeLayer.docWidth || activeLayer.width} × ${activeLayer.docHeight || activeLayer.height}`
            : "Test Pattern"}
        </div>

        {viewMode === "split" && (
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${splitX * 100}%`,
              width: "2px",
              transform: "translateX(-50%)",
              backgroundColor: "#fff",
              cursor: "ew-resize",
              zIndex: 6,
            }}
            onMouseDown={onWipeMouseDown}
          >
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: "18px",
                height: "26px",
                borderRadius: "var(--radius-control)",
                backgroundColor: "var(--bg-canvas)",
                border: "1px solid var(--border-active)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "2px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.6)",
              }}
            >
              <div style={{ width: "1.5px", height: "10px", background: "var(--text-primary)" }} />
              <div style={{ width: "1.5px", height: "10px", background: "var(--text-primary)" }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
