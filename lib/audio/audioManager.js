// Tiny audio engine: looping BGM (HTMLAudio) + synthesized SFX (WebAudio). Client-side only.
import { BGM_SRC, DEFAULT_BGM_VOLUME, DEFAULT_SFX_VOLUME, SFX_FILES } from './config.js';

const KEY = 'lastcell:audio';
const state = { bgmOn: true, sfxOn: true, bgmVol: DEFAULT_BGM_VOLUME, sfxVol: DEFAULT_SFX_VOLUME };
let loaded = false;
let ctx = null;
let noiseBuf = null;
let bgmEl = null;

function load() {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  try {
    Object.assign(state, JSON.parse(localStorage.getItem(KEY)) || {});
  } catch {}
}
function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
}

export function getAudioState() {
  load();
  return { ...state };
}

function getCtx() {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function noiseBuffer(c) {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

function tone(c, { type = 'sine', f0, f1 = f0, dur = 0.2, vol = 0.5, delay = 0 }) {
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(c, { dur = 0.15, vol = 0.5, type = 'highpass', freq = 800, delay = 0 }) {
  const t = c.currentTime + delay;
  const s = c.createBufferSource();
  s.buffer = noiseBuffer(c);
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(Math.max(0.0002, vol), t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(c.destination);
  s.start(t);
  s.stop(t + dur + 0.05);
}

const SYNTH = {
  shoot: (c, v) => {
    noise(c, { dur: 0.2, vol: v * 0.9, type: 'highpass', freq: 900 });
    tone(c, { type: 'sine', f0: 190, f1: 40, dur: 0.18, vol: v });
  },
  die: (c, v) => {
    tone(c, { type: 'sawtooth', f0: 420, f1: 60, dur: 0.6, vol: v * 0.45 });
    noise(c, { dur: 0.25, vol: v * 0.35, type: 'lowpass', freq: 1200 });
  },
  fall: (c, v) => {
    tone(c, { type: 'sine', f0: 700, f1: 70, dur: 0.8, vol: v * 0.5 });
    noise(c, { dur: 0.5, vol: v * 0.2, type: 'bandpass', freq: 500 });
  },
  win: (c, v) => [523, 659, 784, 1047].forEach((f, i) => tone(c, { type: 'triangle', f0: f, dur: 0.28, vol: v * 0.5, delay: i * 0.14 })),
  lose: (c, v) => [392, 330, 262].forEach((f, i) => tone(c, { type: 'triangle', f0: f, dur: 0.35, vol: v * 0.45, delay: i * 0.2 })),
  click: (c, v) => tone(c, { type: 'square', f0: 620, f1: 480, dur: 0.05, vol: v * 0.18 }),
  aim: (c, v) => tone(c, { type: 'square', f0: 340, f1: 520, dur: 0.07, vol: v * 0.2 }),
  lock: (c, v) => {
    tone(c, { type: 'triangle', f0: 520, dur: 0.08, vol: v * 0.4 });
    tone(c, { type: 'triangle', f0: 780, dur: 0.12, vol: v * 0.4, delay: 0.08 });
  },
  tick: (c, v) => tone(c, { type: 'sine', f0: 880, dur: 0.06, vol: v * 0.25 }),
  move: (c, v) => noise(c, { dur: 0.18, vol: v * 0.2, type: 'bandpass', freq: 1400 }),
  join: (c, v) => tone(c, { type: 'sine', f0: 660, f1: 880, dur: 0.15, vol: v * 0.3 }),
};

export function playSfx(name) {
  load();
  if (!state.sfxOn) return;
  const file = SFX_FILES[name];
  if (file) {
    const a = new Audio(file);
    a.volume = Math.min(1, state.sfxVol);
    a.play().catch(() => {});
    return;
  }
  const c = getCtx();
  if (c && SYNTH[name]) SYNTH[name](c, state.sfxVol);
}

export function startBgm() {
  load();
  if (typeof window === 'undefined' || !state.bgmOn) return;
  if (!bgmEl) {
    bgmEl = new Audio(BGM_SRC);
    bgmEl.loop = true;
    bgmEl.preload = 'auto';
    bgmEl.volume = state.bgmVol;
  }
  bgmEl.play().catch(() => {}); // blocked until a user gesture, or file missing: both fine
}

export function setBgmOn(on) {
  load();
  state.bgmOn = on;
  persist();
  if (on) startBgm();
  else bgmEl?.pause();
}
export function setBgmVolume(v) {
  load();
  state.bgmVol = v;
  persist();
  if (bgmEl) bgmEl.volume = v;
}
export function setSfxOn(on) {
  load();
  state.sfxOn = on;
  persist();
}
export function setSfxVolume(v) {
  load();
  state.sfxVol = v;
  persist();
}
