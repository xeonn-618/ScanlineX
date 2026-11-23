import React from "react";
import type { ScanlineParams } from "@webview/types/params";
import { DEFAULT_PARAMS } from "@webview/types/params";
import { SliderRow } from "./SliderRow";

interface LinesSectionProps {
  params: ScanlineParams;
  updateParam: <K extends keyof ScanlineParams>(key: K, val: ScanlineParams[K]) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export const LinesSection: React.FC<LinesSectionProps> = ({
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
          1. LINES & TOPOGRAPHIC WARP
        </span>
        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
          {collapsed ? "▼" : "▲"}
        </span>
      </div>

      {!collapsed && (
        <div style={{ padding: "0 12px 12px" }}>
          {/* Direction 3-Mode Segmented Control & Invert Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "8px",
            }}
          >
            <div className="uxp-segmented">
              <button
                className={`uxp-segmented-btn ${params.direction === "vertical" ? "active" : ""}`}
                onClick={() => updateParam("direction", "vertical")}
              >
                Vertical
              </button>
              <button
                className={`uxp-segmented-btn ${params.direction === "horizontal" ? "active" : ""}`}
                onClick={() => updateParam("direction", "horizontal")}
              >
                Horizontal
              </button>
              <button
                className={`uxp-segmented-btn ${params.direction === "circles" ? "active" : ""}`}
                onClick={() => updateParam("direction", "circles")}
              >
                Circles
              </button>
            </div>

            <label className="uxp-checkbox-label">
              <input
                type="checkbox"
                className="uxp-checkbox"
                checked={params.invert}
                onChange={(e) => updateParam("invert", e.target.checked)}
              />
              <span>Invert</span>
            </label>
          </div>

          {/* Concentric Circles Center Coordinates */}
          {params.direction === "circles" && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "10px",
                margin: "4px 0 8px",
                padding: "6px 8px",
                background: "var(--bg-canvas)",
                borderRadius: "var(--radius-control)",
                border: "1px solid var(--border-grid)",
              }}
            >
              <SliderRow
                label="Center X"
                value={params.centerX ?? 0.5}
                min={0.0}
                max={1.0}
                step={0.01}
                defaultValue={DEFAULT_PARAMS.centerX}
                onChange={(v) => updateParam("centerX", v)}
              />
              <SliderRow
                label="Center Y"
                value={params.centerY ?? 0.5}
                min={0.0}
                max={1.0}
                step={0.01}
                defaultValue={DEFAULT_PARAMS.centerY}
                onChange={(v) => updateParam("centerY", v)}
              />
            </div>
          )}

          {/* Density & Contour Smoothness */}
          <SliderRow
            label="Density"
            value={params.density}
            min={20}
            max={350}
            defaultValue={DEFAULT_PARAMS.density}
            onChange={(v) => updateParam("density", v)}
          />

          <SliderRow
            label="Contour Smoothness"
            value={params.contourSmoothness ?? params.lineSmoothing ?? 4.0}
            min={0.0}
            max={15.0}
            step={0.1}
            defaultValue={DEFAULT_PARAMS.contourSmoothness}
            unit="px"
            onChange={(v) => updateParam("contourSmoothness", v)}
          />

          <SliderRow
            label="Topographic Warp"
            value={params.topographicWarp ?? params.displacement ?? 40}
            min={0}
            max={100}
            defaultValue={DEFAULT_PARAMS.topographicWarp}
            onChange={(v) => updateParam("topographicWarp", v)}
          />

          {/* 3D Pitch & Yaw Micro-Grid (-60° to +60°) */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "10px",
              margin: "4px 0",
            }}
          >
            <SliderRow
              label="3D Pitch"
              value={params.tiltPitch}
              min={-60}
              max={60}
              step={1}
              defaultValue={DEFAULT_PARAMS.tiltPitch}
              unit="°"
              onChange={(v) => updateParam("tiltPitch", v)}
            />
            <SliderRow
              label="3D Yaw"
              value={params.tiltYaw}
              min={-60}
              max={60}
              step={1}
              defaultValue={DEFAULT_PARAMS.tiltYaw}
              unit="°"
              onChange={(v) => updateParam("tiltYaw", v)}
            />
          </div>

          <SliderRow
            label="Perspective FOV"
            value={params.perspective}
            min={0.0}
            max={1.5}
            step={0.01}
            defaultValue={DEFAULT_PARAMS.perspective}
            onChange={(v) => updateParam("perspective", v)}
          />

          {/* Depth-Driven Flow & Flow Scale */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "10px",
              margin: "4px 0",
            }}
          >
            <SliderRow
              label="Depth-Driven Flow"
              value={params.depthFlow ?? 20}
              min={0}
              max={100}
              step={1}
              defaultValue={DEFAULT_PARAMS.depthFlow}
              onChange={(v) => updateParam("depthFlow", v)}
            />
            <SliderRow
              label="Flow Scale"
              value={params.flowScale ?? params.noiseScale ?? 12.0}
              min={1.0}
              max={50.0}
              step={0.5}
              defaultValue={DEFAULT_PARAMS.flowScale}
              onChange={(v) => updateParam("flowScale", v)}
            />
          </div>

          {/* Line & Contour Details */}
          <SliderRow
            label="Line Thickness"
            value={params.lineThickness}
            min={0.5}
            max={4.0}
            step={0.1}
            defaultValue={DEFAULT_PARAMS.lineThickness}
            unit="px"
            onChange={(v) => updateParam("lineThickness", v)}
          />

          <SliderRow
            label="Pixel"
            value={params.pixel}
            min={0}
            max={100}
            defaultValue={DEFAULT_PARAMS.pixel}
            onChange={(v) => updateParam("pixel", v)}
          />

          <SliderRow
            label="Cutoff"
            value={params.cutoff}
            min={0}
            max={1}
            step={0.01}
            defaultValue={DEFAULT_PARAMS.cutoff}
            onChange={(v) => updateParam("cutoff", v)}
          />

          <SliderRow
            label="Edge Accent (Sobel Boost)"
            value={params.edgeAccent}
            min={0.0}
            max={1.0}
            step={0.01}
            defaultValue={DEFAULT_PARAMS.edgeAccent}
            onChange={(v) => updateParam("edgeAccent", v)}
          />

          {/* Dust Noise & Seed */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: "8px" }}>
            <div style={{ flex: 1 }}>
              <SliderRow
                label="Dust Noise"
                value={params.noise}
                min={0}
                max={1}
                step={0.01}
                defaultValue={DEFAULT_PARAMS.noise}
                onChange={(v) => updateParam("noise", v)}
              />
            </div>
            <button
              className="uxp-btn uxp-btn-sm"
              style={{ marginBottom: "5px" }}
              onClick={() => updateParam("noiseSeed", Math.floor(Math.random() * 100000))}
              title="Randomize seeded hash noise"
            >
              New Seed
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
