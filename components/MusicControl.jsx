'use client';
import { useEffect, useState } from 'react';
import {
  getAudioState,
  setBgmOn,
  setBgmVolume,
  setSfxOn,
  setSfxVolume,
  startBgm,
} from '@/lib/audio/audioManager';

export default function MusicControl() {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState(null);

  useEffect(() => {
    setS(getAudioState());
    // Browsers block autoplay: start the music on the first interaction.
    const kick = () => {
      startBgm();
      window.removeEventListener('pointerdown', kick);
      window.removeEventListener('keydown', kick);
    };
    window.addEventListener('pointerdown', kick);
    window.addEventListener('keydown', kick);
    return () => {
      window.removeEventListener('pointerdown', kick);
      window.removeEventListener('keydown', kick);
    };
  }, []);

  if (!s) return null;
  const update = (fn, patch) => {
    fn();
    setS((prev) => ({ ...prev, ...patch }));
  };

  return (
    <div className="audio-ctl">
      {open && (
        <div className="audio-panel" role="dialog" aria-label="Sound settings">
          <label className="toggle">
            <input type="checkbox" checked={s.bgmOn} onChange={(e) => update(() => setBgmOn(e.target.checked), { bgmOn: e.target.checked })} />
            <span>Music</span>
          </label>
          <input
            type="range" min="0" max="1" step="0.05" value={s.bgmVol} aria-label="Music volume"
            onChange={(e) => update(() => setBgmVolume(Number(e.target.value)), { bgmVol: Number(e.target.value) })}
          />
          <label className="toggle">
            <input type="checkbox" checked={s.sfxOn} onChange={(e) => update(() => setSfxOn(e.target.checked), { sfxOn: e.target.checked })} />
            <span>Sound effects</span>
          </label>
          <input
            type="range" min="0" max="1" step="0.05" value={s.sfxVol} aria-label="Effects volume"
            onChange={(e) => update(() => setSfxVolume(Number(e.target.value)), { sfxVol: Number(e.target.value) })}
          />
        </div>
      )}
      <button type="button" className="audio-btn" aria-label="Sound settings" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {s.bgmOn || s.sfxOn ? '🔊' : '🔇'}
      </button>
    </div>
  );
}
