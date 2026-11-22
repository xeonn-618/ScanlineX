/**
 * ScanlineX — Advanced Multi-pass WebGL2 Rutt-Etra Scanline Engine
 *
 * Upgraded Pipeline:
 * - Pass 0 : Input Conditioning (Alpha mask multiplication, Auto-Normalize, Input Black/White, Gamma)
 *            + 3x3 Sobel silhouette edge extraction + Separable Gaussian pre-blur.
 * - Pass 1 : 3D Vertex Displacement with Depth Anything V2 3D Relief, Z-plane Depth Cutoff,
 *            Line Thickness, 3D Tilt Pitch/Yaw perspective projection, and sub-pixel anti-aliasing.
 * - Pass 2 : 4-level RGBA16F Dual-Kawase bloom downsample pyramid.
 * - Pass 3 : 4-level RGBA16F Dual-Kawase bloom upsample pyramid + RGB chromatic dispersion.
 * - Pass 4 : Composite pass with 3-Mode Color (Solid Tint, Gradient Ramp, Picture Colours),
 *            TPDF film grain, Background/Transparent toggle, Viewport modes, and offscreen commit.
 */

import type { ScanlineParams } from "@shared/params";

export type ViewportMode = "composite" | "lines" | "split";
export type OffscreenTarget = "composite" | "glow" | "lines";

// ─── Shader Sources ───────────────────────────────────────────────────────────

const VERT_QUAD = /* glsl */ `#version 300 es
precision highp float;
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Pass 0A: Input Conditioning + Sobel Feature Extraction
const FRAG_INPUT_CONDITION = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D u_source;
uniform vec2 u_texelSize;
uniform float u_inputBlack;
uniform float u_inputWhite;
uniform float u_gamma;
uniform int u_autoNorm;
uniform float u_normMin;
uniform float u_normMax;

in vec2 v_uv;
out vec4 fragColor;

float getConditionedLuma(vec2 uv) {
  vec4 s = texture(u_source, uv);
  // Strictly respect Photoshop layer alpha / active layer mask
  s.rgb *= s.a;
  float luma = dot(s.rgb, vec3(0.2126, 0.7152, 0.0722)) * s.a;

  // Auto-Normalize histogram if enabled
  if (u_autoNorm == 1) {
    luma = clamp((luma - u_normMin) / max(0.001, u_normMax - u_normMin), 0.0, 1.0);
  }

  // Input Black & White Level adjustment
  float range = max(0.001, u_inputWhite - u_inputBlack);
  luma = clamp((luma - u_inputBlack) / range, 0.0, 1.0);

  // Gamma correction
  luma = pow(luma, 1.0 / max(0.01, u_gamma));
  return luma;
}

void main() {
  vec2 d = u_texelSize;
  float c = getConditionedLuma(v_uv);

  // 3x3 Sobel gradient kernel for silhouette feature edge accents
  float tl = getConditionedLuma(v_uv + vec2(-d.x, -d.y));
  float tc = getConditionedLuma(v_uv + vec2( 0.0, -d.y));
  float tr = getConditionedLuma(v_uv + vec2( d.x, -d.y));
  float ml = getConditionedLuma(v_uv + vec2(-d.x,  0.0));
  float mr = getConditionedLuma(v_uv + vec2( d.x,  0.0));
  float bl = getConditionedLuma(v_uv + vec2(-d.x,  d.y));
  float bc = getConditionedLuma(v_uv + vec2( 0.0,  d.y));
  float br = getConditionedLuma(v_uv + vec2( d.x,  d.y));

  float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
  float gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;
  float sobelEdge = clamp(sqrt(gx * gx + gy * gy) * 1.8, 0.0, 1.0);

  float srcAlpha = texture(u_source, v_uv).a;

  // Channel R: conditioned luminance, Channel G: Sobel edge accent, Channel B: alpha
  fragColor = vec4(c, sobelEdge, srcAlpha, 1.0);
}`;

// Pass 0B: Separable Gaussian Pre-Blur (Horizontal)
const FRAG_BLUR_H = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_texelSize;
uniform float u_radius;
in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec4 c = vec4(0.0);
  float weights[5] = float[](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
  c += texture(u_tex, v_uv) * weights[0];
  for (int i = 1; i < 5; i++) {
    vec2 off = vec2(float(i) * u_texelSize.x * u_radius, 0.0);
    c += texture(u_tex, v_uv + off) * weights[i];
    c += texture(u_tex, v_uv - off) * weights[i];
  }
  fragColor = c;
}`;

// Pass 0C: Separable Gaussian Pre-Blur (Vertical)
const FRAG_BLUR_V = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_texelSize;
uniform float u_radius;
in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec4 c = vec4(0.0);
  float weights[5] = float[](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
  c += texture(u_tex, v_uv) * weights[0];
  for (int i = 1; i < 5; i++) {
    vec2 off = vec2(0.0, float(i) * u_texelSize.y * u_radius);
    c += texture(u_tex, v_uv + off) * weights[i];
    c += texture(u_tex, v_uv - off) * weights[i];
  }
  fragColor = c;
}`;

