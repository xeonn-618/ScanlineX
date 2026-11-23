import React, { useEffect, useRef, useState, useCallback } from "react";
import type { ScanlineParams } from "@webview/types/params";
import { DEFAULT_PARAMS, PRESETS } from "@webview/types/params";
import { ScanlineEngine, type ViewportMode } from "./engine/ScanlineEngine";
import { createFallbackImage } from "./engine/fallbackPattern";
import { estimateDepth, type DepthStatus } from "./engine/depthPipeline";
import { sendToUxp } from "./bridge";
import { useScanlineBridge } from "./hooks/useScanlineBridge";
import { AppHeader } from "./components/AppHeader";
import { AppViewport } from "./components/AppViewport";
import { AppFooter } from "./components/AppFooter";
import { InputSection } from "./components/InputSection";
import { LinesSection } from "./components/LinesSection";
import { LightSection } from "./components/LightSection";
import { ColourSection } from "./components/ColourSection";

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

  const [depthStatus, setDepthStatus] = useState<DepthStatus>("idle");
  const [depthProgressText, setDepthProgressText] = useState("");
  const [hasDepth, setHasDepth] = useState(false);
  const cachedDepthBufferRef = useRef<Uint8Array | null>(null);

  const [status, setStatus] = useState<"ready" | "busy" | "error">("ready");
  const [statusText, setStatusText] = useState("Ready");
  const [isApplying, setIsApplying] = useState(false);

  const [collapsed, setCollapsed] = useState({
    input: false,
    depth: false,
    lines: false,
    light: false,
    colour: false,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<ScanlineEngine | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;
  const splitXRef = useRef(splitX);
  splitXRef.current = splitX;

  const updateParam = useCallback(<K extends keyof ScanlineParams>(key: K, val: ScanlineParams[K]) => {
    setParams((prev) => {
      const next = { ...prev, [key]: val };
      if (key === "colorMode") next.pictureColours = val === "picture";
      else if (key === "pictureColours") next.colorMode = val ? "picture" : "solid";
      else if (key === "topographicWarp") next.displacement = val as number;
      else if (key === "contourSmoothness") next.lineSmoothing = val as number;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    try {
      const engine = new ScanlineEngine(canvasRef.current);
      engine.init();
      engineRef.current = engine;
      const fallbackW = 400;
      const fallbackH = 400;
      const fallbackPixels = createFallbackImage(fallbackW, fallbackH);
      engine.uploadSourceTexture(fallbackPixels, fallbackW, fallbackH);
      engine.resize(fallbackW, fallbackH);
      engine.render(paramsRef.current, viewModeRef.current, splitXRef.current);
    } catch (err) {
      console.error("[ScanlineX] WebGL init error:", err);
      setStatus("error");
      setStatusText("WebGL2 Error");
    }
    return () => {
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!engineRef.current) return;
    engineRef.current.render(params, viewMode, splitX);
  }, [params, viewMode, splitX]);

  useScanlineBridge({
    engineRef,
    canvasRef,
    paramsRef,
    viewModeRef,
    splitXRef,
    hasDepth,
    cachedDepthBufferRef,
    setParams,
    setActiveLayer,
    setStatus,
    setStatusText,
    setIsApplying,
  });

  const handleGenerateDepth = async () => {
    const sourcePixels = activeLayer?.pixels || (canvasRef.current ? createFallbackImage(400, 400) : null);
    const w = activeLayer?.width || 400;
    const h = activeLayer?.height || 400;
    if (!sourcePixels || !engineRef.current) return;

    setDepthStatus("loading");
    setDepthProgressText("Initializing WebGPU Depth...");
    try {
      const result = await estimateDepth(sourcePixels, w, h, (_pct, msg) => setDepthProgressText(msg));
      cachedDepthBufferRef.current = result.depthBuffer;
      engineRef.current.uploadDepthTexture(result.depthBuffer, w, h);
      setHasDepth(true);
      setDepthStatus("ready");
      setDepthProgressText("3D Depth Ready");
      setParams((prev) => ({
        ...prev,
        reliefSource: prev.reliefSource === 0 ? 0.8 : prev.reliefSource,
      }));
      engineRef.current.render(paramsRef.current, viewMode, splitX);
    } catch (err) {
      console.error("[ScanlineX] Depth generation failed:", err);
      setDepthStatus("error");
      setDepthProgressText("Depth Estimation Failed");
    }
  };

  const handleClearDepth = () => {
    if (engineRef.current) engineRef.current.clearDepthTexture();
    cachedDepthBufferRef.current = null;
    setHasDepth(false);
    setDepthStatus("idle");
    setDepthProgressText("");
    setParams((prev) => ({ ...prev, reliefSource: 0.0, depthCutoff: 0.0 }));
  };

  const handleApplyClick = () => {
    setIsApplying(true);
    setStatus("busy");
    setStatusText("Reading full document...");
    if (window.uxpHost) {
      sendToUxp({ type: "REQUEST_ACTIVE_LAYER", purpose: "COMMIT" });
    } else {
      setTimeout(() => {
        if (!engineRef.current) return;
        const fallbackW = activeLayer?.width || 800;
        const fallbackH = activeLayer?.height || 800;
        const fallbackPixels = activeLayer?.pixels || createFallbackImage(fallbackW, fallbackH);
        engineRef.current.renderOffscreen(fallbackPixels, fallbackW, fallbackH, paramsRef.current, "composite");
        setIsApplying(false);
        setStatus("ready");
        setStatusText("Rendered Standalone");
        setTimeout(() => setStatusText("Ready"), 2500);
      }, 300);
    }
  };

  const handleSelectPreset = (name: string) => {
    const presetData = PRESETS[name] || customPresets[name];
    if (presetData) {
      setParams((prev) => ({ ...prev, ...presetData, preset: name }));
    }
  };

  const handleSaveCustomPreset = () => {
    const name = window.prompt("Enter name for custom preset:", `Preset ${Object.keys(customPresets).length + 1}`);
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    const updated = { ...customPresets, [trimmed]: { ...params } };
    setCustomPresets(updated);
    try {
      localStorage.setItem("scanlinex_custom_presets", JSON.stringify(updated));
    } catch {}
    setParams((prev) => ({ ...prev, preset: trimmed }));
  };

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
      <AppHeader
        status={status}
        statusText={statusText}
        preset={params.preset}
        customPresets={customPresets}
        onSelectPreset={handleSelectPreset}
        onSaveCustomPreset={handleSaveCustomPreset}
        onResetParams={() => setParams({ ...DEFAULT_PARAMS, ...PRESETS.Mono, preset: "Mono" })}
      />

      <AppViewport
        canvasRef={canvasRef}
        viewportRef={viewportRef}
        viewMode={viewMode}
        onSetViewMode={setViewMode}
        splitX={splitX}
        onWipeMouseDown={handleWipeMouseDown}
        activeLayer={activeLayer}
      />

      <div style={{ flex: 1, overflowY: "auto", backgroundColor: "var(--bg-surface)" }}>
        <InputSection
          params={params}
          updateParam={updateParam}
          collapsed={collapsed.input}
          onToggleCollapse={() => setCollapsed((p) => ({ ...p, input: !p.input }))}
          depthCollapsed={collapsed.depth}
          onToggleDepthCollapse={() => setCollapsed((p) => ({ ...p, depth: !p.depth }))}
          hasDepth={hasDepth}
          depthStatus={depthStatus}
          depthProgressText={depthProgressText}
          onGenerateDepth={handleGenerateDepth}
          onClearDepth={handleClearDepth}
        />

        <LinesSection
          params={params}
          updateParam={updateParam}
          collapsed={collapsed.lines}
          onToggleCollapse={() => setCollapsed((p) => ({ ...p, lines: !p.lines }))}
        />

        <LightSection
          params={params}
          updateParam={updateParam}
          collapsed={collapsed.light}
          onToggleCollapse={() => setCollapsed((p) => ({ ...p, light: !p.light }))}
        />

        <ColourSection
          params={params}
          updateParam={updateParam}
          collapsed={collapsed.colour}
          onToggleCollapse={() => setCollapsed((p) => ({ ...p, colour: !p.colour }))}
        />
      </div>

      <AppFooter
        status={status}
        isApplying={isApplying}
        onRefresh={() => {
          setStatus("busy");
          setStatusText("Fetching Layer...");
          sendToUxp({ type: "REQUEST_ACTIVE_LAYER", maxPreviewDim: 800, purpose: "PREVIEW" });
        }}
        onApply={handleApplyClick}
      />
    </div>
  );
};
