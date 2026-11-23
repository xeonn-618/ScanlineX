/**
 * ScanlineX — Pass 2 & 3: Dual-Kawase Bloom Downsample & Upsample Shaders
 */

export const FRAG_KAWASE_DOWN = /* glsl */ `#version 300 es
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
}
`;

export const FRAG_KAWASE_UP = /* glsl */ `#version 300 es
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
}
`;
