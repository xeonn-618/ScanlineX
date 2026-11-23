/* eslint-disable */
const { app, core, imaging } = require("photoshop");

const webview = document.getElementById("app-view");

// ── 1. Base64 Serialization Helpers ──────────────────────────────────────────
const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function uint8ToBase64(bytes) {
  if (typeof btoa === "function") {
    try {
      let binary = "";
      const len = bytes.length;
      const chunkSize = 16384;
      for (let i = 0; i < len; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
      }
      return btoa(binary);
    } catch (e) {}
  }

  let base64 = "";
  const len = bytes.length;
  const byteRemainder = len % 3;
  const mainLength = len - byteRemainder;

  for (let i = 0; i < mainLength; i += 3) {
    const chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    base64 += B64_CHARS[(chunk & 16515072) >> 18] +
              B64_CHARS[(chunk & 258048) >> 12] +
              B64_CHARS[(chunk & 4032) >> 6] +
              B64_CHARS[chunk & 63];
  }

  if (byteRemainder === 1) {
    const chunk = bytes[mainLength];
    base64 += B64_CHARS[(chunk & 252) >> 2] + B64_CHARS[(chunk & 3) << 4] + "==";
  } else if (byteRemainder === 2) {
    const chunk = (bytes[mainLength] << 8) | bytes[mainLength + 1];
    base64 += B64_CHARS[(chunk & 64512) >> 10] +
              B64_CHARS[(chunk & 1008) >> 4] +
              B64_CHARS[(chunk & 15) << 2] + "=";
  }

  return base64;
}

function base64ToUint8(base64) {
  if (typeof atob === "function") {
    try {
      const binary = atob(base64);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    } catch (e) {}
  }

  const lookup = new Uint8Array(256);
  for (let i = 0; i < B64_CHARS.length; i++) {
    lookup[B64_CHARS.charCodeAt(i)] = i;
  }

  let bufferLength = base64.length * 0.75;
  if (base64[base64.length - 1] === "=") {
    bufferLength--;
    if (base64[base64.length - 2] === "=") bufferLength--;
  }

  const bytes = new Uint8Array(bufferLength);
  let p = 0;
  for (let i = 0; i < base64.length; i += 4) {
    const encoded1 = lookup[base64.charCodeAt(i)];
    const encoded2 = lookup[base64.charCodeAt(i + 1)];
    const encoded3 = lookup[base64.charCodeAt(i + 2)];
    const encoded4 = lookup[base64.charCodeAt(i + 3)];

    bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
    if (base64[i + 2] !== "=") bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
    if (base64[i + 3] !== "=") bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
  }

  return bytes;
}

function sendToWebView(payload) {
  try {
    const target = webview || document.getElementById("app-view");
    if (target && typeof target.postMessage === "function") {
      target.postMessage(payload);
    }
  } catch (err) {
    console.error("[Host] sendToWebView failed:", err);
  }
}

// ── 2. Deduplication Guard & In-Flight Mutex ─────────────────────────────────
const processedMessageIds = new Set();
let lastSignature = "";
let lastTime = 0;

let isFetchingLayerHost = false;
let lastHostFetchCompletedTime = 0;
const HOST_FETCH_COOLDOWN_MS = 1500;

function isDuplicate(msg) {
  if (!msg || typeof msg !== "object") return true;

  if (msg._msgId) {
    if (processedMessageIds.has(msg._msgId)) return true;
    processedMessageIds.add(msg._msgId);
    if (processedMessageIds.size > 200) {
      const oldest = processedMessageIds.values().next().value;
      processedMessageIds.delete(oldest);
    }
    return false;
  }

  try {
    const sig = msg.type + "_" + JSON.stringify(msg);
    const now = Date.now();
    if (sig === lastSignature && now - lastTime < 300) return true;
    lastSignature = sig;
    lastTime = now;
    return false;
  } catch {
    return false;
  }
}

