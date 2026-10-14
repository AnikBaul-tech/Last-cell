// Guest identity lives in localStorage: one {playerId, secret} per room, plus a remembered profile.
const sessionKey = (code) => `lastcell:session:${code}`;
const PROFILE_KEY = 'lastcell:profile';

const safe = (fn, fallback = null) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

export const loadSession = (code) => safe(() => JSON.parse(localStorage.getItem(sessionKey(code))));
export const saveSession = (code, s) => safe(() => localStorage.setItem(sessionKey(code), JSON.stringify(s)));
export const clearSession = (code) => safe(() => localStorage.removeItem(sessionKey(code)));

export const loadProfile = () => safe(() => JSON.parse(localStorage.getItem(PROFILE_KEY)));
export const saveProfile = (p) => safe(() => localStorage.setItem(PROFILE_KEY, JSON.stringify(p)));
