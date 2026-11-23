export interface ScanlineParams {
  // 0. INPUT & ISOLATION
  inputBlack: number;       // 0.00–0.90, default 0.00
  inputWhite: number;       // 0.10–1.00, default 1.00
  gamma: number;            // 0.20–3.00, default 1.00
  autoNormalize: boolean;   // default false
  depthCutoff: number;      // 0.00–1.00, default 0.00 (Z-plane cutoff)
  reliefSource: number;     // 0.00–1.00, default 0.00 (0% Luma <-> 100% 3D Depth)
  detailBoost: number;      // 0.00–1.00, default 0.35 (High-pass surface detail boost)

  // 1. SCALAR TOPOGRAPHIC ISOLINE FIELD & 3D PERSPECTIVE
  direction: "vertical" | "horizontal" | "circles";
  centerX: number;          // 0.0–1.0, default 0.5 (Concentric circles center X)
  centerY: number;          // 0.0–1.0, default 0.5 (Concentric circles center Y)
  density: number;          // 20–350, default 80
  contourSmoothness: number;// 0.0–15.0, default 4.0 (Multi-tap Gaussian smoothing radius)
  topographicWarp: number;  // 0–100, default 40 (How strongly elevation bends lines into closed rings)
  depthFlow: number;        // 0–100, default 20 (Elevation-modulated organic FBM warp)
  flowScale: number;        // 1.0–50.0, default 12.0 (Spatial frequency of FBM flow)

  // 3D Perspective Tilt
  tiltPitch: number;        // -60 to +60 degrees, default 0 (3D Pitch)
  tiltYaw: number;          // -60 to +60 degrees, default 0 (3D Yaw)
  perspective: number;      // 0.00–1.50, default 0.45 (Perspective FOV)

  // Line & Noise Styling
  lineThickness: number;    // 0.5–4.0, default 1.0
  pixel: number;            // 0–100, default 0 (Pixel bead quantization)
  cutoff: number;           // 0–1, default 0.05
  noise: number;            // 0–1, default 0.15 (Dust Noise)
  noiseSeed: number;        // integer, randomized on New Seed
  invert: boolean;
  edgeAccent: number;       // 0.00–1.00, default 0.00 (Sobel gradient boost along silhouettes)

  // Preserved backwards compatibility aliases
  lineSmoothing?: number;
  displacement?: number;
  zExtrude?: number;
  warpX?: number;
  warpY?: number;
  jitterX?: number;
  jitterY?: number;
  noiseScale?: number;

  // 2. LIGHT & OPTICS
  glow: number;             // 0–1, default 0.4
  soft: number;             // 0–1, default 0.5
  dispersion: number;       // 0–1, default 0.3
  grain: number;            // 0–1, default 0.1

  // 3. COLOUR & OUTPUT
  colorMode: "solid" | "gradient" | "picture"; // default "solid"
  colour: string;           // hex, default "#00ff88"
  shadowColor: string;      // hex, default "#080820" for gradient ramp
  peakColor: string;        // hex, default "#7dd3fc" for gradient ramp
  pictureColours: boolean;  // sync alias
  background: string;       // hex, default "#000000"
  transparent: boolean;
  keepAs: "one-layer" | "lines-glow";

  // Preset
  preset: string;
}

export const DEFAULT_PARAMS: ScanlineParams = {
  // 0. INPUT & ISOLATION
  inputBlack: 0.00,
  inputWhite: 1.00,
  gamma: 1.00,
  autoNormalize: false,
  depthCutoff: 0.00,
  reliefSource: 0.00,
  detailBoost: 0.35,

  // 1. SCALAR TOPOGRAPHIC ISOLINE FIELD & 3D PERSPECTIVE
  direction: "vertical",
  centerX: 0.5,
  centerY: 0.5,
  density: 80,
  contourSmoothness: 4.0,
  topographicWarp: 40,
  depthFlow: 20,
  flowScale: 12.0,

  // 3D Perspective Tilt
  tiltPitch: 0,
  tiltYaw: 0,
  perspective: 0.45,

  // Line & Noise Styling
  lineThickness: 1.0,
  pixel: 0,
  cutoff: 0.05,
  noise: 0.15,
  noiseSeed: 42,
  invert: false,
  edgeAccent: 0.0,

  // Backwards compatibility
  lineSmoothing: 4.0,
  displacement: 40,
  zExtrude: 40,
  warpX: 20,
  warpY: 40,
  jitterX: 0,
  jitterY: 0,
  noiseScale: 12.0,

  // 2. LIGHT & OPTICS
  glow: 0.4,
  soft: 0.5,
  dispersion: 0.3,
  grain: 0.1,

  // 3. COLOUR & OUTPUT
  colorMode: "solid",
  colour: "#00ff88",
  shadowColor: "#080820",
  peakColor: "#7dd3fc",
  pictureColours: false,
  background: "#000000",
  transparent: false,
  keepAs: "one-layer",
  preset: "Mono",
};

