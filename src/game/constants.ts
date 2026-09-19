// ---------------------------------------------------------------------------
// Core tuning values for the pseudo-3D racer
// ---------------------------------------------------------------------------

export const SEGMENT_LENGTH = 200; // world units per road segment
export const RUMBLE_LENGTH = 3; // segments per kerb stripe
export const LANES = 3;
export const ROAD_WIDTH = 2000; // half-width of the road in world units
export const CAMERA_HEIGHT = 1000;
export const FIELD_OF_VIEW = 100;
export const CAMERA_DEPTH = 1 / Math.tan(((FIELD_OF_VIEW / 2) * Math.PI) / 180);
export const PLAYER_Z = CAMERA_HEIGHT * CAMERA_DEPTH; // player car distance in front of camera
export const FOG_DENSITY = 5;

export const MAX_SPEED = SEGMENT_LENGTH * 60; // world units / second at 100%
export const ACCEL = MAX_SPEED / 3.2;
export const BRAKING = -MAX_SPEED * 1.1;
export const DECEL = -MAX_SPEED / 5;
export const OFF_ROAD_DECEL = -MAX_SPEED / 1.4;
export const OFF_ROAD_LIMIT = MAX_SPEED / 4;
export const CENTRIFUGAL = 0.21;
export const STEER_FLOOR = 0.3; // steering authority retained at standstill (0..1)

// Car geometry (normalised road units, where the road spans -1..1)
export const CAR_HALF_W = 0.22; // visual half-width
export const CAR_WORLD_W = CAR_HALF_W * 2 * ROAD_WIDTH; // world units for sprite scaling
export const COLLIDE_HALF_W = 0.175; // forgiving collision half-width
export const NEAR_MISS_DIST = 0.7; // lateral distance that counts as a close call

// Run rules
export const START_TIME = 40;
export const CHECKPOINT_SEGMENTS = 900;
export const CHECKPOINT_BONUS_START = 18;
export const CHECKPOINT_BONUS_MIN = 11;
export const METERS_PER_SEGMENT = 1.57;
export const TOP_KMH = 342; // displayed speed at 100% max speed

// Boost
export const BOOST_DURATION = 3.2;
export const BOOST_SPEED_MULT = 1.32;
export const BOOST_FROM_NEAR_MISS = 0.22;
export const BOOST_FROM_OVERTAKE = 0.08;

// Scoring
export const SCORE_PER_SEGMENT = 1;
export const SCORE_OVERTAKE = 100;
export const SCORE_NEAR_MISS = 250;
export const SCORE_CHECKPOINT = 1000;
export const COMBO_WINDOW = 4.5;

// Traffic
export const TRAFFIC_BASE = 110; // circuit is ~6300 segments long
export const TRAFFIC_PER_LEVEL = 18;
export const TRAFFIC_MAX = 260;

// Palette --------------------------------------------------------------------
export const COLORS = {
  skyTop: '#07061f',
  skyMid: '#2b1450',
  skyLow: '#8a2d5c',
  skyHorizon: '#f2894f',
  fog: '#d6796a',
  sun: '#ffd166',
  sunCore: '#fff3b0',
  mountains: '#2a1240',
  hills: '#170a24',
  light: { road: '#3a3a45', grass: '#1f5a33', rumble: '#f2f2f2', lane: '#e6e6e6', edge: '#f5f5f5' },
  dark: { road: '#35353f', grass: '#1a4d2c', rumble: '#e10600', lane: '#e6e6e6', edge: '#f5f5f5' },
  start: { road: '#e8e8e8', grass: '#1f5a33', rumble: '#e8e8e8', lane: '#111', edge: '#111' },
  finish: { road: '#151515', grass: '#1f5a33', rumble: '#151515', lane: '#e8e8e8', edge: '#e8e8e8' },
  accent: '#e10600',
  gold: '#ffd400',
  boost: '#38bdf8',
};

export const FONT_DISPLAY = '"Russo One", "Titillium Web", system-ui, sans-serif';
export const FONT_UI = '"Titillium Web", system-ui, -apple-system, sans-serif';

export const STORAGE_KEY_SCORES = 'apexgp.highscores.v1';
export const STORAGE_KEY_MUTED = 'apexgp.muted';
export const STORAGE_KEY_DRIVER = 'apexgp.driver';