// Pass 1: Rutt-Etra Scanline Vertex Displacement + 3D Tilt + Depth Anything V2 3D Relief
const VERT_SCANLINE = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D u_luma;      // Pass 0 blurred conditioned luma (R) + Sobel edge (G)
uniform sampler2D u_depth;     // Depth Anything V2 depth texture (R)
uniform int u_hasDepth;        // 1 = depth map available, 0 = luma only
uniform float u_depthCutoff;   // Drops background behind Z-plane [0..1]
uniform float u_reliefSource;  // 0.0 = 100% Luma <-> 1.0 = 100% 3D Depth
uniform float u_density;       // Number of scanlines (20-400)
uniform float u_displacement;  // Relief height [0..1]
uniform float u_pixelQuant;    // Pixelation quantization [0..1]
uniform float u_direction;     // 0 = horizontal, 1 = vertical
uniform int u_invert;          // 0 or 1 polarity invert
uniform float u_lineThickness; // 0.5 - 4.0 line thickness factor
uniform float u_edgeAccent;    // Sobel gradient silhouette boost [0..1]
uniform float u_tiltPitch;     // Pitch angle in radians (-45 to +45 deg)
uniform float u_tiltYaw;       // Yaw angle in radians (-45 to +45 deg)

in float a_lineIdx;
in float a_t;
in float a_side;

out vec2 v_uv;
out float v_luma;
out float v_relief;
out float v_edge;
out float v_side;
out float v_lineT;
out float v_depthCut;

void main() {
  float n = u_density;
  float progress = (a_lineIdx + 0.5) / n;

  // Quantize coordinate along the line if pixelation is active
  float tSample = a_t;
  if (u_pixelQuant > 0.0) {
    float steps = mix(1024.0, 16.0, u_pixelQuant);
    tSample = (floor(a_t * steps) + 0.5) / steps;
  }

  vec2 sampleUV;
  if (u_direction < 0.5) {
    sampleUV = vec2(tSample, progress);
  } else {
    sampleUV = vec2(progress, tSample);
  }

  // Sample conditioned luminance (R) and Sobel edge (G)
  vec4 lumaSample = texture(u_luma, sampleUV);
  float lum = lumaSample.r;
  float edge = lumaSample.g;
  if (u_invert == 1) {
    lum = 1.0 - lum;
  }

  // Sample Depth Anything V2 map if loaded
  float depthVal = lum;
  float isCut = 0.0;
  if (u_hasDepth == 1) {
    depthVal = texture(u_depth, sampleUV).r;
    if (u_depthCutoff > 0.001) {
      if (depthVal < u_depthCutoff) {
        isCut = 1.0;
        depthVal = 0.0;
        lum = 0.0;
      }
    }
  }

  // Blend relief source: 0% Luminance <-> 100% 3D Depth
  float reliefVal = mix(lum, depthVal, u_reliefSource);

  // Boost relief with Sobel silhouette edge accent
  reliefVal += edge * u_edgeAccent * 0.35;

  // Rutt-Etra 3D relief displacement
  float disp = reliefVal * u_displacement * 0.45;

  // Strip half-width scaled by line thickness
  float halfWidth = (1.0 / n) * 0.65 * u_lineThickness;

  // 3D coordinates before camera tilt
  float x0, y0, z0;
  if (u_direction < 0.5) {
    x0 = a_t * 2.0 - 1.0;
    float yBase = 1.0 - progress * 2.0;
    y0 = yBase + halfWidth * a_side;
    z0 = disp;
  } else {
    float xBase = progress * 2.0 - 1.0;
    x0 = xBase + halfWidth * a_side;
    y0 = 1.0 - a_t * 2.0;
    z0 = disp;
  }

  // ── Pseudo-3D Perspective Tilt (Pitch around X, Yaw around Y) ───────────────
  // 1. Pitch rotation around X axis
  float cosP = cos(u_tiltPitch);
  float sinP = sin(u_tiltPitch);
  float y1 = y0 * cosP - z0 * sinP;
  float z1 = y0 * sinP + z0 * cosP;

  // 2. Yaw rotation around Y axis
  float cosY = cos(u_tiltYaw);
  float sinY = sin(u_tiltYaw);
  float x1 = x0 * cosY + z1 * sinY;
  float z2 = -x0 * sinY + z1 * cosY;

  // 3. Perspective Projection
  float fov = 2.4;
  float wProj = max(0.2, 1.0 + z2 / fov);
  vec4 projPos = vec4(x1 / wProj, y1 / wProj, z2 * 0.08, 1.0);

  v_uv = sampleUV;
  v_luma = lum;
  v_relief = clamp(reliefVal, 0.0, 1.0);
  v_edge = edge;
  v_side = a_side;
  v_lineT = a_t;
  v_depthCut = isCut;

  gl_Position = projPos;
}`;

// Pass 1: Scanline Fragment Shader (Color Modes, AA edges, Cutoff, Noise, Edge Boost)
const FRAG_SCANLINE = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D u_source;     // Original image texture
uniform float u_cutoff;         // Brightness thresholding
uniform float u_noise;          // Seeded noise amount
uniform float u_noiseSeed;      // Seed value
uniform float u_pixelQuant;     // Pixelation factor
uniform int u_colorMode;        // 0 = Solid Tint, 1 = Gradient Ramp, 2 = Picture Colours
uniform vec3 u_colour;          // Solid tint color
uniform vec3 u_shadowColor;     // Gradient ramp shadow color
uniform vec3 u_peakColor;       // Gradient ramp peak color
uniform float u_edgeAccent;     // Silhouette edge boost

in vec2 v_uv;
in float v_luma;
in float v_relief;
in float v_edge;
in float v_side;
in float v_lineT;
in float v_depthCut;

out vec4 fragColor;

float hash2(vec2 p, float s) {
  p = fract(p * vec2(234.34 + s * 0.173, 567.89 + s * 0.317));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  // If behind Z-plane depth cutoff, completely drop pixel
  if (v_depthCut > 0.5) {
    discard;
  }

  vec2 uv = v_uv;
  if (u_pixelQuant > 0.0) {
    float steps = mix(1024.0, 16.0, u_pixelQuant);
    uv = (floor(uv * steps) + 0.5) / steps;
  }

  float lum = v_luma;

  // Sub-pixel anti-aliasing across strip width
  float edgeAA = smoothstep(1.0, 0.22, abs(v_side));

  // Cutoff brightness thresholding: dissolve dark valleys
  if (lum < u_cutoff) {
    float n = hash2(uv * 180.0, u_noiseSeed);
    float cutoffRatio = lum / max(u_cutoff, 0.0001);
    float dissolveThresh = (1.0 - cutoffRatio) * (u_noise + 0.1);
    if (n < dissolveThresh * 0.8) {
      discard;
    }
    lum *= cutoffRatio;
  }

  // Seeded noise scattering
  if (u_noise > 0.0) {
    float nVal = hash2(uv * 320.0 + vec2(v_lineT, v_side), u_noiseSeed + 7.71);
    float mask = 1.0 - u_noise * (1.0 - lum * 0.85);
    if (nVal > mask) {
      discard;
    }
  }

  // Color selection: Solid Tint (0) | Gradient Ramp (1) | Picture Colours (2)
  vec3 rgb;
  if (u_colorMode == 2) {
    rgb = texture(u_source, uv).rgb;
  } else if (u_colorMode == 1) {
    // Gradient Ramp between Shadow and Peak colors based on elevation relief
    rgb = mix(u_shadowColor, u_peakColor, v_relief);
  } else {
    // Solid Tint
    rgb = u_colour * lum;
  }

  // Silhouette feature edge accent illumination boost
  if (u_edgeAccent > 0.0) {
    rgb = mix(rgb, rgb * 1.6 + vec3(0.08), v_edge * u_edgeAccent * 0.8);
  }

  // Bright ridge illumination enhancement
  float ridgeBoost = smoothstep(0.35, 0.95, lum);
  rgb = mix(rgb, rgb * 1.5 + vec3(0.04), ridgeBoost * 0.35);

  float alpha = clamp(lum * edgeAA, 0.0, 1.0);
  fragColor = vec4(rgb * edgeAA, alpha);
}`;

