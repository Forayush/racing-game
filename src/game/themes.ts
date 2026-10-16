// Visual themes: sky, horizon, scenery and track-surface colours for each venue.

export interface SegColors {
  road: string;
  grass: string;
  rumble: string;
  /** Dashed lane markings; null on race circuits (real tracks don't have them). */
  lane: string | null;
  edge: string;
}

export interface SunStyle {
  color: string;
  core: string;
  glow: string;
  /** Radius as a fraction of min(W, H). */
  size: number;
  /** Compass bearing in radians (race mode moves it with the car's heading). */
  azimuth: number;
  /** Retro stripes across the lower half. */
  bands: boolean;
}

export type HorizonKind = 'range' | 'alps' | 'skyline' | 'dunes';

export interface Palette {
  id: string;
  /** Gradient stops, top of the sky → horizon. */
  sky: [number, string][];
  stars: number;
  sun: SunStyle | null;
  haze: string;
  fog: string;
  horizon: HorizonKind;
  mountains: [string, string];
  ridge: string;
  hills: string;
  /** Distant lights scattered on the near hills. */
  hillLights: number;
  night: boolean;
  light: SegColors;
  dark: SegColors;
  start: SegColors;
  finish: SegColors;
}

const RED = '#e10600';
const WHITE = '#f2f2f2';

function surface(road: [string, string], grass: [string, string], rumble: [string, string] = [WHITE, RED], lane: string | null = null) {
  return {
    light: { road: road[0], grass: grass[0], rumble: rumble[0], lane, edge: '#f5f5f5' },
    dark: { road: road[1], grass: grass[1], rumble: rumble[1], lane, edge: '#f5f5f5' },
    start: { road: '#e8e8e8', grass: grass[0], rumble: '#e8e8e8', lane: '#111', edge: '#111' },
    finish: { road: '#151515', grass: grass[0], rumble: '#151515', lane: '#e8e8e8', edge: '#e8e8e8' },
  };
}

/** The original synthwave sunset of the arcade mode. */
export const ARCADE_PALETTE: Palette = {
  id: 'arcade',
  sky: [
    [0, '#07061f'],
    [0.4, '#2b1450'],
    [0.72, '#8a2d5c'],
    [0.92, '#d9575b'],
    [1, '#f2894f'],
  ],
  stars: 1,
  sun: { color: '#ffd166', core: '#fff3b0', glow: 'rgba(255,170,90,0.55)', size: 0.16, azimuth: 0, bands: true },
  haze: '#d6796a',
  fog: '#d6796a',
  horizon: 'range',
  mountains: ['#4a1f5e', '#2a1240'],
  ridge: 'rgba(255,160,120,0.35)',
  hills: '#170a24',
  hillLights: 70,
  night: false,
  light: { road: '#3a3a45', grass: '#1f5a33', rumble: WHITE, lane: '#e6e6e6', edge: '#f5f5f5' },
  dark: { road: '#35353f', grass: '#1a4d2c', rumble: RED, lane: '#e6e6e6', edge: '#f5f5f5' },
  start: { road: '#e8e8e8', grass: '#1f5a33', rumble: '#e8e8e8', lane: '#111', edge: '#111' },
  finish: { road: '#151515', grass: '#1f5a33', rumble: '#151515', lane: '#e8e8e8', edge: '#e8e8e8' },
};

