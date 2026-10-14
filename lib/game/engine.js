// Pure game rules. No I/O. Used by the server to resolve rounds and by the client for validation hints.
import { DIRS } from './constants.js';

export const fullBounds = (n) => ({ x0: 0, y0: 0, x1: n - 1, y1: n - 1 });
export const inBounds = (b, x, y) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
export const boundsWidth = (b) => b.x1 - b.x0 + 1;
export const boundsHeight = (b) => b.y1 - b.y0 + 1;

export const chebyshev = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export function canMove(from, to, range, gridSize) {
  if (!Number.isInteger(to?.x) || !Number.isInteger(to?.y)) return false;
  if (to.x < 0 || to.y < 0 || to.x >= gridSize || to.y >= gridSize) return false;
  return chebyshev(from, to) <= range;
}

/**
 * Bounds for the round that follows `nextRound - 1`.
 * ring: peel the whole outer layer (needs at least 3x3), otherwise falls back to step.
 * step: lose one row + one column, alternating sides.
 * Returns null when the arena can't shrink any further.
 */
export function nextBounds(b, mode, nextRound) {
  const w = boundsWidth(b);
  const h = boundsHeight(b);
  if (mode === 'ring' && w >= 3 && h >= 3) {
    return { x0: b.x0 + 1, y0: b.y0 + 1, x1: b.x1 - 1, y1: b.y1 - 1 };
  }
  if (w <= 1 && h <= 1) return null;
  const n = { ...b };
  if (nextRound % 2 === 0) {
    if (w > 1) n.x1 -= 1;
    if (h > 1) n.y1 -= 1;
  } else {
    if (w > 1) n.x0 += 1;
    if (h > 1) n.y0 += 1;
  }
  return n;
}

export function spawnPositions(count, gridSize, rng = Math.random) {
  const cells = [];
  for (let y = 0; y < gridSize; y++) for (let x = 0; x < gridSize; x++) cells.push({ x, y });
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return cells.slice(0, count);
}

/**
 * Resolve one round.
 * players: [{ id, x, y }]  (alive players, committed positions)
 * actions: { [id]: { to: {x,y}, dir: 'up'|'down'|'left'|'right'|null } }
 * Rules:
 *  - Invalid / missing move => player stays put. Missing dir => no shot.
 *  - Ending the round on a destroyed cell => the player falls and dies (and does not shoot).
 *  - Everyone fires simultaneously. A shot hits the NEAREST player in its line (A->B->C: only B).
 *    Players sharing the nearest cell are all hit. Players in the shooter's own cell are safe.
 */
export function resolveRound({ round, bounds, gridSize, moveRange, shrinkMode, players, actions }) {
  const entries = players.map((p) => {
    const a = actions[p.id];
    const from = { x: p.x, y: p.y };
    let to = { ...from };
    if (a?.to && canMove(from, a.to, moveRange, gridSize) && inBounds(bounds, a.to.x, a.to.y)) {
      to = { x: a.to.x, y: a.to.y };
    }
    const fell = !inBounds(bounds, to.x, to.y);
    const dir = a && DIRS[a.dir] ? a.dir : null;
    return { id: p.id, from, to, dir, fell, dead: fell };
  });

  const standing = entries.filter((e) => !e.fell);
  const shots = [];

  for (const s of standing) {
    if (!s.dir) continue;
    const { dx, dy } = DIRS[s.dir];
    let best = Infinity;
    let hit = [];
    for (const t of standing) {
      if (t === s) continue;
      const rx = t.to.x - s.to.x;
      const ry = t.to.y - s.to.y;
      let dist;
      if (dx !== 0) {
        if (ry !== 0) continue;
        dist = rx * dx;
      } else {
        if (rx !== 0) continue;
        dist = ry * dy;
      }
      if (dist <= 0) continue;
      if (dist < best) {
        best = dist;
        hit = [t];
      } else if (dist === best) {
        hit.push(t);
      }
    }
    let end;
    if (hit.length) end = { ...hit[0].to };
    else if (s.dir === 'right') end = { x: bounds.x1, y: s.to.y };
    else if (s.dir === 'left') end = { x: bounds.x0, y: s.to.y };
    else if (s.dir === 'up') end = { x: s.to.x, y: bounds.y0 };
    else end = { x: s.to.x, y: bounds.y1 };

    shots.push({ by: s.id, from: { ...s.to }, dir: s.dir, end, hit: hit.map((h) => h.id) });
    hit.forEach((h) => {
      h.dead = true;
    });
  }

  const deaths = entries.filter((e) => e.dead).map((e) => e.id);
  const survivors = entries.filter((e) => !e.dead).map((e) => e.id);

  let over = false;
  let winnerId = null;
  let draw = false;
  if (survivors.length === 1) {
    over = true;
    winnerId = survivors[0];
  } else if (survivors.length === 0) {
    over = true;
    draw = true;
  } else if (!nextBounds(bounds, shrinkMode, round + 1)) {
    over = true; // arena can't shrink any more and several are still alive
    draw = true;
  }

  return {
    survivors,
    deaths,
    over,
    winnerId,
    draw,
    entries,
    result: {
      round,
      bounds,
      players: entries.map(({ id, from, to, dir, fell, dead }) => ({ id, from, to, dir, fell, dead })),
      shots,
      deaths,
      over,
      winnerId,
      draw,
    },
  };
}