// Pass 2: Dual-Kawase Downsample
const FRAG_KAWASE_DOWN = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_texelSize;
uniform float u_spread;
in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec2 h = u_texelSize * u_spread * 0.5;
  vec4 c =  texture(u_tex, v_uv + vec2(-h.x, -h.y));
  c      += texture(u_tex, v_uv + vec2( h.x, -h.y));
  c      += texture(u_tex, v_uv + vec2(-h.x,  h.y));
  c      += texture(u_tex, v_uv + vec2( h.x,  h.y));
  fragColor = c * 0.25;
}`;

// Pass 3: Dual-Kawase Upsample + Subtle RGB Chromatic Dispersion
const FRAG_KAWASE_UP = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform sampler2D u_prev;
uniform vec2 u_texelSize;
uniform float u_spread;
uniform float u_dispersion;
uniform float u_isLast;
in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec2 d = u_texelSize * u_spread;
  vec4 c =  texture(u_tex, v_uv + vec2(-d.x * 2.0, 0.0));
  c      += texture(u_tex, v_uv + vec2( d.x * 2.0, 0.0));
  c      += texture(u_tex, v_uv + vec2(0.0, -d.y * 2.0));
  c      += texture(u_tex, v_uv + vec2(0.0,  d.y * 2.0));
  c      += texture(u_tex, v_uv + vec2(-d.x, -d.y)) * 2.0;
  c      += texture(u_tex, v_uv + vec2( d.x, -d.y)) * 2.0;
  c      += texture(u_tex, v_uv + vec2(-d.x,  d.y)) * 2.0;
  c      += texture(u_tex, v_uv + vec2( d.x,  d.y)) * 2.0;
  c /= 12.0;

  // Accumulate previous upsample stage
  vec4 prevSample = texture(u_prev, v_uv);
  c = mix(c, prevSample, 0.4);

  // Subtle RGB Chromatic Dispersion on final pass
  if (u_dispersion > 0.0 && u_isLast > 0.5) {
    float lum = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
    float shift = u_dispersion * lum * d.x * 8.0;
    float r = texture(u_tex, v_uv + vec2(-shift, 0.0)).r;
    float b = texture(u_tex, v_uv + vec2( shift, 0.0)).b;
    c.r = mix(c.r, r, 0.65);
    c.b = mix(c.b, b, 0.65);
  }

  fragColor = c;
}`;

// Pass 4: Composite with TPDF Grain, Background / Viewport Modes & Offscreen Commit Targets
const FRAG_COMPOSITE = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D u_scanlines;
uniform sampler2D u_bloom;
uniform sampler2D u_source;
uniform vec3 u_bgColor;
uniform int u_transparent;
uniform float u_glow;
uniform float u_grain;
uniform float u_time;
uniform int u_viewMode;
uniform float u_splitX;
uniform int u_exportTarget;

in vec2 v_uv;
out vec4 fragColor;

float hash(vec2 p, float s) {
  return fract(sin(dot(p + vec2(s, s * 1.618), vec2(127.1, 311.7))) * 43758.5453123);
}

float tpdfGrain(vec2 p, float seed) {
  float r1 = hash(p, seed);
  float r2 = hash(p + vec2(13.7, 91.1), seed + 3.14159);
  return (r1 - r2);
}

