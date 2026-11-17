// NEON DRIFT tuning: every number and colour the game runs on, in one place. The arena is a
// fixed 1280x720 logical field; the renderer scales it to the window, so no rule below depends
// on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 12,
  speed: 336,
  /** How fast the ship reaches full speed (per second of lerp toward the wanted velocity). */
  agility: 14,
  fireInterval: 0.16,
  rapidInterval: 0.085,
  rapidSeconds: 8,
  invulnerable: 2,
  bulletSpeed: 760,
  bulletLife: 0.85,
  bulletRadius: 3,
};

export const LIVES = 3;

/** Score for a kill, by enemy kind (see world.js for the kinds), before the combo multiplier. */
export const POINTS = { chaser: 50, mini: 25, splitter: 100, orbiter: 80 };

/** Combo: kills build it, it decays after comboWindow quiet seconds, a hit wipes it. */
export const COMBO = { window: 2.6, killsPerStep: 6, maxMultiplier: 8 };

export const ENEMY = {
  chaser: { radius: 15, hp: 1, speed: 118, accel: 260 },
  mini: { radius: 9, hp: 1, speed: 196, accel: 420 },
  splitter: { radius: 27, hp: 3, speed: 66, accel: 120, children: 3 },
  orbiter: { radius: 17, hp: 2, speed: 132, orbitRange: 235, orbitSpeed: 1.65, shotInterval: 2.3, shotSpeed: 215 },
  /** Per-wave growth: speed multiplier per wave past the first, capped. */
  speedPerWave: 0.045,
  speedCap: 1.45,
};

export const WAVE = {
  /** Enemies in wave n: base + perWave * (n - 1). */
  base: 5,
  perWave: 3,
  spawnInterval: 0.85,
  spawnIntervalPerWave: 0.045,
  minSpawnInterval: 0.3,
  /** Quiet seconds between the last kill of a wave and the next wave's banner. */
  intermission: 2.4,
  bannerSeconds: 2.2,
  /** Enemies spawn at least this far from the ship. */
  safeRadius: 280,
};

export const POWERUP = {
  dropChance: 0.12,
  life: 9,
  radius: 13,
  pickupRadius: 30,
  drift: 26,
};

export const POOLS = { bullets: 256, hostile: 128, enemies: 96, particles: 560, floaters: 36, powerups: 16, stars: 120 };

export const PALETTE = {
  backdrop: '#04050c',
  spaceTop: '#070a1a',
  spaceBottom: '#03040a',
  grid: 'rgba(64, 90, 180, 0.13)',
  player: '#59f7ff',
  playerCore: '#eafcff',
  bullet: '#aefcff',
  hostile: '#ff5d8f',
  chaser: '#ff3d7f',
  mini: '#ff8fb3',
  splitter: '#ff9f2e',
  orbiter: '#37e0a0',
  rapid: '#ffe74a',
  shield: '#57b6ff',
  bomb: '#ff5340',
  text: '#eef6ff',
  muted: '#8fa3c8',
  danger: '#ff2e4d',
  panel: 'rgba(10, 14, 30, 0.88)',
  panelEdge: '#2de2ff',
};

export const FONT = '"Segoe UI", system-ui, -apple-system, sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'neon-drift.best';
