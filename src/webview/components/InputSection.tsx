import React from "react";
import type { ScanlineParams } from "@webview/types/params";
import { DEFAULT_PARAMS } from "@webview/types/params";
import { SliderRow } from "./SliderRow";
import type { DepthStatus } from "../engine/depthPipeline";

interface InputSectionProps {
  params: ScanlineParams;
  updateParam: <K extends keyof ScanlineParams>(key: K, val: ScanlineParams[K]) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  depthCollapsed: boolean;
  onToggleDepthCollapse: () => void;
  hasDepth: boolean;
  depthStatus: DepthStatus;
  depthProgressText: string;
  onGenerateDepth: () => void;
  onClearDepth: () => void;
}

export const InputSection: React.FC<InputSectionProps> = ({
  params,
  updateParam,
  collapsed,
  onToggleCollapse,
  depthCollapsed,
  onToggleDepthCollapse,
  hasDepth,
  depthStatus,
  depthProgressText,
  onGenerateDepth,
  onClearDepth,
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
          0. INPUT & ISOLATION
        </span>
        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
          {collapsed ? "▼" : "▲"}
        </span>
      </div>

      {!collapsed && (
        <div style={{ padding: "0 12px 12px" }}>
          {/* Auto-Normalize Toggle */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "8px",
            }}
          >
            <label className="uxp-checkbox-label">
              <input
                type="checkbox"
                className="uxp-checkbox"
                checked={params.autoNormalize}
                onChange={(e) => updateParam("autoNormalize", e.target.checked)}
              />
              <span>Auto-Normalize Histogram</span>
            </label>
          </div>

          <SliderRow
            label="Input Black"
            value={params.inputBlack}
            min={0.0}
            max={0.9}
            step={0.01}
            defaultValue={DEFAULT_PARAMS.inputBlack}
            onChange={(v) => updateParam("inputBlack", v)}
          />

          <SliderRow
            label="Input White"
            value={params.inputWhite}
            min={0.1}
            max={1.0}
            step={0.01}
            defaultValue={DEFAULT_PARAMS.inputWhite}
            onChange={(v) => updateParam("inputWhite", v)}
          />

          <SliderRow
            label="Gamma"
            value={params.gamma}
            min={0.2}
            max={3.0}
            step={0.01}
            defaultValue={DEFAULT_PARAMS.gamma}
            onChange={(v) => updateParam("gamma", v)}
          />

          {/* Depth Anything V2 Sub-Panel */}
          <div
            style={{
              marginTop: "10px",
              padding: "8px",
              borderRadius: "var(--radius-control)",
              border: "1px solid var(--border-grid)",
              backgroundColor: "var(--bg-canvas)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                cursor: "pointer",
                marginBottom: depthCollapsed ? "0" : "8px",
              }}
              onClick={onToggleDepthCollapse}
            >
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  color: hasDepth ? "var(--accent-glow)" : "var(--text-secondary)",
                }}
              >
                DEPTH ISOLATION {hasDepth && "• ACTIVE"}
              </span>
              <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                {depthCollapsed ? "▼" : "▲"}
              </span>
            </div>

            {!depthCollapsed && (
              <div>
                <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
                  <button
                    className="uxp-btn uxp-btn-sm"
                    style={{ flex: 1 }}
                    disabled={depthStatus === "loading" || depthStatus === "inferring"}
                    onClick={onGenerateDepth}
                  >
                    {depthStatus === "loading" || depthStatus === "inferring"
                      ? "Generating..."
                      : hasDepth
                      ? "Regenerate Depth"
                      : "Generate Depth Map"}
                  </button>

                  {hasDepth && (
                    <button
                      className="uxp-btn uxp-btn-sm"
                      onClick={onClearDepth}
                      title="Clear Depth Map"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {depthProgressText && (
                  <div
                    style={{
                      fontSize: "10px",
                      color: depthStatus === "error" ? "var(--status-err)" : "var(--text-secondary)",
                      marginBottom: "8px",
                    }}
                  >
                    {depthProgressText}
                  </div>
                )}

                <SliderRow
                  label="Depth Cutoff (Z-Plane)"
                  value={params.depthCutoff}
                  min={0.0}
                  max={1.0}
                  step={0.01}
                  defaultValue={DEFAULT_PARAMS.depthCutoff}
                  onChange={(v) => updateParam("depthCutoff", v)}
                />

                <SliderRow
                  label="Relief Source (Luma <-> Depth)"
                  value={params.reliefSource}
                  min={0.0}
                  max={1.0}
                  step={0.01}
                  defaultValue={DEFAULT_PARAMS.reliefSource}
                  onChange={(v) => updateParam("reliefSource", v)}
                />

                <SliderRow
                  label="Detail Boost"
                  value={params.detailBoost}
                  min={0.0}
                  max={1.0}
                  step={0.01}
                  defaultValue={DEFAULT_PARAMS.detailBoost}
                  onChange={(v) => updateParam("detailBoost", v)}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
