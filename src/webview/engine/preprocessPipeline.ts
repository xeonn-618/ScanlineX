/**
 * ScanlineX — Pass 0: Input Conditioning & Gaussian Pre-Smoothing Pipeline
 */

import type { ScanlineParams } from "@webview/types/params";
import { VERT_QUAD } from "../shaders/quad.vert";
import { FRAG_INPUT_CONDITION, FRAG_BLUR_H, FRAG_BLUR_V } from "../shaders/preprocess.frag";
import { linkProgram, createFBO, createQuadVAO } from "./webglUtils";

export class PreprocessPipeline {
  private inputCondProg!: WebGLProgram;
  private blurHProg!: WebGLProgram;
  private blurVProg!: WebGLProgram;

  private quadVAO_input!: WebGLVertexArrayObject;
  private quadVAO_blurH!: WebGLVertexArrayObject;
  private quadVAO_blurV!: WebGLVertexArrayObject;

  private fboInput!: { fbo: WebGLFramebuffer; tex: WebGLTexture };
  private fboBlurH!: { fbo: WebGLFramebuffer; tex: WebGLTexture };
  private fboBlurV!: { fbo: WebGLFramebuffer; tex: WebGLTexture };

  init(gl: WebGL2RenderingContext): void {
    this.inputCondProg = linkProgram(gl, VERT_QUAD, FRAG_INPUT_CONDITION);
    this.blurHProg = linkProgram(gl, VERT_QUAD, FRAG_BLUR_H);
    this.blurVProg = linkProgram(gl, VERT_QUAD, FRAG_BLUR_V);

    this.quadVAO_input = createQuadVAO(gl, this.inputCondProg);
    this.quadVAO_blurH = createQuadVAO(gl, this.blurHProg);
    this.quadVAO_blurV = createQuadVAO(gl, this.blurVProg);
  }

  resize(
    gl: WebGL2RenderingContext,
    w: number,
    h: number,
    internalFormat: number,
    format: number,
    type: number
  ): void {
    this.destroy(gl);
    this.fboInput = createFBO(gl, w, h, internalFormat, format, type);
    this.fboBlurH = createFBO(gl, w, h, internalFormat, format, type);
    this.fboBlurV = createFBO(gl, w, h, internalFormat, format, type);
  }

  render(
    gl: WebGL2RenderingContext,
    w: number,
    h: number,
    sourceTex: WebGLTexture,
    depthTex: WebGLTexture | null,
    hasDepthMap: boolean,
    minLum: number,
    maxLum: number,
    params: ScanlineParams
  ): { smoothedTex: WebGLTexture; rawTex: WebGLTexture } {
    // Pass 0A: Conditioning & Elevation
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboInput.fbo);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.inputCondProg);
    gl.bindVertexArray(this.quadVAO_input);

    const ip = this.inputCondProg;
    gl.uniform1i(gl.getUniformLocation(ip, "u_source"), 0);
    gl.uniform1i(gl.getUniformLocation(ip, "u_depth"), 1);
    gl.uniform1i(gl.getUniformLocation(ip, "u_hasDepth"), hasDepthMap ? 1 : 0);
    gl.uniform2f(gl.getUniformLocation(ip, "u_texelSize"), 1 / w, 1 / h);
    gl.uniform1f(gl.getUniformLocation(ip, "u_inputBlack"), params.inputBlack);
    gl.uniform1f(gl.getUniformLocation(ip, "u_inputWhite"), params.inputWhite);
    gl.uniform1f(gl.getUniformLocation(ip, "u_gamma"), params.gamma);
    gl.uniform1i(gl.getUniformLocation(ip, "u_autoNorm"), params.autoNormalize ? 1 : 0);
    gl.uniform1f(gl.getUniformLocation(ip, "u_normMin"), minLum);
    gl.uniform1f(gl.getUniformLocation(ip, "u_normMax"), maxLum);
    gl.uniform1f(gl.getUniformLocation(ip, "u_reliefSource"), params.reliefSource);
    gl.uniform1i(gl.getUniformLocation(ip, "u_invert"), params.invert ? 1 : 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, depthTex || sourceTex);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Pass 0B & 0C: Separable Gaussian Blur
    const smoothness = params.contourSmoothness ?? params.lineSmoothing ?? 4.0;
    const baseRadius = Math.max(0.01, smoothness * (Math.min(w, h) / 400.0));

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboBlurH.fbo);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.blurHProg);
    gl.bindVertexArray(this.quadVAO_blurH);
    gl.uniform1i(gl.getUniformLocation(this.blurHProg, "u_tex"), 0);
    gl.uniform2f(gl.getUniformLocation(this.blurHProg, "u_texelSize"), 1 / w, 1 / h);
    gl.uniform1f(gl.getUniformLocation(this.blurHProg, "u_radius"), baseRadius);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fboInput.tex);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboBlurV.fbo);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.blurVProg);
    gl.bindVertexArray(this.quadVAO_blurV);
    gl.uniform1i(gl.getUniformLocation(this.blurVProg, "u_tex"), 0);
    gl.uniform2f(gl.getUniformLocation(this.blurVProg, "u_texelSize"), 1 / w, 1 / h);
    gl.uniform1f(gl.getUniformLocation(this.blurVProg, "u_radius"), baseRadius);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fboBlurH.tex);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    return { smoothedTex: this.fboBlurV.tex, rawTex: this.fboInput.tex };
  }

  destroy(gl: WebGL2RenderingContext): void {
    if (this.fboInput) {
      gl.deleteFramebuffer(this.fboInput.fbo);
      gl.deleteTexture(this.fboInput.tex);
    }
    if (this.fboBlurH) {
      gl.deleteFramebuffer(this.fboBlurH.fbo);
      gl.deleteTexture(this.fboBlurH.tex);
    }
    if (this.fboBlurV) {
      gl.deleteFramebuffer(this.fboBlurV.fbo);
      gl.deleteTexture(this.fboBlurV.tex);
    }
  }
}
