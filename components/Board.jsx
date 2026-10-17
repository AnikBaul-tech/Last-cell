'use client';
import { inBounds } from '@/lib/game/engine';

// barrel rotation (degrees, clockwise from pointing right)
const ANGLE = { right: 0, downright: 45, down: 90, downleft: 135, left: 180, upleft: 225, up: 270, upright: 315 };

/**
 * Presentational board. It knows nothing about game phases:
 *  avatars: [{ key, src, color, x, y, dir, dead, fell, me, danger, fast, pop }]
 *  beams:   [{ key, from:{x,y}, end:{x,y}, color, hit }]
 *  reach:   Set of "x,y" cells to highlight   origin: {x,y} dotted marker
 */
export default function Board({ size, bounds, avatars = [], beams = [], reach, origin, onCellClick }) {
  const cells = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const key = `${x},${y}`;
      const cls = [
        'cell',
        (x + y) % 2 ? 'odd' : 'even',
        inBounds(bounds, x, y) ? '' : 'gone',
        reach?.has(key) ? 'reach' : '',
        origin && origin.x === x && origin.y === y ? 'origin' : '',
      ]
        .filter(Boolean)
        .join(' ');
      cells.push(<div key={key} className={cls} onClick={() => onCellClick?.(x, y)} />);
    }
  }

  const groups = {};
  avatars.forEach((a) => {
    (groups[`${a.x},${a.y}`] ||= []).push(a);
  });

  return (
    <div className="board" style={{ '--n': size }}>
      <div className="cells" style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>
        {cells}
      </div>

      <svg className="beams" viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        {beams.map((b) => (
          <g key={b.key}>
            <line
              className="beam"
              pathLength="1"
              x1={b.from.x + 0.5}
              y1={b.from.y + 0.5}
              x2={b.end.x + 0.5}
              y2={b.end.y + 0.5}
              stroke={b.color}
            />
            {b.hit && <circle className="spark" cx={b.end.x + 0.5} cy={b.end.y + 0.5} r="0.3" />}
          </g>
        ))}
      </svg>

      <div className="pawns">
        {avatars.map((a) => {
          const g = groups[`${a.x},${a.y}`];
          const n = g.length;
          const idx = g.indexOf(a);
          const ang = (idx / n) * Math.PI * 2 - Math.PI / 2;
          const r = n > 1 ? 0.22 : 0;
          const scale = n > 1 ? Math.max(0.55, 1 - (n - 1) * 0.12) : 1;
          const cls = ['pawn', a.me && 'me', a.dead && 'dead', a.fell && 'fell', a.danger && 'danger', a.fast && 'fast', a.pop && 'pop', a.ghost && 'ghost']
            .filter(Boolean)
            .join(' ');
          return (
            <div
              key={a.key}
              className={cls}
              title={a.label}
              style={{
                left: `${((a.x + 0.5 + Math.cos(ang) * r) / size) * 100}%`,
                top: `${((a.y + 0.5 + Math.sin(ang) * r) / size) * 100}%`,
                '--s': scale,
                '--c': a.color,
              }}
            >
              {a.dir && <span className="barrel" style={{ transform: `rotate(${ANGLE[a.dir]}deg)` }} />}
              <span className="face">
                <img className="avatar-img" src={a.src} alt="" draggable={false} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
