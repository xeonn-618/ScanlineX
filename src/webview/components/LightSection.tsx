import React from "react";
import type { ScanlineParams } from "@webview/types/params";
import { DEFAULT_PARAMS } from "@webview/types/params";
import { SliderRow } from "./SliderRow";

interface LightSectionProps {
  params: ScanlineParams;
  updateParam: <K extends keyof ScanlineParams>(key: K, val: ScanlineParams[K]) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export const LightSection: React.FC<LightSectionProps> = ({
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
          2. LIGHT & OPTICS
        </span>
        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
          {collapsed ? "▼" : "▲"}
        </span>
      </div>

      {!collapsed && (
        <div style={{ padding: "0 12px 12px" }}>
          <SliderRow
            label="Glow"
            value={params.glow}
            min={0}
            max={1}
            step={0.01}
            defaultValue={DEFAULT_PARAMS.glow}
            onChange={(v) => updateParam("glow", v)}
          />

          <SliderRow
            label="Soft Spread"
            value={params.soft}
            min={0}
            max={1}
            step={0.01}
            defaultValue={DEFAULT_PARAMS.soft}
            onChange={(v) => updateParam("soft", v)}
          />

          <SliderRow
            label="Chromatic Dispersion"
            value={params.dispersion}
            min={0}
            max={1}
            step={0.01}
            defaultValue={DEFAULT_PARAMS.dispersion}
            onChange={(v) => updateParam("dispersion", v)}
          />

          <SliderRow
            label="Grain (TPDF)"
            value={params.grain}
            min={0}
            max={1}
            step={0.01}
            defaultValue={DEFAULT_PARAMS.grain}
            onChange={(v) => updateParam("grain", v)}
          />
        </div>
      )}
    </section>
  );
};
