'use client';
import { useEffect, useState } from 'react';
import { playSfx } from '@/lib/audio/audioManager';

export default function Countdown({ endsAt, serverNow, beep = false }) {
  const [left, setLeft] = useState(null);

  useEffect(() => {
    if (!endsAt) return setLeft(null);
    const end = Date.parse(endsAt);
    const calc = () => Math.max(0, Math.ceil((end - serverNow()) / 1000));
    setLeft(calc());
    const id = setInterval(() => setLeft(calc()), 200);
    return () => clearInterval(id);
  }, [endsAt, serverNow]);

  useEffect(() => {
    if (beep && left !== null && left > 0 && left <= 5) playSfx('tick');
  }, [left, beep]);

  if (left === null) return null;
  return (
    <div className={`countdown${beep && left <= 5 ? ' urgent' : ''}`} aria-live="off">
      {left}
    </div>
  );
}
