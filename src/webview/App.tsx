import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  type ScanlineParams,
  DEFAULT_PARAMS,
  PRESETS,
} from "@shared/params";
import {
  ScanlineRenderer,
  type ViewportMode,
} from "./engine/scanlineRenderer";
import { estimateDepth, type DepthStatus } from "./engine/depthPipeline";
import { sendToUxp, onUxpMessage } from "./bridge";

// ─── Precision Slider Row Component ──────────────────────────────────────────

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue: number;
  unit?: string;
  onChange: (val: number) => void;
}

const SliderRow: React.FC<SliderRowProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  defaultValue,
  unit = "",
  onChange,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editVal, setEditVal] = useState(String(value));

  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));

  const handleCommitEdit = () => {
    setIsEditing(false);
    const parsed = parseFloat(editVal);
    if (!isNaN(parsed)) {
      onChange(Math.max(min, Math.min(max, parsed)));
    }
  };

  return (
    <div className="slider-container" style={{ margin: "3px 0" }}>
      <div className="slider-header">
        <span
          className="slider-label"
          onDoubleClick={() => onChange(defaultValue)}
          title="Double-click to reset"
        >
          {label}
        </span>
        {isEditing ? (
          <input
            type="text"
            className="tabular-nums"
            style={{
              width: "50px",
              height: "18px",
              background: "var(--bg-control)",
              border: "1px solid var(--border-active)",
              borderRadius: "2px",
              color: "var(--text-primary)",
              fontSize: "11px",
              textAlign: "right",
              padding: "0 3px",
            }}
            value={editVal}
            autoFocus
            onChange={(e) => setEditVal(e.target.value)}
            onBlur={handleCommitEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCommitEdit();
              if (e.key === "Escape") setIsEditing(false);
            }}
          />
        ) : (
          <span
            className="slider-val"
            onClick={() => {
              setEditVal(step < 1 ? value.toFixed(2) : String(value));
              setIsEditing(true);
            }}
            onDoubleClick={() => onChange(defaultValue)}
            title="Click to edit, double-click to reset"
          >
            {step < 1 ? value.toFixed(2) : value}
            {unit}
          </span>
        )}
      </div>

      <div
        className="uxp-slider-track"
        onDoubleClick={() => onChange(defaultValue)}
      >
        <div className="uxp-slider-fill" style={{ width: `${pct}%` }} />
        <input
          type="range"
          className="uxp-slider-input"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
      </div>
    </div>
  );
};

// ─── Default Procedural Fallback Pattern ──────────────────────────────────────

function createFallbackImage(w = 400, h = 400): Uint8Array {
  const buf = new Uint8Array(w * h * 4);
  const cx = w * 0.5;
  const cy = h * 0.5;
  const maxR = Math.sqrt(cx * cx + cy * cy);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) / maxR;
      const angle = Math.atan2(dy, dx);

      const ripple = Math.sin(dist * 18.0 - angle * 2.0) * 0.5 + 0.5;
      const vignette = Math.max(0, 1.0 - dist * 0.85);
      const intensity = Math.round((ripple * 0.6 + vignette * 0.4) * 255);

      buf[idx] = intensity;
      buf[idx + 1] = intensity;
      buf[idx + 2] = intensity;
      buf[idx + 3] = 255;
    }
  }
  return buf;
}

// ─── Main App Component ───────────────────────────────────────────────────────

