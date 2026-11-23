import { useEffect } from "react";
import type { ScanlineParams } from "@webview/types/params";
import type { ScanlineEngine } from "../engine/ScanlineEngine";
import { sendToUxp, onUxpMessage } from "../bridge";

interface UseScanlineBridgeProps {
  engineRef: React.MutableRefObject<ScanlineEngine | null>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  paramsRef: React.MutableRefObject<ScanlineParams>;
  viewModeRef: React.MutableRefObject<"composite" | "lines" | "split">;
  splitXRef: React.MutableRefObject<number>;
  hasDepth: boolean;
  cachedDepthBufferRef: React.MutableRefObject<Uint8Array | null>;
  setParams: React.Dispatch<React.SetStateAction<ScanlineParams>>;
  setActiveLayer: React.Dispatch<React.SetStateAction<{
    width: number;
    height: number;
    pixels: Uint8Array;
    docWidth?: number;
    docHeight?: number;
  } | null>>;
  setStatus: (s: "ready" | "busy" | "error") => void;
  setStatusText: (t: string) => void;
  setIsApplying: (a: boolean) => void;
}

export function useScanlineBridge({
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
}: UseScanlineBridgeProps) {
  const handleFullResCommit = (rawPixels: Uint8Array, docW: number, docH: number) => {
    if (!engineRef.current) return;
    setStatus("busy");
    setStatusText("Processing Full-Res...");

    try {
      const p = paramsRef.current;
      if (hasDepth && cachedDepthBufferRef.current) {
        const prevDepth = cachedDepthBufferRef.current;
        const fullDepth = new Uint8Array(docW * docH);
        const previewW = canvasRef.current?.width || docW;
        const previewH = canvasRef.current?.height || docH;
        for (let y = 0; y < docH; y++) {
          const sy = Math.min(previewH - 1, Math.floor((y / docH) * previewH));
          for (let x = 0; x < docW; x++) {
            const sx = Math.min(previewW - 1, Math.floor((x / docW) * previewW));
            fullDepth[y * docW + x] = prevDepth[sy * previewW + sx];
          }
        }
        engineRef.current.uploadDepthTexture(fullDepth, docW, docH);
      }

      if (p.keepAs === "lines-glow") {
        const glowBuffer = engineRef.current.renderOffscreen(rawPixels, docW, docH, p, "glow");
        sendToUxp({
          type: "COMMIT_LAYER",
          name: "ScanlineX Glow",
          width: docW,
          height: docH,
          blendMode: "screen",
          opacity: Math.round(p.glow * 100),
          buffer: glowBuffer,
        });
        const linesBuffer = engineRef.current.renderOffscreen(rawPixels, docW, docH, p, "lines");
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
        const compositeBuffer = engineRef.current.renderOffscreen(rawPixels, docW, docH, p, "composite");
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

  useEffect(() => {
    const unsubscribe = onUxpMessage((msg) => {
      if (msg.type === "LAYER_PIXELS") {
        if (msg.purpose === "COMMIT") {
          handleFullResCommit(msg.buffer, msg.width, msg.height);
          return;
        }

        let hasCutoutAlpha = false;
        const buf = msg.buffer;
        const stride = Math.max(4, Math.floor(buf.length / 2000) * 4);
        for (let i = 3; i < buf.length; i += stride) {
          if (buf[i] < 240) {
            hasCutoutAlpha = true;
            break;
          }
        }
        if (hasCutoutAlpha) {
          setParams((prev) => (prev.transparent ? prev : { ...prev, transparent: true }));
        }

        setActiveLayer({
          width: msg.width,
          height: msg.height,
          pixels: msg.buffer,
          docWidth: msg.docWidth,
          docHeight: msg.docHeight,
        });

        if (engineRef.current && canvasRef.current) {
          canvasRef.current.width = msg.width;
          canvasRef.current.height = msg.height;
          engineRef.current.uploadSourceTexture(msg.buffer, msg.width, msg.height);
          engineRef.current.resize(msg.width, msg.height);
          engineRef.current.render(paramsRef.current, viewModeRef.current, splitXRef.current);
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
  }, []);
}
