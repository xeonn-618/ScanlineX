/**
 * ScanlineX — Procedural Fallback Pattern Generator
 */

export function createFallbackImage(w = 400, h = 400): Uint8Array {
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