void main() {
  vec4 scanSample = texture(u_scanlines, v_uv);
  vec4 bloomSample = texture(u_bloom, v_uv);
  vec4 srcSample = texture(u_source, v_uv);

  if (u_exportTarget == 1) {
    // Glow only layer
    vec3 glowRGB = bloomSample.rgb * u_glow * 1.8;
    float glowA = clamp(dot(glowRGB, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
    fragColor = vec4(glowRGB, glowA);
    return;
  } else if (u_exportTarget == 2) {
    // Lines only layer
    fragColor = scanSample;
    return;
  }

  vec3 lineRGB = scanSample.rgb;
  vec3 bloomRGB = bloomSample.rgb * u_glow * 1.6;
  vec3 fx = lineRGB + bloomRGB;
  float alpha = clamp(scanSample.a + bloomSample.a * u_glow * 0.7, 0.0, 1.0);

  if (u_grain > 0.0) {
    float g = tpdfGrain(gl_FragCoord.xy, u_time);
    fx += g * u_grain * 0.14;
    fx = clamp(fx, 0.0, 1.0);
  }

  if (u_viewMode == 1) {
    // Lines Only view mode
    if (u_transparent == 1) {
      fragColor = vec4(lineRGB, scanSample.a);
    } else {
      fragColor = vec4(mix(u_bgColor, lineRGB, scanSample.a), 1.0);
    }
    return;
  }

  vec3 finalRGB;
  float finalA;
  if (u_transparent == 1) {
    finalRGB = fx;
    finalA = alpha;
  } else {
    finalRGB = mix(u_bgColor, fx, alpha);
    finalA = 1.0;
  }

  if (u_viewMode == 2) {
    // Split screen wipe
    float hairline = 0.003;
    if (abs(v_uv.x - u_splitX) < hairline) {
      fragColor = vec4(0.95, 0.95, 0.96, 1.0);
      return;
    } else if (v_uv.x < u_splitX) {
      fragColor = srcSample;
      return;
    }
  }

  fragColor = vec4(finalRGB, finalA);
}`;

// ─── WebGL Helpers ────────────────────────────────────────────────────────────

function compileShader(gl: WebGL2RenderingContext, src: string, type: number): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${info}\nSource:\n${src}`);
  }
  return shader;
}

