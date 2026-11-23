/**
 * ScanlineX — 4-Level Dual-Kawase Bloom Downsample & Upsample Pipeline
 */

import { VERT_QUAD } from "../shaders/quad.vert";
import { FRAG_KAWASE_DOWN, FRAG_KAWASE_UP } from "../shaders/bloom.frag";
import { linkProgram, createFBO, createQuadVAO } from "./webglUtils";

export class BloomPipeline {
  private kawaseDownProg!: WebGLProgram;
  private kawaseUpProg!: WebGLProgram;
  private quadVAO_down!: WebGLVertexArrayObject;
  private quadVAO_up!: WebGLVertexArrayObject;

  private bloomFBOs: Array<{ fbo: WebGLFramebuffer; tex: WebGLTexture }> = [];
  private bloomW: number[] = [];
  private bloomH: number[] = [];
  private levels = 4;

  init(gl: WebGL2RenderingContext): void {
    this.kawaseDownProg = linkProgram(gl, VERT_QUAD, FRAG_KAWASE_DOWN);
    this.kawaseUpProg = linkProgram(gl, VERT_QUAD, FRAG_KAWASE_UP);
    this.quadVAO_down = createQuadVAO(gl, this.kawaseDownProg);
    this.quadVAO_up = createQuadVAO(gl, this.kawaseUpProg);
  }

  resize(
    gl: WebGL2RenderingContext,
    w: number,
    h: number,
    internalFormat: number,
    format: number,
    type: number
  ): void {
    this.destroyFBOs(gl);
    this.bloomFBOs = [];
    this.bloomW = [];
    this.bloomH = [];

    let bw = w;
    let bh = h;
    for (let i = 0; i < this.levels; i++) {
      bw = Math.max(1, bw >> 1);
      bh = Math.max(1, bh >> 1);
      this.bloomFBOs.push(createFBO(gl, bw, bh, internalFormat, format, type));
      this.bloomW.push(bw);
      this.bloomH.push(bh);
    }
    for (let i = 0; i < this.levels; i++) {
      const revIdx = this.levels - 1 - i;
      bw = this.bloomW[revIdx];
      bh = this.bloomH[revIdx];
      this.bloomFBOs.push(createFBO(gl, bw, bh, internalFormat, format, type));
      this.bloomW.push(bw);
      this.bloomH.push(bh);
    }
  }

  render(
    gl: WebGL2RenderingContext,
    inputTex: WebGLTexture,
    soft: number,
    dispersion: number
  ): WebGLTexture {
    if (this.bloomFBOs.length === 0) return inputTex;
    const spreadFactor = 0.5 + soft * 2.5;
    let currentInput = inputTex;

    // Downsample passes
    for (let i = 0; i < this.levels; i++) {
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

    // Upsample passes
    for (let i = 0; i < this.levels; i++) {
      const upIdx = this.levels + i;
      const bw = this.bloomW[upIdx];
      const bh = this.bloomH[upIdx];
      const isLast = i === this.levels - 1;

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFBOs[upIdx].fbo);
      gl.viewport(0, 0, bw, bh);
      gl.useProgram(this.kawaseUpProg);
      gl.bindVertexArray(this.quadVAO_up);
      gl.uniform1i(gl.getUniformLocation(this.kawaseUpProg, "u_tex"), 0);
      gl.uniform1i(gl.getUniformLocation(this.kawaseUpProg, "u_prev"), 1);
      gl.uniform2f(gl.getUniformLocation(this.kawaseUpProg, "u_texelSize"), 1 / bw, 1 / bh);
      gl.uniform1f(gl.getUniformLocation(this.kawaseUpProg, "u_spread"), spreadFactor);
      gl.uniform1f(gl.getUniformLocation(this.kawaseUpProg, "u_dispersion"), dispersion);
      gl.uniform1f(gl.getUniformLocation(this.kawaseUpProg, "u_isLast"), isLast ? 1.0 : 0.0);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.bloomFBOs[this.levels - 1 - i].tex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, i > 0 ? this.bloomFBOs[upIdx - 1].tex : this.bloomFBOs[this.levels - 1].tex);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    return this.bloomFBOs[this.bloomFBOs.length - 1].tex;
  }

  private destroyFBOs(gl: WebGL2RenderingContext): void {
    for (const f of this.bloomFBOs) {
      gl.deleteFramebuffer(f.fbo);
      gl.deleteTexture(f.tex);
    }
  }

  destroy(gl: WebGL2RenderingContext): void {
    this.destroyFBOs(gl);
    this.bloomFBOs = [];
    this.bloomW = [];
    this.bloomH = [];
  }
}
