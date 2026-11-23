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
uniform float u_pixelQuant;      // Pixelation quantization [0..1]
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

  vec2 uv = v_uv;
  if (u_pixelQuant > 0.0) {
    float steps = mix(1024.0, 16.0, u_pixelQuant);
    uv = (floor(uv * steps) + 0.5) / steps;
  }

  // 1. Sample smoothed elevation field & raw components
  vec4 elevSample = texture(u_elevation, uv);
  float smoothE = elevSample.r;
  float sobelEdge = elevSample.g;
  float alpha = elevSample.b;

  if (alpha < 0.005) {
    discard;
  }

  // 2. High-pass detail boost
  vec4 rawSample = texture(u_rawLuma, uv);
  float rawE = rawSample.r;
  float highPass = rawE - smoothE;
  float E = clamp(smoothE + highPass * (u_detailBoost * 2.2), 0.0, 1.0);

  // 3. Depth Anything V2 Z-plane cutoff
  if (u_hasDepth == 1 && u_depthCutoff > 0.001) {
    float depthVal = texture(u_depth, uv).r;
    if (depthVal < u_depthCutoff) {
      discard;
    }
  }

  // 4. Compute continuous scalar phase field
  float basePhase = 0.0;
  if (u_direction == 0) {
    // Vertical mode
    basePhase = uv.x * u_aspect;
  } else if (u_direction == 1) {
    // Horizontal mode
    basePhase = uv.y;
  } else {
    // Concentric Circles mode
    vec2 center = vec2(u_centerX, u_centerY);
    vec2 delta = (uv - center) * vec2(u_aspect, 1.0);
    basePhase = length(delta);
  }

  // Displace phi using smoothed elevation E and elevation-modulated organic domain warp
  vec2 noiseCoord = uv * u_noiseScale + vec2(u_noiseSeed * 0.173, u_noiseSeed * 0.317);
  float organicNoise = fbm(noiseCoord);
  float warp = E * u_displacement + E * organicNoise * u_organicWarp;
  float phase = (basePhase + warp) * u_density;

  // 5. Razor-sharp, anti-aliased isolines from fwidth(phase)
  float fw = max(0.0001, fwidth(phase));
  float dist = abs(fract(phase) - 0.5) / fw;
  float halfWidth = max(0.2, u_lineThickness * 0.55);
  float lineAlpha = clamp(halfWidth - dist + 0.5, 0.0, 1.0);

  // Nyquist anti-flicker suppression
  if (fw > 0.5) {
    lineAlpha *= clamp(1.0 - (fw - 0.5) * 2.0, 0.0, 1.0);
  }

  if (lineAlpha <= 0.001) {
    discard;
  }

  // 6. Cutoff threshold: dissolve or cut dark valleys
  if (E < u_cutoff) {
    float cutoffRatio = E / max(u_cutoff, 0.0001);
    float n = hash2(uv * 180.0, u_noiseSeed);
    float dissolveThresh = (1.0 - cutoffRatio) * (u_noise + 0.1);
    if (n < dissolveThresh * 0.8) {
      discard;
    }
    lineAlpha *= cutoffRatio;
  }

  // 7. Seeded 2D starry Dust Noise
  if (u_noise > 0.0) {
    float nVal = hash2(uv * 320.0, u_noiseSeed + 7.71);
    float mask = 1.0 - u_noise * (1.0 - E * 0.85);
    if (nVal > mask) {
      discard;
    }
  }

  // 8. Color selection: Solid Tint (0) | Gradient Ramp (1) | Picture Colours (2)
  vec3 rgb;
  if (u_colorMode == 2) {
    vec4 srcRaw = texture(u_source, uv);
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

  float finalA = clamp(lineAlpha * alpha, 0.0, 1.0);
  if (finalA <= 0.001) {
    discard;
  }

  fragColor = vec4(rgb * finalA, finalA);
}
`;
