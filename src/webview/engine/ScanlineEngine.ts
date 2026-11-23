/**
 * ScanlineX — Continuous Scalar Topographic Isoline WebGL2 Engine
 *
 * Pipeline:
 * - Pass 0 : PreprocessPipeline (Conditioning + Gaussian smoothing)
 * - Pass 1 : Continuous scalar phase field isolines with 3D tilt Pitch/Yaw perspective projection
 * - Pass 2 & 3 : BloomPipeline (4-level Dual-Kawase pyramid + chromatic dispersion)
 * - Pass 4 : Composite pass (Solid Tint, Gradient Ramp, Picture Colours, TPDF grain, split wipe)
 */

import type { ScanlineParams } from "@webview/types/params";
import { VERT_QUAD } from "../shaders/quad.vert";
import { VERT_SCANLINE } from "../shaders/scanline.vert";
import { FRAG_SCANLINE } from "../shaders/scanline.frag";
import { FRAG_COMPOSITE } from "../shaders/composite.frag";
import { linkProgram, createFBO, createQuadVAO, createGridVAO } from "./webglUtils";
import { PreprocessPipeline } from "./preprocessPipeline";
import { BloomPipeline } from "./bloomPipeline";

export type ViewportMode = "composite" | "lines" | "split";
export type OffscreenTarget = "composite" | "glow" | "lines";

export class ScanlineEngine {
  private gl: WebGL2RenderingContext;
  private width = 0;
  private height = 0;

  private scanlineProg!: WebGLProgram;
  private compositeProg!: WebGLProgram;

  private scanlineGridVAO!: WebGLVertexArrayObject;
  private scanlineIndexCount = 0;
  private quadVAO_comp!: WebGLVertexArrayObject;

  private fboFormat = 0;
  private fboType = 0;
  private fboInternalFormat = 0;
  private fboScanlines!: { fbo: WebGLFramebuffer; tex: WebGLTexture };

  private preprocess = new PreprocessPipeline();
  private bloom = new BloomPipeline();

  private sourceTex: WebGLTexture | null = null;
  private depthTex: WebGLTexture | null = null;
  private hasDepthMap = false;

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

    this.preprocess.init(gl);
    this.bloom.init(gl);
    this.scanlineProg = linkProgram(gl, VERT_SCANLINE, FRAG_SCANLINE);
    this.compositeProg = linkProgram(gl, VERT_QUAD, FRAG_COMPOSITE);

