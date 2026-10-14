// ---- Audio configuration -------------------------------------------------
// Background music: put your file at  public/audio/bgm.mp3  (or change the path here).
export const BGM_SRC = '/audio/bgm.mp3';
export const DEFAULT_BGM_VOLUME = 0.35;
export const DEFAULT_SFX_VOLUME = 0.7;

// Sound effects are synthesized by default. To use your own files, drop them in
// public/audio/ and set the path, e.g.  shoot: '/audio/shoot.mp3'
export const SFX_FILES = {
  shoot: null,
  die: null,
  fall: null,
  win: null,
  lose: null,
  click: null,
  aim: null,
  lock: null,
  tick: null,
  move: null,
  join: null,
};
