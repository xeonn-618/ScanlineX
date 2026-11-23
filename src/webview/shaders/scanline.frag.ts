/**
 * ScanlineX — Pass 1: Continuous Scalar Topographic Isoline Field Fragment Shader
 *
 * Supports Vertical, Horizontal, and Concentric Circles modes with
 * screen-space derivative anti-aliased isolines (fwidth(phase)).
 */

export const FRAG_SCANLINE = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D u_elevation;   // Blurred elevation (R), Sobel (G), alpha (B), luma (A)
uniform sampler2D u_rawLuma;     // Raw conditioned elevation/luma before blur
uniform sampler2D u_source;      // Original image texture
uniform sampler2D u_depth;       // Depth Anything V2 depth texture
uniform int u_hasDepth;          // 1 = depth map available, 0 = luma only
uniform float u_depthCutoff;     // Drops background behind Z-plane [0..1]
uniform vec2 u_resolution;       // Render buffer resolution (width, height)
uniform float u_aspect;          // canvas width / height
uniform int u_direction;         // 0 = vertical, 1 = horizontal, 2 = circles
uniform float u_centerX;         // Concentric circles center X [0..1]
uniform float u_centerY;         // Concentric circles center Y [0..1]
uniform float u_displacement;    // Topographic Warp strength
uniform float u_organicWarp;     // Depth-Driven Flow organic FBM warp
uniform float u_noiseScale;      // FBM spatial frequency
uniform float u_noiseSeed;       // Noise seed
uniform float u_density;         // Isolines density
uniform float u_lineThickness;   // Line thickness factor
uniform float u_pixel;           // Pixel slider [0..100]
uniform float u_pixelQuant;      // Pixelation quantization [0..1] (compat)
uniform float u_cutoff;          // Brightness cutoff threshold
uniform float u_noise;           // Starry dust noise amount
uniform float u_edgeAccent;      // Sobel gradient silhouette boost
uniform float u_detailBoost;     // High-pass surface detail boost
uniform int u_colorMode;         // 0 = Solid Tint, 1 = Gradient Ramp, 2 = Picture Colours
uniform vec3 u_colour;           // Solid tint color
uniform vec3 u_shadowColor;      // Gradient ramp shadow color
uniform vec3 u_peakColor;        // Gradient ramp peak color

in vec2 v_uv;
out vec4 fragColor;

// ─── 2D Simplex Noise & FBM for Organic Depth-Driven Flow ────────────────────
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm(vec2 p) {
  float val = 0.0;
  float amp = 0.55;
  mat2 rot = mat2(1.6, 1.2, -1.2, 1.6);
  val += amp * snoise(p); p = rot * p; amp *= 0.45;
  val += amp * snoise(p); p = rot * p; amp *= 0.45;
  val += amp * snoise(p);
  return val;
}