export const App: React.FC = () => {
  const [params, setParams] = useState<ScanlineParams>(() => ({
    ...DEFAULT_PARAMS,
    ...PRESETS.Mono,
    preset: "Mono",
  }));

  const [customPresets, setCustomPresets] = useState<Record<string, Partial<ScanlineParams>>>(() => {
    try {
      const saved = localStorage.getItem("scanlinex_custom_presets");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [viewMode, setViewMode] = useState<ViewportMode>("composite");
  const [splitX, setSplitX] = useState<number>(0.5);
  const [isDraggingWipe, setIsDraggingWipe] = useState(false);

  const [activeLayer, setActiveLayer] = useState<{
    width: number;
    height: number;
    pixels: Uint8Array;
    docWidth?: number;
    docHeight?: number;
  } | null>(null);

  // Depth Estimation State
  const [depthStatus, setDepthStatus] = useState<DepthStatus>("idle");
  const [depthProgressText, setDepthProgressText] = useState("");
  const [hasDepth, setHasDepth] = useState(false);
  const cachedDepthBufferRef = useRef<Uint8Array | null>(null);

  const [status, setStatus] = useState<"ready" | "busy" | "error">("ready");
  const [statusText, setStatusText] = useState("Ready");
  const [isApplying, setIsApplying] = useState(false);

  // Collapsible Sections: 0 (input), depth sub-panel, 1 (lines), 2 (light), 3 (colour)
  const [collapsed, setCollapsed] = useState({
    input: false,
    depth: false,
    lines: false,
    light: false,
    colour: false,
  });

  // Canvas & WebGL Renderer Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<ScanlineRenderer | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const updateParam = useCallback(<K extends keyof ScanlineParams>(key: K, val: ScanlineParams[K]) => {
    setParams((prev) => {
      const next = { ...prev, [key]: val };
      if (key === "colorMode") {
        next.pictureColours = val === "picture";
      } else if (key === "pictureColours") {
        next.colorMode = val ? "picture" : "solid";
      }
      return next;
    });
  }, []);

  // ── 1. WebGL Initialization & Live Render ──────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current) return;
    try {
      const renderer = new ScanlineRenderer(canvasRef.current);
      renderer.init();
      rendererRef.current = renderer;

      const fallbackW = 400;
      const fallbackH = 400;
      const fallbackPixels = createFallbackImage(fallbackW, fallbackH);
      renderer.uploadSourceTexture(fallbackPixels, fallbackW, fallbackH);
      renderer.resize(fallbackW, fallbackH);
      renderer.render(paramsRef.current, viewMode, splitX);
    } catch (err) {
      console.error("[ScanlineX] WebGL init error:", err);
      setStatus("error");
      setStatusText("WebGL2 Error");
    }

    return () => {
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  }, []);

  // Re-render when parameters or viewport mode change
  useEffect(() => {
    if (!rendererRef.current) return;
    rendererRef.current.render(params, viewMode, splitX);
  }, [params, viewMode, splitX]);

  // ── 2. UXP IPC Message Bridge ──────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = onUxpMessage((msg) => {
      if (msg.type === "LAYER_PIXELS") {
        if (msg.purpose === "COMMIT") {
          handleFullResCommit(msg.buffer, msg.width, msg.height);
          return;
        }

        // Preview mode
        setActiveLayer({
          width: msg.width,
          height: msg.height,
          pixels: msg.buffer,
          docWidth: msg.docWidth,
          docHeight: msg.docHeight,
        });

        if (rendererRef.current && canvasRef.current) {
          canvasRef.current.width = msg.width;
          canvasRef.current.height = msg.height;
          rendererRef.current.uploadSourceTexture(msg.buffer, msg.width, msg.height);
          rendererRef.current.resize(msg.width, msg.height);
          rendererRef.current.render(paramsRef.current, viewMode, splitX);
        }

        setStatus("ready");
        setStatusText(`${msg.docWidth || msg.width} × ${msg.docHeight || msg.height}`);
      } else if (msg.type === "COMMIT_DONE") {
        setIsApplying(false);
        setStatus("ready");
        setStatusText("Applied to Layer");
        setTimeout(() => setStatusText("Ready"), 2500);
      } else if (msg.type === "ERROR") {
        setIsApplying(false);
        setStatus("error");
        setStatusText(msg.message || "Photoshop Bridge Error");
      }
    });

    sendToUxp({ type: "REQUEST_ACTIVE_LAYER", maxPreviewDim: 800, purpose: "PREVIEW" });

    return () => unsubscribe();
  }, [viewMode, splitX]);

  // ── 3. Depth Anything V2 Generation ────────────────────────────────────────
  const handleGenerateDepth = async () => {
    const sourcePixels = activeLayer?.pixels || (canvasRef.current ? createFallbackImage(400, 400) : null);
    const w = activeLayer?.width || 400;
    const h = activeLayer?.height || 400;

    if (!sourcePixels || !rendererRef.current) return;

    setDepthStatus("loading");
    setDepthProgressText("Initializing WebGPU Depth...");

    try {
      const result = await estimateDepth(sourcePixels, w, h, (_pct, msg) => {
        setDepthProgressText(msg);
      });

      cachedDepthBufferRef.current = result.depthBuffer;
      rendererRef.current.uploadDepthTexture(result.depthBuffer, w, h);
      setHasDepth(true);
      setDepthStatus("ready");
      setDepthProgressText("3D Depth Ready");

      // Auto-boost relief source to 1.0 so depth is visible immediately
      setParams((prev) => ({
        ...prev,
        reliefSource: prev.reliefSource === 0 ? 0.8 : prev.reliefSource,
      }));

      rendererRef.current.render(paramsRef.current, viewMode, splitX);
    } catch (err) {
      console.error("[ScanlineX] Depth generation failed:", err);
      setDepthStatus("error");
      setDepthProgressText("Depth Estimation Failed");
    }
  };

  const handleClearDepth = () => {
    if (rendererRef.current) {
      rendererRef.current.clearDepthTexture();
    }
    cachedDepthBufferRef.current = null;
    setHasDepth(false);
    setDepthStatus("idle");
    setDepthProgressText("");
    setParams((prev) => ({ ...prev, reliefSource: 0.0, depthCutoff: 0.0 }));
  };

  // ── 4. Apply to Layer (Full-Res Offscreen Commit) ───────────────────────────
  const handleFullResCommit = (rawPixels: Uint8Array, docW: number, docH: number) => {
    if (!rendererRef.current) return;
    setStatus("busy");
    setStatusText("Processing Full-Res...");

    try {
      const p = paramsRef.current;

      // If depth map was used in preview, scale depth map to full resolution for the offscreen run
      if (hasDepth && cachedDepthBufferRef.current && activeLayer) {
        const previewW = activeLayer.width;
        const previewH = activeLayer.height;
        const fullDepth = new Uint8Array(docW * docH);
        const prevDepth = cachedDepthBufferRef.current;

        // Bilinear/nearest scale of depth map to document resolution
        for (let y = 0; y < docH; y++) {
          const sy = Math.min(previewH - 1, Math.floor((y / docH) * previewH));
          for (let x = 0; x < docW; x++) {
            const sx = Math.min(previewW - 1, Math.floor((x / docW) * previewW));
            fullDepth[y * docW + x] = prevDepth[sy * previewW + sx];
          }
        }
        rendererRef.current.uploadDepthTexture(fullDepth, docW, docH);
      }

      if (p.keepAs === "lines-glow") {
        const glowBuffer = rendererRef.current.renderOffscreen(rawPixels, docW, docH, p, "glow");
        sendToUxp({
          type: "COMMIT_LAYER",
          name: "ScanlineX Glow",
          width: docW,
          height: docH,
          blendMode: "screen",
          opacity: Math.round(p.glow * 100),
          buffer: glowBuffer,
        });

        const linesBuffer = rendererRef.current.renderOffscreen(rawPixels, docW, docH, p, "lines");
        sendToUxp({
          type: "COMMIT_LAYER",
          name: "ScanlineX Lines",
          width: docW,
          height: docH,
          blendMode: "normal",
          opacity: 100,
          buffer: linesBuffer,
        });
      } else {
        const compositeBuffer = rendererRef.current.renderOffscreen(rawPixels, docW, docH, p, "composite");
        sendToUxp({
          type: "COMMIT_LAYER",
          name: "ScanlineX",
          width: docW,
          height: docH,
          blendMode: "normal",
          opacity: 100,
          buffer: compositeBuffer,
        });
      }
    } catch (err) {
      console.error("[ScanlineX] Commit error:", err);
      setIsApplying(false);
      setStatus("error");
      setStatusText("Commit Failed");
    }
  };

  const handleApplyClick = () => {
    setIsApplying(true);
    setStatus("busy");
    setStatusText("Reading full document...");

    if (window.uxpHost) {
      sendToUxp({ type: "REQUEST_ACTIVE_LAYER", purpose: "COMMIT" });
    } else {
      setTimeout(() => {
        if (!rendererRef.current) return;
        const fallbackW = activeLayer?.width || 800;
        const fallbackH = activeLayer?.height || 800;
        const fallbackPixels = activeLayer?.pixels || createFallbackImage(fallbackW, fallbackH);

        rendererRef.current.renderOffscreen(
          fallbackPixels,
          fallbackW,
          fallbackH,
          paramsRef.current,
          "composite"
        );
        setIsApplying(false);
        setStatus("ready");
        setStatusText("Rendered Standalone");
        setTimeout(() => setStatusText("Ready"), 2500);
      }, 300);
    }
  };

  const handleRefreshClick = () => {
    setStatus("busy");
    setStatusText("Fetching Layer...");
    sendToUxp({ type: "REQUEST_ACTIVE_LAYER", maxPreviewDim: 800, purpose: "PREVIEW" });
  };

  // ── 5. Presets ──────────────────────────────────────────────────────────────
  const handleSelectPreset = (name: string) => {
    const presetData = PRESETS[name] || customPresets[name];
    if (presetData) {
      setParams((prev) => ({
        ...prev,
        ...presetData,
        preset: name,
      }));
    }
  };

  const handleSaveCustomPreset = () => {
    const name = window.prompt("Enter name for custom preset:", `Preset ${Object.keys(customPresets).length + 1}`);
    if (!name || !name.trim()) return;

    const trimmed = name.trim();
    const updated = {
      ...customPresets,
      [trimmed]: { ...params },
    };
    setCustomPresets(updated);
    try {
      localStorage.setItem("scanlinex_custom_presets", JSON.stringify(updated));
    } catch {}
    setParams((prev) => ({ ...prev, preset: trimmed }));
  };

  const handleResetParams = () => {
    setParams({
      ...DEFAULT_PARAMS,
      ...PRESETS.Mono,
      preset: "Mono",
    });
  };

  // ── 6. Split Wipe Scrubbing ─────────────────────────────────────────────────
  const handleWipeMouseDown = (e: React.MouseEvent) => {
    if (viewMode !== "split") return;
    setIsDraggingWipe(true);
    e.preventDefault();
  };

  useEffect(() => {
    if (!isDraggingWipe) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!viewportRef.current) return;
      const rect = viewportRef.current.getBoundingClientRect();
      const pos = Math.max(0.02, Math.min(0.98, (e.clientX - rect.left) / rect.width));
      setSplitX(pos);
    };

    const handleMouseUp = () => setIsDraggingWipe(false);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingWipe]);

  const colorChips = [
    { name: "Mono", hex: "#e8e8e8" },
    { name: "Ice", hex: "#7dd3fc" },
    { name: "Phosphor", hex: "#39ff14" },
    { name: "Amber", hex: "#fbbf24" },
    { name: "Neon", hex: "#00ff88" },
  ];

  const gradientDuotones = [
    { name: "Optical Ice", shadow: "#0c1427", peak: "#7dd3fc" },
    { name: "Phosphor Peak", shadow: "#052e16", peak: "#4ade80" },
    { name: "Sunset Amber", shadow: "#3b0764", peak: "#fbbf24" },
    { name: "Cyberpunk", shadow: "#1e1b4b", peak: "#f43f5e" },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: "var(--bg-canvas)",
        color: "var(--text-primary)",
      }}
    >
      {/* ── STICKY HEADER BAR ─────────────────────────────────────────────── */}
      <header
        style={{
          height: "46px",
          padding: "0 12px",
          borderBottom: "1px solid var(--border-grid)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: "var(--bg-canvas)",
          flexShrink: 0,
          position: "relative",
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              width: "22px",
              height: "22px",
              borderRadius: "var(--radius-control)",
              border: "1px solid var(--border-control)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              gap: "2px",
              backgroundColor: "var(--bg-control)",
            }}
          >
            <div style={{ width: "12px", height: "1.5px", background: "var(--text-primary)" }} />
            <div style={{ width: "14px", height: "1.5px", background: "var(--accent-glow)" }} />
            <div style={{ width: "10px", height: "1.5px", background: "var(--text-primary)" }} />
          </div>

          <span style={{ fontSize: "13px", fontWeight: 700, letterSpacing: "-0.02em" }}>
            ScanlineX
          </span>

          <div
            title={statusText}
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "var(--radius-status)",
              backgroundColor:
                status === "ready"
                  ? "var(--status-ready)"
                  : status === "busy"
                  ? "var(--status-busy)"
                  : "var(--status-err)",
              transition: "background-color 150ms ease",
            }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <select
            className="uxp-select"
            value={params.preset}
            onChange={(e) => handleSelectPreset(e.target.value)}
          >
            <optgroup label="Default Presets">
              {Object.keys(PRESETS).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </optgroup>
            {Object.keys(customPresets).length > 0 && (
              <optgroup label="Custom Presets">
                {Object.keys(customPresets).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </optgroup>
            )}
          </select>

          <button
            className="uxp-btn uxp-btn-sm"
            onClick={handleSaveCustomPreset}
            title="Save Current as Custom Preset"
          >
            +
          </button>

          <button
            className="uxp-btn uxp-btn-sm"
            onClick={handleResetParams}
            title="Reset to Defaults"
          >
            ↺
          </button>
        </div>
      </header>

      {/* ── LIVE PREVIEW VIEWPORT ─────────────────────────────────────────── */}
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid var(--border-grid)",
          backgroundColor: "var(--bg-canvas)",
          flexShrink: 0,
          position: "relative",
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
          <canvas
            ref={canvasRef}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              display: "block",
            }}
          />

          {/* Top-Left View Mode Toggle */}
          <div
            style={{
              position: "absolute",
              top: "8px",
              left: "8px",
              zIndex: 4,
            }}
          >
            <div className="uxp-segmented" style={{ background: "rgba(8, 8, 10, 0.85)" }}>
              <button
                className={`uxp-segmented-btn ${viewMode === "composite" ? "active" : ""}`}
                onClick={() => setViewMode("composite")}
              >
                Composite
              </button>
              <button
                className={`uxp-segmented-btn ${viewMode === "lines" ? "active" : ""}`}
                onClick={() => setViewMode("lines")}
              >
                Lines Only
              </button>
              <button
                className={`uxp-segmented-btn ${viewMode === "split" ? "active" : ""}`}
                onClick={() => setViewMode("split")}
              >
                Split
              </button>
            </div>
          </div>

          {/* Top-Right Dimension / Fit Badge */}
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

          {/* Draggable Split Screen Wipe Handle */}
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
              onMouseDown={handleWipeMouseDown}
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

      {/* ── SCROLLABLE PARAMETERS GRID ────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          backgroundColor: "var(--bg-surface)",
        }}
      >
        {/* SECTION 0: INPUT & ISOLATION */}
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
            onClick={() => setCollapsed((p) => ({ ...p, input: !p.input }))}
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
              {collapsed.input ? "▼" : "▲"}
            </span>
          </div>

          {!collapsed.input && (
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

              {/* Collapsible Depth Anything V2 Sub-Panel */}
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
                    marginBottom: collapsed.depth ? "0" : "8px",
                  }}
                  onClick={() => setCollapsed((p) => ({ ...p, depth: !p.depth }))}
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
                    {collapsed.depth ? "▼" : "▲"}
                  </span>
                </div>

                {!collapsed.depth && (
                  <div>
                    <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
                      <button
                        className="uxp-btn uxp-btn-sm"
                        style={{ flex: 1 }}
                        disabled={depthStatus === "loading" || depthStatus === "inferring"}
                        onClick={handleGenerateDepth}
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
                          onClick={handleClearDepth}
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
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* SECTION 1: LINES */}
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
            onClick={() => setCollapsed((p) => ({ ...p, lines: !p.lines }))}
          >
            <span
              style={{
                fontSize: "10.5px",
                fontWeight: 600,
                letterSpacing: "0.08em",
                color: "var(--text-muted)",
              }}
            >
              1. LINES
            </span>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              {collapsed.lines ? "▼" : "▲"}
            </span>
          </div>

          {!collapsed.lines && (
            <div style={{ padding: "0 12px 12px" }}>
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
                    className={`uxp-segmented-btn ${params.direction === "horizontal" ? "active" : ""}`}
                    onClick={() => updateParam("direction", "horizontal")}
                  >
                    Horizontal
                  </button>
                  <button
                    className={`uxp-segmented-btn ${params.direction === "vertical" ? "active" : ""}`}
                    onClick={() => updateParam("direction", "vertical")}
                  >
                    Vertical
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

              <SliderRow
                label="Density"
                value={params.density}
                min={20}
                max={400}
                defaultValue={DEFAULT_PARAMS.density}
                onChange={(v) => updateParam("density", v)}
              />

              <SliderRow
                label="Displacement"
                value={params.displacement}
                min={0}
                max={100}
                defaultValue={DEFAULT_PARAMS.displacement}
                onChange={(v) => updateParam("displacement", v)}
              />

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
                label="Edge Accent (Sobel Boost)"
                value={params.edgeAccent}
                min={0.0}
                max={1.0}
                step={0.01}
                defaultValue={DEFAULT_PARAMS.edgeAccent}
                onChange={(v) => updateParam("edgeAccent", v)}
              />

              {/* 3D Tilt Perspective Micro-Row (2-Columns) */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "10px",
                  margin: "4px 0",
                }}
              >
                <SliderRow
                  label="Tilt Pitch"
                  value={params.tiltPitch}
                  min={-45}
                  max={45}
                  step={1}
                  defaultValue={DEFAULT_PARAMS.tiltPitch}
                  unit="°"
                  onChange={(v) => updateParam("tiltPitch", v)}
                />
                <SliderRow
                  label="Tilt Yaw"
                  value={params.tiltYaw}
                  min={-45}
                  max={45}
                  step={1}
                  defaultValue={DEFAULT_PARAMS.tiltYaw}
                  unit="°"
                  onChange={(v) => updateParam("tiltYaw", v)}
                />
              </div>

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

              <div style={{ display: "flex", alignItems: "flex-end", gap: "8px" }}>
                <div style={{ flex: 1 }}>
                  <SliderRow
                    label="Noise"
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

        {/* SECTION 2: LIGHT & OPTICS */}
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
            onClick={() => setCollapsed((p) => ({ ...p, light: !p.light }))}
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
              {collapsed.light ? "▼" : "▲"}
            </span>
          </div>

          {!collapsed.light && (
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

        {/* SECTION 3: COLOUR & OUTPUT */}
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
            onClick={() => setCollapsed((p) => ({ ...p, colour: !p.colour }))}
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
              {collapsed.colour ? "▼" : "▲"}
            </span>
          </div>

          {!collapsed.colour && (
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
                    {colorChips.map((chip) => (
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
                    {gradientDuotones.map((duo) => (
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
      </div>

      {/* ── STICKY BOTTOM ACTION BAR ──────────────────────────────────────── */}
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
          onClick={handleRefreshClick}
          disabled={status === "busy" || isApplying}
          title="Fetch pixels from active Photoshop document"
        >
          Refresh Layer
        </button>

        <button
          className="uxp-cta-primary"
          style={{ flex: 1 }}
          onClick={handleApplyClick}
          disabled={status === "busy" || isApplying}
          title="Render full resolution offscreen and commit to Photoshop layer"
        >
          {isApplying ? "Applying..." : "Apply to Layer"}
        </button>
      </footer>
    </div>
  );
};