function linkProgram(gl: WebGL2RenderingContext, vertSrc: string, fragSrc: string): WebGLProgram {
  const prog = gl.createProgram()!;
  const vs = compileShader(gl, vertSrc, gl.VERTEX_SHADER);
  const fs = compileShader(gl, fragSrc, gl.FRAGMENT_SHADER);
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`Program link error: ${info}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

function createFBO(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
  internalFormat: number,
  format: number,
  type: number
): { fbo: WebGLFramebuffer; tex: WebGLTexture } {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, tex };
}

function createQuadVAO(gl: WebGL2RenderingContext, prog: WebGLProgram): WebGLVertexArrayObject {
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "a_pos");
  if (loc >= 0) {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }
  gl.bindVertexArray(null);
  return vao;
}

function buildScanlineGeometryIndexed(
  density: number,
  steps = 256
): {
  lineIdx: Float32Array;
  tArr: Float32Array;
  sideArr: Float32Array;
  indices: Uint32Array;
  indexCount: number;
} {
  const vertsPerLine = steps * 2;
  const totalVerts = density * vertsPerLine;
  const quadsPerLine = steps - 1;
  const totalIndices = density * quadsPerLine * 6;

  const lineIdx = new Float32Array(totalVerts);
  const tArr = new Float32Array(totalVerts);
  const sideArr = new Float32Array(totalVerts);
  const indices = new Uint32Array(totalIndices);

  let vIdx = 0;
  let iIdx = 0;

  for (let li = 0; li < density; li++) {
    const lineStartVert = vIdx;

    for (let si = 0; si < steps; si++) {
      const t = si / (steps - 1);
      lineIdx[vIdx] = li;
      tArr[vIdx] = t;
      sideArr[vIdx] = -1.0;
      vIdx++;

      lineIdx[vIdx] = li;
      tArr[vIdx] = t;
      sideArr[vIdx] = 1.0;
      vIdx++;
    }

    for (let si = 0; si < quadsPerLine; si++) {
      const v0 = lineStartVert + si * 2;
      const v1 = lineStartVert + si * 2 + 1;
      const v2 = lineStartVert + (si + 1) * 2;
      const v3 = lineStartVert + (si + 1) * 2 + 1;

      indices[iIdx++] = v0;
      indices[iIdx++] = v1;
      indices[iIdx++] = v2;

      indices[iIdx++] = v2;
      indices[iIdx++] = v1;
      indices[iIdx++] = v3;
    }
  }

  return { lineIdx, tArr, sideArr, indices, indexCount: totalIndices };
}

// ─── Main Renderer Class ──────────────────────────────────────────────────────

export class ScanlineRenderer {
  private gl: WebGL2RenderingContext;
  private width = 0;
  private height = 0;

  // Shader Programs
  private inputCondProg!: WebGLProgram;
  private blurHProg!: WebGLProgram;
  private blurVProg!: WebGLProgram;
  private scanlineProg!: WebGLProgram;
  private kawaseDownProg!: WebGLProgram;
  private kawaseUpProg!: WebGLProgram;
  private compositeProg!: WebGLProgram;

  // Fullscreen Quad VAOs
  private quadVAO_input!: WebGLVertexArrayObject;
  private quadVAO_blurH!: WebGLVertexArrayObject;
  private quadVAO_blurV!: WebGLVertexArrayObject;
  private quadVAO_down!: WebGLVertexArrayObject;
  private quadVAO_up!: WebGLVertexArrayObject;
  private quadVAO_comp!: WebGLVertexArrayObject;

  // Scanline Mesh Geometry
  private scanlineVAO: WebGLVertexArrayObject | null = null;
  private scanlineIndexBuffer: WebGLBuffer | null = null;
  private scanlineIndexCount = 0;
  private lastDensity = -1;

  // FBO Formats (RGBA16F or RGBA8)
  private fboFormat = 0;
  private fboType = 0;
  private fboInternalFormat = 0;

  private fboInput!: { fbo: WebGLFramebuffer; tex: WebGLTexture };
  private fboBlurH!: { fbo: WebGLFramebuffer; tex: WebGLTexture };
  private fboBlurV!: { fbo: WebGLFramebuffer; tex: WebGLTexture };
  private fboScanlines!: { fbo: WebGLFramebuffer; tex: WebGLTexture };

  // 4-level Dual-Kawase Bloom Pyramid
  private bloomFBOs: Array<{ fbo: WebGLFramebuffer; tex: WebGLTexture }> = [];
  private bloomW: number[] = [];
  private bloomH: number[] = [];

  // Textures
  private sourceTex: WebGLTexture | null = null;
  private depthTex: WebGLTexture | null = null;
  private hasDepthMap = false;

  // Cached Luminance Range for Auto-Normalize
  private minLum = 0.0;
  private maxLum = 1.0;

  private frameCount = 0;
  private initialized = false;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      antialias: false,
    });
    if (!gl) throw new Error("WebGL2 not supported in this environment");
    this.gl = gl;
  }

  init(): void {
    const gl = this.gl;

    const extFloat = gl.getExtension("EXT_color_buffer_float");
    if (extFloat) {
      this.fboInternalFormat = gl.RGBA16F;
      this.fboFormat = gl.RGBA;
      this.fboType = gl.HALF_FLOAT;
    } else {
      this.fboInternalFormat = gl.RGBA8;
      this.fboFormat = gl.RGBA;
      this.fboType = gl.UNSIGNED_BYTE;
    }

    // Link Shaders
    this.inputCondProg = linkProgram(gl, VERT_QUAD, FRAG_INPUT_CONDITION);
    this.blurHProg = linkProgram(gl, VERT_QUAD, FRAG_BLUR_H);
    this.blurVProg = linkProgram(gl, VERT_QUAD, FRAG_BLUR_V);
    this.scanlineProg = linkProgram(gl, VERT_SCANLINE, FRAG_SCANLINE);
    this.kawaseDownProg = linkProgram(gl, VERT_QUAD, FRAG_KAWASE_DOWN);
    this.kawaseUpProg = linkProgram(gl, VERT_QUAD, FRAG_KAWASE_UP);
    this.compositeProg = linkProgram(gl, VERT_QUAD, FRAG_COMPOSITE);

    // Quad VAOs
    this.quadVAO_input = createQuadVAO(gl, this.inputCondProg);
    this.quadVAO_blurH = createQuadVAO(gl, this.blurHProg);
    this.quadVAO_blurV = createQuadVAO(gl, this.blurVProg);
    this.quadVAO_down  = createQuadVAO(gl, this.kawaseDownProg);
    this.quadVAO_up    = createQuadVAO(gl, this.kawaseUpProg);
    this.quadVAO_comp  = createQuadVAO(gl, this.compositeProg);

    this.initialized = true;
  }

  resize(w: number, h: number): void {
    if (this.width === w && this.height === h && this.fboBlurH) return;
    const gl = this.gl;
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);

    const IF = this.fboInternalFormat;
    const F = this.fboFormat;
    const T = this.fboType;

    if (this.fboInput) {
      gl.deleteFramebuffer(this.fboInput.fbo);
      gl.deleteTexture(this.fboInput.tex);
      gl.deleteFramebuffer(this.fboBlurH.fbo);
      gl.deleteTexture(this.fboBlurH.tex);
      gl.deleteFramebuffer(this.fboBlurV.fbo);
      gl.deleteTexture(this.fboBlurV.tex);
      gl.deleteFramebuffer(this.fboScanlines.fbo);
      gl.deleteTexture(this.fboScanlines.tex);
      for (const item of this.bloomFBOs) {
        gl.deleteFramebuffer(item.fbo);
        gl.deleteTexture(item.tex);
      }
    }

    this.fboInput = createFBO(gl, this.width, this.height, IF, F, T);
    this.fboBlurH = createFBO(gl, this.width, this.height, IF, F, T);
    this.fboBlurV = createFBO(gl, this.width, this.height, IF, F, T);
    this.fboScanlines = createFBO(gl, this.width, this.height, IF, F, T);

    const LEVELS = 4;
    this.bloomFBOs = [];
    this.bloomW = [];
    this.bloomH = [];

    let bw = this.width;
    let bh = this.height;

    for (let i = 0; i < LEVELS; i++) {
      bw = Math.max(1, bw >> 1);
      bh = Math.max(1, bh >> 1);
      this.bloomFBOs.push(createFBO(gl, bw, bh, IF, F, T));
      this.bloomW.push(bw);
      this.bloomH.push(bh);
    }

    for (let i = 0; i < LEVELS; i++) {
      const revIdx = LEVELS - 1 - i;
      bw = this.bloomW[revIdx];
      bh = this.bloomH[revIdx];
      this.bloomFBOs.push(createFBO(gl, bw, bh, IF, F, T));
      this.bloomW.push(bw);
      this.bloomH.push(bh);
    }
  }

  uploadSourceTexture(pixels: Uint8Array, w: number, h: number): void {
    const gl = this.gl;
    if (!this.sourceTex) {
      this.sourceTex = gl.createTexture()!;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);

    // Compute active layer histogram min and max luminance for Auto-Normalize
    let minL = 1.0;
    let maxL = 0.0;
    const step = Math.max(1, Math.floor(pixels.length / (4 * 12000)));
    for (let i = 0; i < pixels.length; i += 4 * step) {
      const a = pixels[i + 3] / 255;
      if (a > 0.05) {
        const l = (pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722) / 255;
        if (l < minL) minL = l;
        if (l > maxL) maxL = l;
      }
    }
    this.minLum = minL < maxL ? minL : 0.0;
    this.maxLum = maxL > minL ? maxL : 1.0;
  }

  uploadDepthTexture(depthBuffer: Uint8Array, w: number, h: number): void {
    const gl = this.gl;
    if (!this.depthTex) {
      this.depthTex = gl.createTexture()!;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.depthTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, w, h, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, depthBuffer);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.hasDepthMap = true;
  }

  clearDepthTexture(): void {
    this.hasDepthMap = false;
  }

  hasDepth(): boolean {
    return this.hasDepthMap;
  }

  private rebuildScanlineGeometry(density: number): void {
    if (density === this.lastDensity && this.scanlineVAO) return;
    const gl = this.gl;

    if (this.scanlineVAO) {
      gl.deleteVertexArray(this.scanlineVAO);
      this.scanlineVAO = null;
    }
    if (this.scanlineIndexBuffer) {
      gl.deleteBuffer(this.scanlineIndexBuffer);
      this.scanlineIndexBuffer = null;
    }

    const { lineIdx, tArr, sideArr, indices, indexCount } = buildScanlineGeometryIndexed(density, 256);
    this.scanlineIndexCount = indexCount;
    this.lastDensity = density;

    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const prog = this.scanlineProg;

    const bindAttrib = (data: Float32Array, name: string) => {
      const buf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, name);
      if (loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 1, gl.FLOAT, false, 0, 0);
      }
    };

    bindAttrib(lineIdx, "a_lineIdx");
    bindAttrib(tArr, "a_t");
    bindAttrib(sideArr, "a_side");

    const ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    this.scanlineIndexBuffer = ibo;

    gl.bindVertexArray(null);
    this.scanlineVAO = vao;
  }

  private hexToRgb(hex: string): [number, number, number] {
    const clean = hex.replace("#", "");
    if (clean.length === 6) {
      return [
        parseInt(clean.slice(0, 2), 16) / 255,
        parseInt(clean.slice(2, 4), 16) / 255,
        parseInt(clean.slice(4, 6), 16) / 255,
      ];
    }
    return [0.0, 1.0, 0.53];
  }

  render(
    params: ScanlineParams,
    viewMode: ViewportMode = "composite",
    splitX = 0.5,
    exportTarget: OffscreenTarget = "composite"
  ): void {
    if (!this.initialized || !this.sourceTex || this.width === 0 || this.height === 0) return;
    const gl = this.gl;
    this.frameCount++;

    const W = this.width;
    const H = this.height;
    const density = Math.round(params.density);

    // ── Pass 0A: Input Conditioning + Sobel Silhouette Extraction ─────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboInput.fbo);
    gl.viewport(0, 0, W, H);
    gl.useProgram(this.inputCondProg);
    gl.bindVertexArray(this.quadVAO_input);

    const ip = this.inputCondProg;
    gl.uniform1i(gl.getUniformLocation(ip, "u_source"), 0);
    gl.uniform2f(gl.getUniformLocation(ip, "u_texelSize"), 1 / W, 1 / H);
    gl.uniform1f(gl.getUniformLocation(ip, "u_inputBlack"), params.inputBlack);
    gl.uniform1f(gl.getUniformLocation(ip, "u_inputWhite"), params.inputWhite);
    gl.uniform1f(gl.getUniformLocation(ip, "u_gamma"), params.gamma);
    gl.uniform1i(gl.getUniformLocation(ip, "u_autoNorm"), params.autoNormalize ? 1 : 0);
    gl.uniform1f(gl.getUniformLocation(ip, "u_normMin"), this.minLum);
    gl.uniform1f(gl.getUniformLocation(ip, "u_normMax"), this.maxLum);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTex);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // ── Pass 0B: Separable Gaussian Pre-Blur (Horizontal) ────────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboBlurH.fbo);
    gl.viewport(0, 0, W, H);
    gl.useProgram(this.blurHProg);
    gl.bindVertexArray(this.quadVAO_blurH);

    gl.uniform1i(gl.getUniformLocation(this.blurHProg, "u_tex"), 0);
    gl.uniform2f(gl.getUniformLocation(this.blurHProg, "u_texelSize"), 1 / W, 1 / H);
    gl.uniform1f(gl.getUniformLocation(this.blurHProg, "u_radius"), Math.max(1.5, Math.min(W, H) / 400.0));

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fboInput.tex);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // ── Pass 0C: Separable Gaussian Pre-Blur (Vertical) ──────────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboBlurV.fbo);
    gl.viewport(0, 0, W, H);
    gl.useProgram(this.blurVProg);
    gl.bindVertexArray(this.quadVAO_blurV);

    gl.uniform1i(gl.getUniformLocation(this.blurVProg, "u_tex"), 0);
    gl.uniform2f(gl.getUniformLocation(this.blurVProg, "u_texelSize"), 1 / W, 1 / H);
    gl.uniform1f(gl.getUniformLocation(this.blurVProg, "u_radius"), Math.max(1.5, Math.min(W, H) / 400.0));

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fboBlurH.tex);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // ── Pass 1: Vertex-Displaced Scanlines + 3D Tilt + Depth Relief ──────────
    this.rebuildScanlineGeometry(density);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboScanlines.fbo);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(this.scanlineProg);
    gl.bindVertexArray(this.scanlineVAO!);

    const sp = this.scanlineProg;
    gl.uniform1i(gl.getUniformLocation(sp, "u_luma"), 0);
    gl.uniform1i(gl.getUniformLocation(sp, "u_source"), 1);
    gl.uniform1i(gl.getUniformLocation(sp, "u_depth"), 2);
    gl.uniform1i(gl.getUniformLocation(sp, "u_hasDepth"), this.hasDepthMap ? 1 : 0);
    gl.uniform1f(gl.getUniformLocation(sp, "u_depthCutoff"), params.depthCutoff);
    gl.uniform1f(gl.getUniformLocation(sp, "u_reliefSource"), params.reliefSource);
    gl.uniform1f(gl.getUniformLocation(sp, "u_density"), density);
    gl.uniform1f(gl.getUniformLocation(sp, "u_displacement"), params.displacement / 100);
    gl.uniform1f(gl.getUniformLocation(sp, "u_pixelQuant"), params.pixel / 100);
    gl.uniform1f(gl.getUniformLocation(sp, "u_direction"), params.direction === "vertical" ? 1.0 : 0.0);
    gl.uniform1i(gl.getUniformLocation(sp, "u_invert"), params.invert ? 1 : 0);
    gl.uniform1f(gl.getUniformLocation(sp, "u_lineThickness"), Math.max(0.2, params.lineThickness));
    gl.uniform1f(gl.getUniformLocation(sp, "u_edgeAccent"), params.edgeAccent);
    gl.uniform1f(gl.getUniformLocation(sp, "u_tiltPitch"), (params.tiltPitch * Math.PI) / 180);
    gl.uniform1f(gl.getUniformLocation(sp, "u_tiltYaw"), (params.tiltYaw * Math.PI) / 180);
    gl.uniform1f(gl.getUniformLocation(sp, "u_cutoff"), params.cutoff);
    gl.uniform1f(gl.getUniformLocation(sp, "u_noise"), params.noise);
    gl.uniform1f(gl.getUniformLocation(sp, "u_noiseSeed"), params.noiseSeed);

    // Color mode: 0 = Solid Tint, 1 = Gradient Ramp, 2 = Picture Colours
    let colorModeInt = 0;
    if (params.colorMode === "gradient") colorModeInt = 1;
    else if (params.colorMode === "picture" || params.pictureColours) colorModeInt = 2;
    gl.uniform1i(gl.getUniformLocation(sp, "u_colorMode"), colorModeInt);

    const [cr, cg, cb] = this.hexToRgb(params.colour);
    gl.uniform3f(gl.getUniformLocation(sp, "u_colour"), cr, cg, cb);

    const [sr, sg, sb] = this.hexToRgb(params.shadowColor || "#080820");
    gl.uniform3f(gl.getUniformLocation(sp, "u_shadowColor"), sr, sg, sb);

    const [pr, pg, pb] = this.hexToRgb(params.peakColor || "#7dd3fc");
    gl.uniform3f(gl.getUniformLocation(sp, "u_peakColor"), pr, pg, pb);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fboBlurV.tex); // Conditioned + blurred luma & Sobel edge
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTex);    // Original source RGB
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.depthTex || this.fboBlurV.tex); // Depth texture

    gl.drawElements(gl.TRIANGLES, this.scanlineIndexCount, gl.UNSIGNED_INT, 0);
    gl.disable(gl.BLEND);

    // ── Pass 2: 4-Level Dual-Kawase Downsample Bloom Pyramid ──────────────────
    const LEVELS = 4;
    const spreadFactor = 0.5 + params.soft * 2.5;

    let currentInput = this.fboScanlines.tex;
    for (let i = 0; i < LEVELS; i++) {
      const bw = this.bloomW[i];
      const bh = this.bloomH[i];

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFBOs[i].fbo);
      gl.viewport(0, 0, bw, bh);
      gl.useProgram(this.kawaseDownProg);
      gl.bindVertexArray(this.quadVAO_down);

      gl.uniform1i(gl.getUniformLocation(this.kawaseDownProg, "u_tex"), 0);
      gl.uniform2f(gl.getUniformLocation(this.kawaseDownProg, "u_texelSize"), 1 / bw, 1 / bh);
      gl.uniform1f(gl.getUniformLocation(this.kawaseDownProg, "u_spread"), spreadFactor);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, currentInput);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      currentInput = this.bloomFBOs[i].tex;
    }

    // ── Pass 3: 4-Level Dual-Kawase Upsample Bloom Pyramid + Dispersion ───────
    for (let i = 0; i < LEVELS; i++) {
      const upIdx = LEVELS + i;
      const bw = this.bloomW[upIdx];
      const bh = this.bloomH[upIdx];
      const isLast = i === LEVELS - 1;

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFBOs[upIdx].fbo);
      gl.viewport(0, 0, bw, bh);
      gl.useProgram(this.kawaseUpProg);
      gl.bindVertexArray(this.quadVAO_up);

      const kp = this.kawaseUpProg;
      gl.uniform1i(gl.getUniformLocation(kp, "u_tex"), 0);
      gl.uniform1i(gl.getUniformLocation(kp, "u_prev"), 1);
      gl.uniform2f(gl.getUniformLocation(kp, "u_texelSize"), 1 / bw, 1 / bh);
      gl.uniform1f(gl.getUniformLocation(kp, "u_spread"), spreadFactor);
      gl.uniform1f(gl.getUniformLocation(kp, "u_dispersion"), params.dispersion);
      gl.uniform1f(gl.getUniformLocation(kp, "u_isLast"), isLast ? 1.0 : 0.0);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.bloomFBOs[LEVELS - 1 - i].tex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(
        gl.TEXTURE_2D,
        i > 0 ? this.bloomFBOs[upIdx - 1].tex : this.bloomFBOs[LEVELS - 1].tex
      );

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // ── Pass 4: Composite + TPDF Grain + Background / Viewport Modes ─────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(this.compositeProg);
    gl.bindVertexArray(this.quadVAO_comp);

    const cp = this.compositeProg;
    gl.uniform1i(gl.getUniformLocation(cp, "u_scanlines"), 0);
    gl.uniform1i(gl.getUniformLocation(cp, "u_bloom"), 1);
    gl.uniform1i(gl.getUniformLocation(cp, "u_source"), 2);
    gl.uniform1f(gl.getUniformLocation(cp, "u_glow"), params.glow);
    gl.uniform1f(gl.getUniformLocation(cp, "u_grain"), params.grain);
    gl.uniform1f(gl.getUniformLocation(cp, "u_time"), this.frameCount * 0.016 + params.noiseSeed * 0.1);
    gl.uniform1i(gl.getUniformLocation(cp, "u_transparent"), params.transparent ? 1 : 0);

    const [bgr, bgg, bgb] = this.hexToRgb(params.background);
    gl.uniform3f(gl.getUniformLocation(cp, "u_bgColor"), bgr, bgg, bgb);

    let viewModeInt = 0;
    if (viewMode === "lines") viewModeInt = 1;
    else if (viewMode === "split") viewModeInt = 2;
    gl.uniform1i(gl.getUniformLocation(cp, "u_viewMode"), viewModeInt);
    gl.uniform1f(gl.getUniformLocation(cp, "u_splitX"), splitX);

    let exportTargetInt = 0;
    if (exportTarget === "glow") exportTargetInt = 1;
    else if (exportTarget === "lines") exportTargetInt = 2;
    gl.uniform1i(gl.getUniformLocation(cp, "u_exportTarget"), exportTargetInt);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fboScanlines.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.bloomFBOs[this.bloomFBOs.length - 1].tex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTex);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /**
   * Runs the complete multi-pass pipeline offscreen at full doc.width x doc.height resolution.
   * Returns a top-to-bottom RGBA Uint8Array perfectly aligned pixel-for-pixel with Photoshop canvas.
   */
  renderOffscreen(
    pixels: Uint8Array,
    srcW: number,
    srcH: number,
    params: ScanlineParams,
    target: OffscreenTarget = "composite"
  ): Uint8Array {
    const gl = this.gl;
    const canvas = gl.canvas as HTMLCanvasElement;

    const savedW = this.width;
    const savedH = this.height;
    const savedCanvasW = canvas.width;
    const savedCanvasH = canvas.height;

    canvas.width = srcW;
    canvas.height = srcH;
    this.uploadSourceTexture(pixels, srcW, srcH);
    this.resize(srcW, srcH);

    this.render(params, "composite", 0.5, target);

    const rawBuffer = new Uint8Array(srcW * srcH * 4);
    gl.readPixels(0, 0, srcW, srcH, gl.RGBA, gl.UNSIGNED_BYTE, rawBuffer);

    // Flip vertically (OpenGL bottom-left origin to Photoshop top-left origin)
    const flippedBuffer = new Uint8Array(srcW * srcH * 4);
    const rowBytes = srcW * 4;
    for (let row = 0; row < srcH; row++) {
      const srcOffset = (srcH - 1 - row) * rowBytes;
      const dstOffset = row * rowBytes;
      flippedBuffer.set(rawBuffer.subarray(srcOffset, srcOffset + rowBytes), dstOffset);
    }

    canvas.width = savedCanvasW;
    canvas.height = savedCanvasH;
    this.resize(savedW, savedH);

    return flippedBuffer;
  }

  destroy(): void {
    const gl = this.gl;
    if (this.sourceTex) gl.deleteTexture(this.sourceTex);
    if (this.depthTex) gl.deleteTexture(this.depthTex);
    if (this.fboInput) {
      gl.deleteFramebuffer(this.fboInput.fbo);
      gl.deleteTexture(this.fboInput.tex);
    }
    if (this.fboBlurH) {
      gl.deleteFramebuffer(this.fboBlurH.fbo);
      gl.deleteTexture(this.fboBlurH.tex);
      gl.deleteFramebuffer(this.fboBlurV.fbo);
      gl.deleteTexture(this.fboBlurV.tex);
      gl.deleteFramebuffer(this.fboScanlines.fbo);
      gl.deleteTexture(this.fboScanlines.tex);
    }
    for (const f of this.bloomFBOs) {
      gl.deleteFramebuffer(f.fbo);
      gl.deleteTexture(f.tex);
    }
    if (this.scanlineVAO) gl.deleteVertexArray(this.scanlineVAO);
    if (this.scanlineIndexBuffer) gl.deleteBuffer(this.scanlineIndexBuffer);
  }
}
