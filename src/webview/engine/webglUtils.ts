/**
 * ScanlineX — WebGL2 Helper Utilities
 */

export function compileShader(gl: WebGL2RenderingContext, src: string, type: number): WebGLShader {
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

export function linkProgram(gl: WebGL2RenderingContext, vertSrc: string, fragSrc: string): WebGLProgram {
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

export function createFBO(
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

export function createQuadVAO(gl: WebGL2RenderingContext, prog: WebGLProgram): WebGLVertexArrayObject {
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

export function createGridVAO(
  gl: WebGL2RenderingContext,
  prog: WebGLProgram,
  resX = 32,
  resY = 32
): { vao: WebGLVertexArrayObject; indexCount: number; ibo: WebGLBuffer } {
  const numVerts = (resX + 1) * (resY + 1);
  const positions = new Float32Array(numVerts * 2);
  const uvs = new Float32Array(numVerts * 2);
  const indices = new Uint32Array(resX * resY * 6);

  let vIdx = 0;
  for (let y = 0; y <= resY; y++) {
    const v = y / resY;
    const posY = 1.0 - v * 2.0;
    for (let x = 0; x <= resX; x++) {
      const u = x / resX;
      const posX = u * 2.0 - 1.0;
      positions[vIdx * 2] = posX;
      positions[vIdx * 2 + 1] = posY;
      uvs[vIdx * 2] = u;
      uvs[vIdx * 2 + 1] = v;
      vIdx++;
    }
  }

  let iIdx = 0;
  for (let y = 0; y < resY; y++) {
    for (let x = 0; x < resX; x++) {
      const row1 = y * (resX + 1);
      const row2 = (y + 1) * (resX + 1);
      const i0 = row1 + x;
      const i1 = row1 + x + 1;
      const i2 = row2 + x;
      const i3 = row2 + x + 1;

      indices[iIdx++] = i0;
      indices[iIdx++] = i1;
      indices[iIdx++] = i2;

      indices[iIdx++] = i2;
      indices[iIdx++] = i1;
      indices[iIdx++] = i3;
    }
  }

  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);

  const posBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
  const posLoc = gl.getAttribLocation(prog, "a_pos");
  if (posLoc >= 0) {
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
  }

  const uvBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
  gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
  const uvLoc = gl.getAttribLocation(prog, "a_uv");
  if (uvLoc >= 0) {
    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);
  }

  const ibo = gl.createBuffer()!;
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  gl.bindVertexArray(null);
  return { vao, indexCount: indices.length, ibo };
}
