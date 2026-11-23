/**
 * ScanlineX — Pass 0: Input Conditioning & Multi-Tap Gaussian Elevation Smoothing
 *
 * Blends luminance and Depth Map via Relief Source into an elevation field E,
 * and performs separable multi-tap Gaussian smoothing for liquid topographic curves.
 */

export const FRAG_INPUT_CONDITION = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D u_source;
uniform sampler2D u_depth;
uniform int u_hasDepth;
uniform vec2 u_texelSize;
uniform float u_inputBlack;
uniform float u_inputWhite;
uniform float u_gamma;
uniform int u_autoNorm;
uniform float u_normMin;
uniform float u_normMax;
uniform float u_reliefSource;
uniform int u_invert;

in vec2 v_uv;
out vec4 fragColor;

float getConditionedLuma(vec2 uv) {
  vec4 s = texture(u_source, uv);
  float a = s.a;

  // Premultiply RGB by alpha
  vec3 rgb = s.rgb * a;
  float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722)) * a;

  // Auto-Normalize histogram
  if (u_autoNorm == 1) {
    luma = clamp((luma - u_normMin) / max(0.001, u_normMax - u_normMin), 0.0, 1.0);
  }

  // Input Black & White Level adjustment
  float range = max(0.001, u_inputWhite - u_inputBlack);
  luma = clamp((luma - u_inputBlack) / range, 0.0, 1.0);

  // Gamma correction
  luma = pow(luma, 1.0 / max(0.01, u_gamma));
  return luma * a;
}

void main() {
  vec2 d = u_texelSize;
  float c = getConditionedLuma(v_uv);
  float srcAlpha = texture(u_source, v_uv).a;

  // 3x3 Sobel gradient kernel for silhouette feature extraction
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

  // Sample Depth Map (Depth Anything V2)
  float depthVal = c;
  if (u_hasDepth == 1) {
    depthVal = texture(u_depth, v_uv).r * srcAlpha;
  }

  // Blend Luminance and Depth Map into Elevation field
  float elevation = mix(c, depthVal, u_reliefSource);

  // Polarity invert strictly masked by alpha
  if (u_invert == 1) {
    elevation = (1.0 - elevation) * srcAlpha;
  }

  // R: raw elevation E, G: Sobel edge, B: alpha, A: conditioned luma
  fragColor = vec4(elevation, sobelEdge * srcAlpha, srcAlpha, c);
}
`;

// Pass 0B: Separable Gaussian Pre-Blur (Horizontal)
export const FRAG_BLUR_H = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_texelSize;
uniform float u_radius;
in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec4 c = vec4(0.0);
  // 9-tap Gaussian weights
  float weights[5] = float[](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
  c += texture(u_tex, v_uv) * weights[0];
  for (int i = 1; i < 5; i++) {
    vec2 off = vec2(float(i) * u_texelSize.x * u_radius, 0.0);
    c += texture(u_tex, v_uv + off) * weights[i];
    c += texture(u_tex, v_uv - off) * weights[i];
  }
  fragColor = c;
}
`;

// Pass 0C: Separable Gaussian Pre-Blur (Vertical)
export const FRAG_BLUR_V = /* glsl */ `#version 300 es
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
}
`;