export const PALETTES: Record<string, Palette> = {
  parkland: {
    id: 'parkland',
    sky: [
      [0, '#173763'],
      [0.45, '#3a6cad'],
      [0.82, '#93b9de'],
      [1, '#f1dcab'],
    ],
    stars: 0,
    sun: { color: '#fff1c1', core: '#ffffff', glow: 'rgba(255,236,190,0.45)', size: 0.07, azimuth: 0.7, bands: false },
    haze: '#e6d7b5',
    fog: '#c9d3d6',
    horizon: 'range',
    mountains: ['#6880a0', '#53698a'],
    ridge: 'rgba(255,255,255,0.18)',
    hills: '#2d5132',
    hillLights: 0,
    night: false,
    ...surface(['#55575c', '#505257'], ['#4c8a3e', '#457f38']),
  },
  riviera: {
    id: 'riviera',
    sky: [
      [0, '#0a3a69'],
      [0.5, '#2a7dbf'],
      [0.86, '#9ed1ef'],
      [1, '#e6f3fb'],
    ],
    stars: 0,
    sun: { color: '#fff6d6', core: '#ffffff', glow: 'rgba(255,250,220,0.5)', size: 0.06, azimuth: 2.3, bands: false },
    haze: '#cfe6f4',
    fog: '#d6e4ec',
    horizon: 'range',
    mountains: ['#6d8aa4', '#55708b'],
    ridge: 'rgba(255,255,255,0.2)',
    hills: '#5b6470',
    hillLights: 0,
    night: false,
    ...surface(['#4d4f55', '#48494f'], ['#8c9097', '#84888f']),
  },
  ardennes: {
    id: 'ardennes',
    sky: [
      [0, '#363e4b'],
      [0.5, '#5f6875'],
      [0.85, '#979fa9'],
      [1, '#c7ccd2'],
    ],
    stars: 0,
    sun: null,
    haze: '#b7bdc5',
    fog: '#a8afb7',
    horizon: 'range',
    mountains: ['#3d4944', '#2e3934'],
    ridge: 'rgba(255,255,255,0.08)',
    hills: '#1e2a23',
    hillLights: 0,
    night: false,
    ...surface(['#47494d', '#424448'], ['#2e5a2f', '#295228']),
  },
  airfield: {
    id: 'airfield',
    sky: [
      [0, '#29405f'],
      [0.5, '#58779b'],
      [0.85, '#a8bdd3'],
      [1, '#dde5ee'],
    ],
    stars: 0,
    sun: { color: '#f4f1e6', core: '#ffffff', glow: 'rgba(255,255,240,0.3)', size: 0.055, azimuth: 1.2, bands: false },
    haze: '#d4dce5',
    fog: '#c1cad4',
    horizon: 'range',
    mountains: ['#70829a', '#5d6f87'],
    ridge: 'rgba(255,255,255,0.12)',
    hills: '#3b593d',
    hillLights: 0,
    night: false,
    ...surface(['#4f5156', '#4a4c51'], ['#4f8e44', '#48843e']),
  },
  goldenhour: {
    id: 'goldenhour',
    sky: [
      [0, '#1d2858'],
      [0.45, '#5a4c8a'],
      [0.76, '#df8a69'],
      [1, '#ffd398'],
    ],
    stars: 0.2,
    sun: { color: '#ffcf7a', core: '#fff1c9', glow: 'rgba(255,190,120,0.55)', size: 0.09, azimuth: 0.2, bands: false },
    haze: '#f1b48a',
    fog: '#e6a98a',
    horizon: 'range',
    mountains: ['#4a3a6a', '#392c54'],
    ridge: 'rgba(255,200,150,0.3)',
    hills: '#2a233f',
    hillLights: 25,
    night: false,
    ...surface(['#4c4b52', '#47464d'], ['#46793a', '#407134']),
  },
  dusk: {
    id: 'dusk',
    sky: ARCADE_PALETTE.sky,
    stars: 1,
    sun: { color: '#ffd166', core: '#fff3b0', glow: 'rgba(255,170,90,0.55)', size: 0.13, azimuth: -0.4, bands: true },
    haze: '#d6796a',
    fog: '#c96f68',
    horizon: 'range',
    mountains: ['#4a1f5e', '#2a1240'],
    ridge: 'rgba(255,160,120,0.35)',
    hills: '#170a24',
    hillLights: 90,
    night: false,
    ...surface(['#45454f', '#404049'], ['#2c6a3a', '#276134']),
  },
  nightcity: {
    id: 'nightcity',
    sky: [
      [0, '#02030d'],
      [0.5, '#0a0f2e'],
      [0.86, '#1a1e4a'],
      [1, '#2e2b60'],
    ],
    stars: 0.6,
    sun: null,
    haze: '#2b2a58',
    fog: '#1b1d40',
    horizon: 'skyline',
    mountains: ['#121638', '#0b0d26'],
    ridge: 'rgba(120,140,255,0.25)',
    hills: '#0b0d20',
    hillLights: 160,
    night: true,
    ...surface(['#3b3d46', '#373941'], ['#262832', '#22242d']),
  },
  desert: {
    id: 'desert',
    sky: [
      [0, '#0e1a3a'],
      [0.45, '#3b3f74'],
      [0.76, '#c9734d'],
      [1, '#f6b26b'],
    ],
    stars: 0.35,
    sun: { color: '#ffb35c', core: '#ffe2b0', glow: 'rgba(255,150,80,0.55)', size: 0.12, azimuth: -0.6, bands: false },
    haze: '#e9a970',
    fog: '#d99a6a',
    horizon: 'dunes',
    mountains: ['#7a5a46', '#5f4535'],
    ridge: 'rgba(255,190,120,0.3)',
    hills: '#4a3528',
    hillLights: 40,
    night: false,
    ...surface(['#4e4a4a', '#494545'], ['#c9a56b', '#bf9b61']),
  },
  island: {
    id: 'island',
    sky: [
      [0, '#123d78'],
      [0.5, '#3a7fc8'],
      [0.86, '#a5cff1'],
      [1, '#e8f4ff'],
    ],
    stars: 0,
    sun: { color: '#fff5d8', core: '#ffffff', glow: 'rgba(255,250,225,0.45)', size: 0.065, azimuth: 1.6, bands: false },
    haze: '#d2e6f6',
    fog: '#cddfed',
    horizon: 'skyline',
    mountains: ['#4c6680', '#3d556d'],
    ridge: 'rgba(255,255,255,0.15)',
    hills: '#2e4e39',
    hillLights: 0,
    night: false,
    ...surface(['#4f5156', '#4a4c51'], ['#4b8941', '#447e3b']),
  },
  alpine: {
    id: 'alpine',
    sky: [
      [0, '#0e3978'],
      [0.5, '#3983d5'],
      [0.86, '#a7d3f9'],
      [1, '#eef8ff'],
    ],
    stars: 0,
    sun: { color: '#fff8e0', core: '#ffffff', glow: 'rgba(255,252,230,0.5)', size: 0.06, azimuth: 2.6, bands: false },
    haze: '#deedf9',
    fog: '#cfe1ef',
    horizon: 'alps',
    mountains: ['#7b90a9', '#5c718a'],
    ridge: 'rgba(255,255,255,0.9)',
    hills: '#3a6a39',
    hillLights: 0,
    night: false,
    ...surface(['#4f5156', '#4a4c51'], ['#4f9944', '#488f3e']),
  },
};
