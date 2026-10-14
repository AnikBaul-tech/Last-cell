'use client';
import { useEffect, useRef, useState } from 'react';
import { LIMITS } from '@/lib/game/constants';

const ROWS = [
  { key: 'maxPlayers', label: 'Max players', fmt: (v) => v },
  { key: 'gridSize', label: 'Grid size', fmt: (v) => `${v} × ${v}` },
  { key: 'planSeconds', label: 'Planning time', fmt: (v) => `${v}s` },
  { key: 'revealSeconds', label: 'Reveal time', fmt: (v) => `${v}s` },
  { key: 'moveRange', label: 'Move range', fmt: (v) => (v === 1 ? '1 cell' : `${v} cells`) },
];

export default function SettingsPanel({ settings, editable, onSave, playerCount }) {
  const [draft, setDraft] = useState(settings);
  const [saved, setSaved] = useState('');
  const touched = useRef(false);

  useEffect(() => {
    if (!editable) setDraft(settings);
  }, [settings, editable]);

  useEffect(() => {
    if (!editable || !touched.current) return;
    setSaved('Saving…');
    const t = setTimeout(async () => {
      try {
        await onSave(draft);
        setSaved('Saved');
      } catch (e) {
        setSaved(e.message || 'Could not save');
      }
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const set = (patch) => {
    touched.current = true;
    setDraft((d) => ({ ...d, ...patch }));
  };
  const cells = draft.gridSize * draft.gridSize;

  return (
    <section className="card">
      <div className="card-head">
        <h2>Game settings</h2>
        {editable && saved && <span className="hint">{saved}</span>}
      </div>
      <div className="stack">
        {ROWS.map((r) => (
          <label className="setting" key={r.key}>
            <span>{r.label}</span>
            <input
              type="range"
              min={r.key === 'maxPlayers' ? Math.max(LIMITS.maxPlayers[0], playerCount || 0) : LIMITS[r.key][0]}
              max={LIMITS[r.key][1]}
              step="1"
              value={draft[r.key]}
              disabled={!editable}
              onChange={(e) => set({ [r.key]: Number(e.target.value) })}
            />
            <output>{r.fmt(draft[r.key])}</output>
          </label>
        ))}
        <label className="setting">
          <span>Arena shrinks</span>
          <select value={draft.shrinkMode} disabled={!editable} onChange={(e) => set({ shrinkMode: e.target.value })}>
            <option value="ring">Whole outer ring each round (8 → 6 → 4…)</option>
            <option value="step">One row and column each round (8 → 7 → 6…)</option>
          </select>
          <span />
        </label>
      </div>
      {draft.maxPlayers > cells && <p className="warn">A {draft.gridSize}×{draft.gridSize} grid has {cells} cells, fewer than the max players.</p>}
    </section>
  );
}
