'use client';
import { AVATARS } from '@/lib/game/avatars';
import Avatar from './Avatar';

export default function AvatarPicker({ value, onChange, taken = [] }) {
  return (
    <div className="avatar-grid" role="radiogroup" aria-label="Choose your character">
      {AVATARS.map((a) => {
        const isTaken = taken.includes(a.id) && a.id !== value;
        const on = value === a.id;
        return (
          <button
            key={a.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={isTaken ? `${a.label} (taken)` : a.label}
            title={isTaken ? `${a.label} (taken)` : a.label}
            disabled={isTaken}
            className={`avatar-opt${on ? ' on' : ''}`}
            style={{ '--c': a.color }}
            onClick={() => onChange(a.id)}
          >
            <Avatar avatar={a} />
          </button>
        );
      })}
    </div>
  );
}
