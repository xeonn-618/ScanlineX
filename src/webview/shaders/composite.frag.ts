/**
 * ScanlineX — Pass 4: Composite Pass with TPDF Grain, Background & Viewport Modes
 */

export const FRAG_COMPOSITE = /* glsl */ `#version 300 es
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
  vec2 srcUV = vec2(v_uv.x, 1.0 - v_uv.y);
  vec4 srcSample = texture(u_source, srcUV);

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

  if (u_grain > 0.0 && alpha > 0.001) {
    float g = tpdfGrain(gl_FragCoord.xy, u_time);
    fx += g * u_grain * 0.14 * alpha;
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
      vec3 beforeRgb = mix(vec3(0.031, 0.031, 0.039), srcSample.rgb, srcSample.a);
      fragColor = vec4(beforeRgb, 1.0);
      return;
    }
  }

  fragColor = vec4(finalRGB, finalA);
}
`;
