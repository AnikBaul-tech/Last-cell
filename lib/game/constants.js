// Shared by server and client. Pure data, no side effects.

export const DIRS = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

export const DEFAULT_SETTINGS = {
  maxPlayers: 8,
  gridSize: 8,
  planSeconds: 20,
  revealSeconds: 7,
  moveRange: 1, // how many cells (incl. diagonals) a player may move per round
  shrinkMode: 'ring', // 'ring' = remove the whole outer layer (N -> N-2), 'step' = N -> N-1
};

export const LIMITS = {
  maxPlayers: [2, 16],
  gridSize: [4, 12],
  planSeconds: [8, 90],
  revealSeconds: [4, 15],
  moveRange: [1, 3],
};

export const SPAWN_REVEAL_MS = 4000; // "meet the players" reveal before round 1
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 5;

const clampInt = (v, [lo, hi], fallback) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
};

export function sanitizeSettings(input = {}, base = DEFAULT_SETTINGS) {
  const merged = { ...DEFAULT_SETTINGS, ...base, ...input };
  return {
    maxPlayers: clampInt(merged.maxPlayers, LIMITS.maxPlayers, DEFAULT_SETTINGS.maxPlayers),
    gridSize: clampInt(merged.gridSize, LIMITS.gridSize, DEFAULT_SETTINGS.gridSize),
    planSeconds: clampInt(merged.planSeconds, LIMITS.planSeconds, DEFAULT_SETTINGS.planSeconds),
    revealSeconds: clampInt(merged.revealSeconds, LIMITS.revealSeconds, DEFAULT_SETTINGS.revealSeconds),
    moveRange: clampInt(merged.moveRange, LIMITS.moveRange, DEFAULT_SETTINGS.moveRange),
    shrinkMode: merged.shrinkMode === 'step' ? 'step' : 'ring',
  };
}