float hash2(vec2 p, float s) {
  p = fract(p * vec2(234.34 + s * 0.173, 567.89 + s * 0.317));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  if (v_uv.x < 0.0 || v_uv.x > 1.0 || v_uv.y < 0.0 || v_uv.y > 1.0) {
    discard;
  }

  // Active render buffer resolution
  vec2 res = (u_resolution.x > 0.0 && u_resolution.y > 0.0)
    ? u_resolution
    : vec2(max(1.0, u_aspect * 800.0), 800.0);

  // Aspect-corrected 1:1 square grid quantization with smooth quadratic curve
  float pixelVal = max(u_pixel, u_pixelQuant * 100.0);
  float baseDim = min(res.x, res.y);
  float t = clamp(pixelVal / 100.0, 0.0, 1.0);
  float cellPx = mix(1.0, baseDim * 0.032, t * t);

  vec2 cellSizeUV = vec2(cellPx) / res;
  vec2 sampleUV = (pixelVal > 0.001)
    ? clamp((floor(v_uv / cellSizeUV) + 0.5) * cellSizeUV, vec2(0.0), vec2(1.0))
    : v_uv;

  // 1. Sample smoothed elevation field & raw components
  vec4 elevSample = texture(u_elevation, sampleUV);
  float smoothE = elevSample.r;
  float sobelEdge = elevSample.g;
  float alpha = elevSample.b;

  if (alpha < 0.005) {
    discard;
  }

  // 2. High-pass detail boost
  vec4 rawSample = texture(u_rawLuma, sampleUV);
  float rawE = rawSample.r;
  float highPass = rawE - smoothE;
  float E = clamp(smoothE + highPass * (u_detailBoost * 2.2), 0.0, 1.0);

  // 3. Depth Anything V2 Z-plane cutoff
  if (u_hasDepth == 1 && u_depthCutoff > 0.001) {
    float depthVal = texture(u_depth, sampleUV).r;
    if (depthVal < u_depthCutoff) {
      discard;
    }
  }

  // 4. Compute continuous scalar phase field
  float basePhase = 0.0;
  if (u_direction == 0) {
    // Vertical mode
    basePhase = sampleUV.x * u_aspect;
  } else if (u_direction == 1) {
    // Horizontal mode
    basePhase = sampleUV.y;
  } else {
    // Concentric Circles mode
    vec2 center = vec2(u_centerX, u_centerY);
    vec2 delta = (sampleUV - center) * vec2(u_aspect, 1.0);
    basePhase = length(delta);
  }

  // Displace phi using smoothed elevation E and elevation-modulated organic domain warp
  vec2 noiseCoord = sampleUV * u_noiseScale + vec2(u_noiseSeed * 0.173, u_noiseSeed * 0.317);
  float organicNoise = fbm(noiseCoord);
  float warp = E * u_displacement + E * organicNoise * u_organicWarp;
  float phase = (basePhase + warp) * u_density;

  // 5. Razor-sharp isoline evaluation: crisp binary step when pixelated, fwidth AA when smooth
  float lineAlpha = 0.0;
  if (pixelVal > 0.001) {
    float distToLine = abs(fract(phase) - 0.5);
    float cellPhaseStep = (cellPx / res.y) * u_density;
    float nominalHalfWidth = cellPhaseStep * 0.52 * max(0.5, u_lineThickness);
    // Enforce a minimum thickness equal to the cell's phase span (cellPhaseStep * 0.52)
    // so every contour forms a solid, connected staircase of uniform square pixels without gaps.
    float halfWidth = min(max(nominalHalfWidth, cellPhaseStep * 0.52), 0.48);
    lineAlpha = step(distToLine, halfWidth);
  } else {
    float fw = max(0.0001, fwidth(phase));
    float dist = abs(fract(phase) - 0.5) / fw;
    float halfWidth = max(0.2, u_lineThickness * 0.55);
    lineAlpha = clamp(halfWidth - dist + 0.5, 0.0, 1.0);

    // Nyquist anti-flicker suppression
    if (fw > 0.5) {
      lineAlpha *= clamp(1.0 - (fw - 0.5) * 2.0, 0.0, 1.0);
    }
  }

  if (lineAlpha <= 0.001) {
    discard;
  }

  // 6. Cutoff threshold: dissolve or cut dark valleys
  if (E < u_cutoff) {
    float cutoffRatio = E / max(u_cutoff, 0.0001);
    float n = hash2(sampleUV * 180.0, u_noiseSeed);
    float dissolveThresh = (1.0 - cutoffRatio) * (u_noise + 0.1);
    if (n < dissolveThresh * 0.8) {
      discard;
    }
    if (pixelVal > 0.001) {
      if (cutoffRatio < 0.25) {
        discard;
      }
    } else {
      lineAlpha *= cutoffRatio;
    }
  }

  // 7. Seeded 2D starry Dust Noise
  if (u_noise > 0.0) {
    vec2 noiseUV = (pixelVal > 0.001) ? sampleUV : v_uv;
    float nVal = hash2(noiseUV * 320.0, u_noiseSeed + 7.71);
    float mask = 1.0 - u_noise * (1.0 - E * 0.85);
    if (nVal > mask) {
      discard;
    }
  }

  // 8. Color selection: Solid Tint (0) | Gradient Ramp (1) | Picture Colours (2)
  vec3 rgb;
  if (u_colorMode == 2) {
    vec4 srcRaw = texture(u_source, sampleUV);
    rgb = srcRaw.rgb * srcRaw.a;
  } else if (u_colorMode == 1) {
    rgb = mix(u_shadowColor, u_peakColor, E);
  } else {
    rgb = u_colour;
  }

  // Silhouette feature edge accent illumination boost
  if (u_edgeAccent > 0.0) {
    rgb = mix(rgb, rgb * 1.6 + vec3(0.08), sobelEdge * u_edgeAccent * 0.8);
  }

  // Bright ridge illumination enhancement
  float ridgeBoost = smoothstep(0.35, 0.95, E);
  rgb = mix(rgb, rgb * 1.35 + vec3(0.04), ridgeBoost * 0.35);

  float cellAlpha = (pixelVal > 0.001) ? (alpha > 0.2 ? 1.0 : 0.0) : alpha;
  float finalA = clamp(lineAlpha * cellAlpha, 0.0, 1.0);
  if (finalA <= 0.001) {
    discard;
  }

  fragColor = vec4(rgb * finalA, finalA);
}
`;
