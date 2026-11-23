import React from "react";
import type { ScanlineParams } from "@webview/types/params";

interface ColourSectionProps {
  params: ScanlineParams;
  updateParam: <K extends keyof ScanlineParams>(key: K, val: ScanlineParams[K]) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const COLOR_CHIPS = [
  { name: "Mono", hex: "#e8e8e8" },
  { name: "Ice", hex: "#7dd3fc" },
  { name: "Phosphor", hex: "#39ff14" },
  { name: "Amber", hex: "#fbbf24" },
  { name: "Neon", hex: "#00ff88" },
];

const GRADIENT_DUOTONES = [
  { name: "Optical Ice", shadow: "#0c1427", peak: "#7dd3fc" },
  { name: "Phosphor Peak", shadow: "#052e16", peak: "#4ade80" },
  { name: "Sunset Amber", shadow: "#3b0764", peak: "#fbbf24" },
  { name: "Cyberpunk", shadow: "#1e1b4b", peak: "#f43f5e" },
];

export const ColourSection: React.FC<ColourSectionProps> = ({
  params,
  updateParam,
  collapsed,
  onToggleCollapse,
}) => {
  return (
    <section
      style={{
        borderBottom: "1px solid var(--border-grid)",
        position: "relative",
      }}
    >
      <div className="swiss-crosshair" style={{ left: "2px", top: "-4px" }} />

      <div
        style={{
          padding: "10px 12px 6px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
        }}
        onClick={onToggleCollapse}
      >
        <span
          style={{
            fontSize: "10.5px",
            fontWeight: 600,
            letterSpacing: "0.08em",
            color: "var(--text-muted)",
          }}
        >
          3. COLOUR & OUTPUT
        </span>
        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
          {collapsed ? "▼" : "▲"}
        </span>
      </div>

      {!collapsed && (
        <div style={{ padding: "0 12px 12px" }}>
          {/* 3-Mode Selector */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              margin: "6px 0 10px",
            }}
          >
            <span style={{ fontSize: "11.5px", color: "var(--text-secondary)" }}>
              Color Mode
            </span>
            <div className="uxp-segmented">
              <button
                className={`uxp-segmented-btn ${params.colorMode === "solid" ? "active" : ""}`}
                onClick={() => updateParam("colorMode", "solid")}
              >
                Solid Tint
              </button>
              <button
                className={`uxp-segmented-btn ${params.colorMode === "gradient" ? "active" : ""}`}
                onClick={() => updateParam("colorMode", "gradient")}
              >
                Gradient Ramp
              </button>
              <button
                className={`uxp-segmented-btn ${params.colorMode === "picture" ? "active" : ""}`}
                onClick={() => updateParam("colorMode", "picture")}
              >
                Picture Colours
              </button>
            </div>
          </div>

          {/* Mode A: Solid Tint */}
          {params.colorMode === "solid" && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "10px",
              }}
            >
              <span style={{ fontSize: "11.5px", color: "var(--text-secondary)" }}>
                Tint Color
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {COLOR_CHIPS.map((chip) => (
                  <div
                    key={chip.name}
                    className={`uxp-swatch-chip ${params.colour.toLowerCase() === chip.hex.toLowerCase() ? "active" : ""}`}
                    style={{ backgroundColor: chip.hex }}
                    onClick={() => updateParam("colour", chip.hex)}
                    title={chip.name}
                  />
                ))}

                <div
                  className="uxp-swatch"
                  style={{ backgroundColor: params.colour }}
                  title="Choose Custom Tint"
                >
                  <input
                    type="color"
                    value={params.colour}
                    onChange={(e) => updateParam("colour", e.target.value)}
                    style={{
                      opacity: 0,
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      cursor: "pointer",
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Mode B: Gradient Ramp */}
          {params.colorMode === "gradient" && (
            <div style={{ marginBottom: "12px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "8px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Shadow:</span>
                  <div
                    className="uxp-swatch"
                    style={{ backgroundColor: params.shadowColor }}
                    title="Shadow Color (Low Relief)"
                  >
                    <input
                      type="color"
                      value={params.shadowColor}
                      onChange={(e) => updateParam("shadowColor", e.target.value)}
                      style={{
                        opacity: 0,
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        cursor: "pointer",
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Peak:</span>
                  <div
                    className="uxp-swatch"
                    style={{ backgroundColor: params.peakColor }}
                    title="Peak Color (High Relief)"
                  >
                    <input
                      type="color"
                      value={params.peakColor}
                      onChange={(e) => updateParam("peakColor", e.target.value)}
                      style={{
                        opacity: 0,
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        cursor: "pointer",
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Gradient Quick Duotone Chips */}
              <div style={{ display: "flex", gap: "6px" }}>
                {GRADIENT_DUOTONES.map((duo) => (
                  <div
                    key={duo.name}
                    onClick={() => {
                      updateParam("shadowColor", duo.shadow);
                      updateParam("peakColor", duo.peak);
                    }}
                    style={{
                      flex: 1,
                      height: "20px",
                      borderRadius: "3px",
                      border: "1px solid var(--border-control)",
                      background: `linear-gradient(to right, ${duo.shadow}, ${duo.peak})`,
                      cursor: "pointer",
                    }}
                    title={duo.name}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Background Swatch vs Transparent */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              margin: "10px 0",
            }}
          >
            <label className="uxp-checkbox-label">
              <input
                type="checkbox"
                className="uxp-checkbox"
                checked={params.transparent}
                onChange={(e) => updateParam("transparent", e.target.checked)}
              />
              <span>Transparent</span>
            </label>

            {!params.transparent && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Background</span>
                <div
                  className="uxp-swatch"
                  style={{ backgroundColor: params.background }}
                  title="Choose Background Color"
                >
                  <input
                    type="color"
                    value={params.background}
                    onChange={(e) => updateParam("background", e.target.value)}
                    style={{
                      opacity: 0,
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      cursor: "pointer",
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Keep As: One Layer vs Lines + Glow */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "12px",
            }}
          >
            <span style={{ fontSize: "11.5px", color: "var(--text-secondary)" }}>
              Keep As
            </span>
            <div className="uxp-segmented">
              <button
                className={`uxp-segmented-btn ${params.keepAs === "one-layer" ? "active" : ""}`}
                onClick={() => updateParam("keepAs", "one-layer")}
              >
                One Layer
              </button>
              <button
                className={`uxp-segmented-btn ${params.keepAs === "lines-glow" ? "active" : ""}`}
                onClick={() => updateParam("keepAs", "lines-glow")}
              >
                Lines + Glow
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
