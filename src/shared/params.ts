export interface ScanlineParams {
  // 1. LINES
  density: number;        // 20–400, default 80
  displacement: number;   // 0–100, default 40
  pixel: number;          // 0–100, default 0 (0 = smooth, 100 = max pixelation)
  cutoff: number;         // 0–1, default 0.05
  noise: number;          // 0–1, default 0.15
  noiseSeed: number;      // integer, randomized on New Seed
  direction: "vertical" | "horizontal";
  invert: boolean;

  // 2. LIGHT & OPTICS
  glow: number;           // 0–1, default 0.4
  soft: number;           // 0–1, default 0.5
  dispersion: number;     // 0–1, default 0.3
  grain: number;          // 0–1, default 0.1

  // 3. COLOUR & OUTPUT
  colour: string;         // hex, default "#00ff88"
  pictureColours: boolean;
  background: string;     // hex, default "#000000"
  transparent: boolean;
  keepAs: "one-layer" | "lines-glow";

  // Preset
  preset: string;
}

export const DEFAULT_PARAMS: ScanlineParams = {
  density: 80,
  displacement: 40,
  pixel: 0,
  cutoff: 0.05,
  noise: 0.15,
  noiseSeed: 42,
  direction: "vertical",
  invert: false,
  glow: 0.4,
  soft: 0.5,
  dispersion: 0.3,
  grain: 0.1,
  colour: "#00ff88",
  pictureColours: false,
  background: "#000000",
  transparent: false,
  keepAs: "one-layer",
  preset: "Mono",
};

export const PRESETS: Record<string, Partial<ScanlineParams>> = {
  Mono: {
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
  },
  Iridescent: {
    colour: "#7dd3fc",
    pictureColours: true,
    glow: 0.55,
    soft: 0.6,
    dispersion: 0.65,
    density: 70,
    displacement: 45,
    pixel: 15,
    cutoff: 0.03,
    noise: 0.18,
    grain: 0.12,
  },
  Topographic: {
    colour: "#22c55e",
    pictureColours: false,
    glow: 0.25,
    soft: 0.35,
    dispersion: 0.05,
    density: 120,
    displacement: 25,
    pixel: 0,
    cutoff: 0.08,
    noise: 0.08,
    grain: 0.05,
  },
  Phosphor: {
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
  },
  "Sparse Dust": {
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
  },
};