export const PRESETS: Record<string, Partial<ScanlineParams>> = {
  Mono: {
    direction: "horizontal",
    colorMode: "solid",
    colour: "#e8e8e8",
    pictureColours: false,
    glow: 0.35,
    soft: 0.45,
    dispersion: 0.1,
    density: 85,
    contourSmoothness: 4.5,
    topographicWarp: 45,
    depthFlow: 12,
    flowScale: 10.0,
    perspective: 0.45,
    detailBoost: 0.35,
    pixel: 0,
    cutoff: 0.04,
    noise: 0.10,
    grain: 0.08,
    lineThickness: 1.0,
    edgeAccent: 0.25,
    tiltPitch: 0,
    tiltYaw: 0,
  },
  Iridescent: {
    direction: "vertical",
    colorMode: "gradient",
    colour: "#7dd3fc",
    shadowColor: "#1e1b4b",
    peakColor: "#7dd3fc",
    pictureColours: false,
    glow: 0.55,
    soft: 0.6,
    dispersion: 0.65,
    density: 75,
    contourSmoothness: 3.5,
    topographicWarp: 50,
    depthFlow: 25,
    flowScale: 14.0,
    perspective: 0.6,
    detailBoost: 0.45,
    pixel: 15,
    cutoff: 0.03,
    noise: 0.15,
    grain: 0.12,
    lineThickness: 1.1,
    edgeAccent: 0.35,
    tiltPitch: 12,
    tiltYaw: -10,
  },
  Topographic: {
    direction: "horizontal",
    colorMode: "gradient",
    colour: "#22c55e",
    shadowColor: "#052e16",
    peakColor: "#4ade80",
    pictureColours: false,
    glow: 0.25,
    soft: 0.35,
    dispersion: 0.05,
    density: 120,
    contourSmoothness: 5.5,
    topographicWarp: 60,
    depthFlow: 15,
    flowScale: 8.0,
    perspective: 0.5,
    detailBoost: 0.55,
    pixel: 0,
    cutoff: 0.07,
    noise: 0.08,
    grain: 0.05,
    lineThickness: 0.85,
    edgeAccent: 0.5,
    tiltPitch: 15,
    tiltYaw: 0,
  },
  "Radial Ripple": {
    direction: "circles",
    centerX: 0.5,
    centerY: 0.5,
    colorMode: "gradient",
    colour: "#7dd3fc",
    shadowColor: "#0c1427",
    peakColor: "#7dd3fc",
    pictureColours: false,
    glow: 0.48,
    soft: 0.55,
    dispersion: 0.3,
    density: 65,
    contourSmoothness: 4.0,
    topographicWarp: 45,
    depthFlow: 20,
    flowScale: 12.0,
    perspective: 0.45,
    detailBoost: 0.3,
    pixel: 0,
    cutoff: 0.04,
    noise: 0.12,
    grain: 0.08,
    lineThickness: 1.15,
    edgeAccent: 0.3,
    tiltPitch: 0,
    tiltYaw: 0,
  },
  "Sparse Dust": {
    direction: "horizontal",
    colorMode: "solid",
    colour: "#fbbf24",
    pictureColours: false,
    glow: 0.45,
    soft: 0.5,
    dispersion: 0.35,
    density: 45,
    contourSmoothness: 2.5,
    topographicWarp: 50,
    depthFlow: 35,
    flowScale: 22.0,
    perspective: 0.55,
    detailBoost: 0.3,
    pixel: 50,
    cutoff: 0.15,
    noise: 0.55,
    grain: 0.25,
    lineThickness: 1.0,
    edgeAccent: 0.2,
    tiltPitch: 0,
    tiltYaw: 0,
  },
};
