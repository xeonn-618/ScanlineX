/**
 * Depth Anything V2 Small On-Demand Inference Pipeline
 *
 * Runs locally inside the WebView using @huggingface/transformers.
 * Prioritizes WebGPU for hardware acceleration with automatic WASM fallback.
 * Only loaded dynamically when the user clicks "Generate Depth Map".
 */

export interface DepthResult {
  depthBuffer: Uint8Array;
  width: number;
  height: number;
}

export type DepthStatus = "idle" | "loading" | "inferring" | "ready" | "error";

let depthPipelineInstance: any = null;
let isInitializing = false;

/**
 * Initializes and caches the Depth Anything V2 Small pipeline.
 * Dynamically imports @huggingface/transformers so initial bundle startup remains instant.
 */
export async function getDepthPipeline(onProgress?: (progress: number, text: string) => void): Promise<any> {
  if (depthPipelineInstance) return depthPipelineInstance;
  if (isInitializing) {
    while (isInitializing) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return depthPipelineInstance;
  }

  isInitializing = true;
  try {
    onProgress?.(0.1, "Loading Transformers Engine...");
    const { pipeline, env } = await import("@huggingface/transformers");

    // Configure model loading
    env.allowLocalModels = false;

    // Try WebGPU first, then fallback to WASM
    try {
      onProgress?.(0.3, "Initializing WebGPU Pipeline...");
      depthPipelineInstance = await pipeline(
        "depth-estimation",
        "onnx-community/Depth-Anything-V2-Small",
        {
          device: "webgpu",
          progress_callback: (info: any) => {
            if (info?.status === "progress" && info.total) {
              const p = 0.3 + (info.loaded / info.total) * 0.5;
              onProgress?.(p, `Downloading Model: ${Math.round((info.loaded / info.total) * 100)}%`);
            }
          },
        }
      );
    } catch (webgpuErr) {
      console.warn("[DepthPipeline] WebGPU init failed, falling back to WASM:", webgpuErr);
      onProgress?.(0.4, "Falling back to WASM Pipeline...");
      depthPipelineInstance = await pipeline(
        "depth-estimation",
        "onnx-community/Depth-Anything-V2-Small",
        {
          device: "wasm",
          progress_callback: (info: any) => {
            if (info?.status === "progress" && info.total) {
              const p = 0.4 + (info.loaded / info.total) * 0.4;
              onProgress?.(p, `Downloading Model: ${Math.round((info.loaded / info.total) * 100)}%`);
            }
          },
        }
      );
    }

    onProgress?.(0.9, "Depth Model Ready");
    return depthPipelineInstance;
  } catch (err) {
    console.error("[DepthPipeline] Failed to load Depth Anything V2:", err);
    throw err;
  } finally {
    isInitializing = false;
  }
}

/**
 * Executes Depth Estimation on given RGBA pixel buffer.
 */
export async function estimateDepth(
  pixels: Uint8Array,
  width: number,
  height: number,
  onProgress?: (progress: number, text: string) => void
): Promise<DepthResult> {
  // Create an offscreen canvas to feed standard ImageData into the transformer pipeline
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const imgData = ctx.createImageData(width, height);
  imgData.data.set(pixels);
  ctx.putImageData(imgData, 0, 0);

  try {
    const pipe = await getDepthPipeline(onProgress);
    onProgress?.(0.92, "Inferring 3D Depth Map...");

    // Convert canvas to image data URL for pipeline input
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    const output = await pipe(dataUrl);

    // Output contains a depth canvas / raw depth data
    if (output && output.depth) {
      const depthImage = output.depth;
      const depthCanvas = document.createElement("canvas");
      depthCanvas.width = width;
      depthCanvas.height = height;
      const depthCtx = depthCanvas.getContext("2d")!;

      // Draw the depth image scaled to the original dimensions
      if (typeof depthImage.toCanvas === "function") {
        const tempCanvas = depthImage.toCanvas();
        depthCtx.drawImage(tempCanvas, 0, 0, width, height);
      } else if (depthImage instanceof HTMLCanvasElement || depthImage instanceof ImageBitmap) {
        depthCtx.drawImage(depthImage, 0, 0, width, height);
      } else {
        // Fallback: extract raw channel data
        const rawData = depthCtx.createImageData(width, height);
        const depthData = depthImage.data;
        for (let i = 0; i < width * height; i++) {
          const val = depthData ? depthData[i] : 128;
          const idx = i * 4;
          rawData.data[idx] = val;
          rawData.data[idx + 1] = val;
          rawData.data[idx + 2] = val;
          rawData.data[idx + 3] = 255;
        }
        depthCtx.putImageData(rawData, 0, 0);
      }

      const finalData = depthCtx.getImageData(0, 0, width, height).data;
      const depthBuffer = new Uint8Array(width * height);
      for (let i = 0; i < width * height; i++) {
        depthBuffer[i] = finalData[i * 4]; // R channel is depth
      }

      return { depthBuffer, width, height };
    }

    throw new Error("Depth estimation produced empty output");
  } catch (err) {
    console.warn("[DepthPipeline] Model inference failed, synthesizing optical depth fallback:", err);
    // Optical gradient depth fallback: luminance + radial center weighting
    const depthBuffer = new Uint8Array(width * height);
    const cx = width * 0.5;
    const cy = height * 0.5;
    const maxDist = Math.sqrt(cx * cx + cy * cy);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x);
        const pi = i * 4;
        const a = pixels[pi + 3] / 255;
        const lum = (pixels[pi] * 0.2126 + pixels[pi + 1] * 0.7152 + pixels[pi + 2] * 0.0722) / 255;
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / maxDist;
        const opticalDepth = Math.round(Math.max(0, Math.min(255, (lum * 0.7 + (1.0 - dist) * 0.3) * a * 255)));
        depthBuffer[i] = opticalDepth;
      }
    }
    return { depthBuffer, width, height };
  }
}
