export interface ScanlineParams {
  // 0. INPUT & ISOLATION
  inputBlack: number;       // 0.00–0.90, default 0.00
  inputWhite: number;       // 0.10–1.00, default 1.00
  gamma: number;            // 0.20–3.00, default 1.00
  autoNormalize: boolean;   // default false
  depthCutoff: number;      // 0.00–1.00, default 0.00 (Z-plane cutoff)
  reliefSource: number;     // 0.00–1.00, default 0.00 (0% Luma <-> 100% 3D Depth)

  // 1. LINES
  density: number;          // 20–400, default 80
  displacement: number;     // 0–100, default 40
  pixel: number;            // 0–100, default 0 (0 = smooth, 100 = max pixelation)
  cutoff: number;           // 0–1, default 0.05
  noise: number;            // 0–1, default 0.15
  noiseSeed: number;        // integer, randomized on New Seed
  direction: "vertical" | "horizontal";
  invert: boolean;
  lineThickness: number;    // 0.5–4.0, default 1.0
  edgeAccent: number;       // 0.00–1.00, default 0.00 (Sobel gradient boost along silhouettes)
  tiltPitch: number;        // -45 to +45 degrees, default 0
  tiltYaw: number;          // -45 to +45 degrees, default 0

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
  pictureColours: boolean;  // preserved for backwards compatibility / sync
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

  // 1. LINES
  density: 80,
  displacement: 40,
  pixel: 0,
  cutoff: 0.05,
  noise: 0.15,
  noiseSeed: 42,
  direction: "vertical",
  invert: false,
  lineThickness: 1.0,
  edgeAccent: 0.0,
  tiltPitch: 0,
  tiltYaw: 0,

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
    colorMode: "solid",
    colour: "#e8e8e8",
    pictureColours: false,
    glow: 0.35,
    soft: 0.45,
    dispersion: 0.1,
    density: 80,
    displacement: 38,
    pixel: 0,
    cutoff: 0.04,
    noise: 0.12,
    grain: 0.08,
    lineThickness: 1.0,
    edgeAccent: 0.25,
    tiltPitch: 0,
    tiltYaw: 0,
  },
  Iridescent: {
    colorMode: "gradient",
    colour: "#7dd3fc",
    shadowColor: "#1e1b4b",
    peakColor: "#7dd3fc",
    pictureColours: false,
    glow: 0.55,
    soft: 0.6,
    dispersion: 0.65,
    density: 70,
    displacement: 45,
    pixel: 15,
    cutoff: 0.03,
    noise: 0.18,
    grain: 0.12,
    lineThickness: 1.2,
    edgeAccent: 0.4,
    tiltPitch: 12,
    tiltYaw: -10,
  },
  Topographic: {
    colorMode: "gradient",
    colour: "#22c55e",
    shadowColor: "#052e16",
    peakColor: "#4ade80",
    pictureColours: false,
    glow: 0.25,
    soft: 0.35,
    dispersion: 0.05,
    density: 120,
    displacement: 32,
    pixel: 0,
    cutoff: 0.08,
    noise: 0.08,
    grain: 0.05,
    lineThickness: 0.85,
    edgeAccent: 0.6,
    tiltPitch: 18,
    tiltYaw: 0,
  },
  Phosphor: {
    colorMode: "solid",
    colour: "#39ff14",
    pictureColours: false,
    glow: 0.7,
    soft: 0.75,
    dispersion: 0.2,
    density: 60,
    displacement: 55,
    pixel: 30,
    cutoff: 0.02,
    noise: 0.22,
    grain: 0.18,
    lineThickness: 1.4,
    edgeAccent: 0.3,
    tiltPitch: -8,
    tiltYaw: 8,
  },
  "Sparse Dust": {
    colorMode: "solid",
    colour: "#fbbf24",
    pictureColours: false,
    glow: 0.45,
    soft: 0.5,
    dispersion: 0.35,
    density: 40,
    displacement: 60,
    pixel: 60,
    cutoff: 0.15,
    noise: 0.55,
    grain: 0.25,
    lineThickness: 1.0,
    edgeAccent: 0.2,
    tiltPitch: 0,
    tiltYaw: 0,
  },
};