// ── 3. Central Message Handler ───────────────────────────────────────────────
async function handle(rawMsg) {
  let msg = rawMsg;
  if (typeof rawMsg === "string") {
    try { msg = JSON.parse(rawMsg); } catch {}
  }
  if (!msg || typeof msg !== "object" || !msg.type) return;
  if (isDuplicate(msg)) return;

  // ── REQUEST_ACTIVE_LAYER ──────────────────────────────────────────────────
  if (msg.type === "REQUEST_ACTIVE_LAYER") {
    const now = Date.now();
    if (isFetchingLayerHost) {
      console.warn("[Host] REQUEST_ACTIVE_LAYER dropped: layer fetch already in-flight");
      return;
    }
    if (msg.purpose !== "COMMIT" && now - lastHostFetchCompletedTime < HOST_FETCH_COOLDOWN_MS) {
      console.warn(
        `[Host] REQUEST_ACTIVE_LAYER dropped: cooldown active (${HOST_FETCH_COOLDOWN_MS - (now - lastHostFetchCompletedTime)}ms remaining)`
      );
      return;
    }

    isFetchingLayerHost = true;
    try {
      const doc = app.activeDocument;
      if (!doc) throw new Error("No active document found in Photoshop.");
      if (!doc.activeLayers || !doc.activeLayers.length) throw new Error("No active layer selected.");

      const layer = doc.activeLayers[0];
      const docW = typeof doc.width === "number" ? doc.width : Math.round(Number(doc.width) || 1000);
      const docH = typeof doc.height === "number" ? doc.height : Math.round(Number(doc.height) || 1000);

      await core.executeAsModal(
        async () => {
          const opts = {
            layerID: layer.id,
            componentSize: 8,
            colorSpace: "RGB",
            applyAlpha: true,
            sourceBounds: { left: 0, top: 0, right: docW, bottom: docH },
          };

          const pixelObj = await imaging.getPixels(opts);
          const rawData = await pixelObj.imageData.getData();
          let channels = pixelObj.imageData.components;
          const blockW = pixelObj.imageData.width;
          const blockH = pixelObj.imageData.height;

          // Normalize to 4 channels RGBA
          let blockData = rawData;
          if (channels === 3) {
            const pixelCount = blockW * blockH;
            const rgba = new Uint8Array(pixelCount * 4);
            for (let i = 0, j = 0; i < pixelCount; i++, j += 3) {
              const dest = i * 4;
              rgba[dest]     = rawData[j];
              rgba[dest + 1] = rawData[j + 1];
              rgba[dest + 2] = rawData[j + 2];
              rgba[dest + 3] = 255;
            }
            blockData = rgba;
            channels = 4;
          }

          // Extract bounding box offset inside document
          const sb = pixelObj.sourceBounds || pixelObj.imageData.sourceBounds || layer.bounds;
          let left = 0;
          let top = 0;
          if (sb) {
            left = Math.round(Number(sb.left?._value ?? sb.left) || 0);
            top = Math.round(Number(sb.top?._value ?? sb.top) || 0);
          }

          // Allocate full-document buffer initialized to all zeros (0, 0, 0, 0)
          const fullCanvas = new Uint8Array(docW * docH * 4);

          // Blit returned sourceBounds pixel block into its exact (left, top) offset inside fullCanvas
          for (let y = 0; y < blockH; y++) {
            const dstY = top + y;
            if (dstY >= 0 && dstY < docH) {
              const srcRow = y * blockW * 4;
              const dstRow = (dstY * docW + left) * 4;
              const copyBytes = Math.min(blockW, Math.max(0, docW - left)) * 4;
              if (copyBytes > 0) {
                fullCanvas.set(blockData.subarray(srcRow, srcRow + copyBytes), dstRow);
              }
            }
          }

          // Downsample fullCanvas for fast preview if requested
          let outPixels = fullCanvas;
          let outW = docW;
          let outH = docH;

          if (msg.maxPreviewDim && Math.max(docW, docH) > msg.maxPreviewDim) {
            const scale = msg.maxPreviewDim / Math.max(docW, docH);
            outW = Math.max(1, Math.round(docW * scale));
            outH = Math.max(1, Math.round(docH * scale));
            outPixels = new Uint8Array(outW * outH * 4);
            const stepX = docW / outW;
            const stepY = docH / outH;
            for (let py = 0; py < outH; py++) {
              const sy = Math.min(docH - 1, Math.floor(py * stepY));
              const sRow = sy * docW * 4;
              const dRow = py * outW * 4;
              for (let px = 0; px < outW; px++) {
                const sx = Math.min(docW - 1, Math.floor(px * stepX));
                const sIdx = sRow + sx * 4;
                const dIdx = dRow + px * 4;
                outPixels[dIdx]     = fullCanvas[sIdx];
                outPixels[dIdx + 1] = fullCanvas[sIdx + 1];
                outPixels[dIdx + 2] = fullCanvas[sIdx + 2];
                outPixels[dIdx + 3] = fullCanvas[sIdx + 3];
              }
            }
          }

          const base64 = uint8ToBase64(outPixels);

          sendToWebView({
            type: "LAYER_PIXELS",
            width: outW,
            height: outH,
            channels: 4,
            base64,
            purpose: msg.purpose || (msg.maxPreviewDim ? "PREVIEW" : "COMMIT"),
            docWidth: docW,
            docHeight: docH,
          });

          pixelObj.imageData.dispose();
        },
        { commandName: "Read Layer Pixels", interactive: false }
      );
    } catch (err) {
      console.error("[Host] REQUEST_ACTIVE_LAYER error:", err);
      sendToWebView({
        type: "ERROR",
        message: err ? (err.message || String(err)) : "Failed to read layer pixels",
      });
    } finally {
      isFetchingLayerHost = false;
      lastHostFetchCompletedTime = Date.now();
    }
  }

  // ── COMMIT_LAYER ──────────────────────────────────────────────────────────
  if (msg.type === "COMMIT_LAYER") {
    try {
      await core.executeAsModal(
        async () => {
          const doc = app.activeDocument;
          if (!doc) throw new Error("No active document found in Photoshop.");

          const docW = typeof doc.width === "number" ? doc.width : Math.round(Number(doc.width) || msg.width);
          const docH = typeof doc.height === "number" ? doc.height : Math.round(Number(doc.height) || msg.height);

          const newLayer = await doc.createLayer({
            name: msg.name || "ScanlineX",
            opacity: msg.opacity ?? 100,
            blendMode: msg.blendMode || "normal",
          });

          let uint8;
          if (msg.base64) {
            uint8 = base64ToUint8(msg.base64);
          } else if (typeof msg.buffer === "string") {
            uint8 = base64ToUint8(msg.buffer);
          } else if (msg.buffer instanceof ArrayBuffer) {
            uint8 = new Uint8Array(msg.buffer);
          } else if (ArrayBuffer.isView(msg.buffer)) {
            uint8 = new Uint8Array(msg.buffer.buffer, msg.buffer.byteOffset, msg.buffer.byteLength);
          } else {
            throw new Error("Missing or invalid buffer for COMMIT_LAYER");
          }

          const imageData = await imaging.createImageDataFromBuffer(uint8, {
            width: msg.width,
            height: msg.height,
            components: 4,
            colorSpace: "RGB",
          });

          const targetBounds = { left: 0, top: 0, right: docW, bottom: docH };

          await imaging.putPixels({
            layerID: newLayer.id,
            imageData: imageData,
            targetBounds: targetBounds,
          });
          imageData.dispose();
        },
        { commandName: `Apply ${msg.name || "ScanlineX"}` }
      );

      sendToWebView({ type: "COMMIT_DONE" });
    } catch (err) {
      console.error("[Host] COMMIT_LAYER error:", err);
      sendToWebView({
        type: "ERROR",
        message: err ? (err.message || String(err)) : "Failed to apply layer",
      });
    }
  }
}

// ── 4. Dual Event Listeners ──────────────────────────────────────────────────
window.addEventListener("message", (e) => handle(e.data));

if (webview) {
  webview.addEventListener("message", (e) => handle(e.message ?? e.data));
} else {
  document.addEventListener("DOMContentLoaded", () => {
    const view = document.getElementById("app-view");
    if (view) view.addEventListener("message", (e) => handle(e.message ?? e.data));
  });
}