    const grid = createGridVAO(gl, this.scanlineProg, 32, 32);
    this.scanlineGridVAO = grid.vao;
    this.scanlineIndexCount = grid.indexCount;
    this.quadVAO_comp = createQuadVAO(gl, this.compositeProg);
    this.initialized = true;
  }

  resize(w: number, h: number): void {
    if (this.width === w && this.height === h && this.fboScanlines) return;
    const gl = this.gl;
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);

    const IF = this.fboInternalFormat;
    const F = this.fboFormat;
    const T = this.fboType;

    if (this.fboScanlines) {
      gl.deleteFramebuffer(this.fboScanlines.fbo);
      gl.deleteTexture(this.fboScanlines.tex);
    }

    this.preprocess.resize(gl, this.width, this.height, IF, F, T);
    this.fboScanlines = createFBO(gl, this.width, this.height, IF, F, T);
    this.bloom.resize(gl, this.width, this.height, IF, F, T);
  }

  uploadSourceTexture(pixels: Uint8Array, w: number, h: number): void {
    const gl = this.gl;
    if (!this.sourceTex) this.sourceTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    let minL = 1.0;
    let maxL = 0.0;
    const step = Math.max(1, Math.floor(pixels.length / (4 * 12000)));
    for (let i = 0; i < pixels.length; i += 4 * step) {
      if (pixels[i + 3] > 12) {
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
    if (!this.depthTex) this.depthTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.depthTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, w, h, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, depthBuffer);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.hasDepthMap = true;
  }

  clearDepthTexture(): void {
    this.hasDepthMap = false;
  }

  hasDepth(): boolean {
    return this.hasDepthMap;
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

    // Pass 0: Input conditioning & separable Gaussian smoothing
    const { smoothedTex, rawTex } = this.preprocess.render(
      gl, W, H, this.sourceTex, this.depthTex, this.hasDepthMap, this.minLum, this.maxLum, params
    );

    // Pass 1: Continuous Scalar Topographic Isoline Field
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboScanlines.fbo);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.scanlineProg);
    gl.bindVertexArray(this.scanlineGridVAO);

    const sp = this.scanlineProg;
    gl.uniform1i(gl.getUniformLocation(sp, "u_elevation"), 0);
    gl.uniform1i(gl.getUniformLocation(sp, "u_rawLuma"), 1);
    gl.uniform1i(gl.getUniformLocation(sp, "u_source"), 2);
    gl.uniform1i(gl.getUniformLocation(sp, "u_depth"), 3);
    gl.uniform1i(gl.getUniformLocation(sp, "u_hasDepth"), this.hasDepthMap ? 1 : 0);
    gl.uniform1f(gl.getUniformLocation(sp, "u_depthCutoff"), params.depthCutoff);
    gl.uniform1f(gl.getUniformLocation(sp, "u_aspect"), W / H);
    const dirMode = params.direction === "circles" ? 2 : params.direction === "horizontal" ? 1 : 0;
    gl.uniform1i(gl.getUniformLocation(sp, "u_direction"), dirMode);
    gl.uniform1f(gl.getUniformLocation(sp, "u_centerX"), params.centerX ?? 0.5);
    gl.uniform1f(gl.getUniformLocation(sp, "u_centerY"), params.centerY ?? 0.5);
    const topoWarp = params.topographicWarp ?? params.displacement ?? 40;
    gl.uniform1f(gl.getUniformLocation(sp, "u_displacement"), topoWarp * 0.005);
    const flow = params.depthFlow ?? params.jitterX ?? 20;
    gl.uniform1f(gl.getUniformLocation(sp, "u_organicWarp"), flow * 0.003);
    gl.uniform1f(gl.getUniformLocation(sp, "u_noiseScale"), params.flowScale ?? params.noiseScale ?? 12.0);
    gl.uniform1f(gl.getUniformLocation(sp, "u_noiseSeed"), params.noiseSeed);
    gl.uniform1f(gl.getUniformLocation(sp, "u_density"), params.density);
    gl.uniform1f(gl.getUniformLocation(sp, "u_lineThickness"), Math.max(0.2, params.lineThickness));
    gl.uniform1f(gl.getUniformLocation(sp, "u_pixelQuant"), (params.pixel ?? 0) / 100);
    gl.uniform1f(gl.getUniformLocation(sp, "u_cutoff"), params.cutoff);
    gl.uniform1f(gl.getUniformLocation(sp, "u_noise"), params.noise);
    gl.uniform1f(gl.getUniformLocation(sp, "u_edgeAccent"), params.edgeAccent);
    gl.uniform1f(gl.getUniformLocation(sp, "u_detailBoost"), params.detailBoost ?? 0.35);

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

    gl.uniform1f(gl.getUniformLocation(sp, "u_tiltPitch"), (params.tiltPitch * Math.PI) / 180);
    gl.uniform1f(gl.getUniformLocation(sp, "u_tiltYaw"), (params.tiltYaw * Math.PI) / 180);
    gl.uniform1f(gl.getUniformLocation(sp, "u_perspective"), params.perspective ?? 0.45);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, smoothedTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, rawTex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTex);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.depthTex || smoothedTex);

    gl.drawElements(gl.TRIANGLES, this.scanlineIndexCount, gl.UNSIGNED_INT, 0);
    gl.disable(gl.BLEND);

    // Pass 2 & 3: Bloom
    const bloomTex = this.bloom.render(gl, this.fboScanlines.tex, params.soft, params.dispersion);

    // Pass 4: Composite
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

    const viewModeInt = viewMode === "lines" ? 1 : viewMode === "split" ? 2 : 0;
    gl.uniform1i(gl.getUniformLocation(cp, "u_viewMode"), viewModeInt);
    gl.uniform1f(gl.getUniformLocation(cp, "u_splitX"), splitX);

    const exportTargetInt = exportTarget === "glow" ? 1 : exportTarget === "lines" ? 2 : 0;
    gl.uniform1i(gl.getUniformLocation(cp, "u_exportTarget"), exportTargetInt);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fboScanlines.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bloomTex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTex);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

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
    if (this.fboScanlines) {
      gl.deleteFramebuffer(this.fboScanlines.fbo);
      gl.deleteTexture(this.fboScanlines.tex);
    }
    this.preprocess.destroy(gl);
    this.bloom.destroy(gl);
    if (this.scanlineGridVAO) gl.deleteVertexArray(this.scanlineGridVAO);
  }
}
