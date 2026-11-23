/**
 * ScanlineX — Pass 1: 3D Perspective Projection Grid/Quad Vertex Shader
 *
 * Applies 3D Pitch and Yaw rotation matrices to the quad plane with perspective FOV division.
 */

export const VERT_SCANLINE = /* glsl */ `#version 300 es
precision highp float;

in vec2 a_pos;
in vec2 a_uv;

uniform float u_tiltPitch;    // in radians
uniform float u_tiltYaw;      // in radians
uniform float u_perspective;  // perspective FOV factor

out vec2 v_uv;

void main() {
  v_uv = a_uv;

  float x0 = a_pos.x;
  float y0 = a_pos.y;
  float z0 = 0.0;

  // 1. 3D Pitch around X-axis (-60 to +60 deg)
  float cosP = cos(u_tiltPitch);
  float sinP = sin(u_tiltPitch);
  float y1 = y0 * cosP - z0 * sinP;
  float z1 = y0 * sinP + z0 * cosP;

  // 2. 3D Yaw around Y-axis (-60 to +60 deg)
  float cosY = cos(u_tiltYaw);
  float sinY = sin(u_tiltYaw);
  float x2 = x0 * cosY + z1 * sinY;
  float z2 = -x0 * sinY + z1 * cosY;
  float y2 = y1;

  // 3. Real 3D Perspective Division
  float w = max(0.12, 1.0 - z2 * (u_perspective * 0.85));
  gl_Position = vec4(x2, y2, z2 * 0.05, w);
}
`;
