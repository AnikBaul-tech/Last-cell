// Characters players can pick. Swap emoji for image URLs later if you want custom art.
export const AVATARS = [
  { id: 'cowboy', emoji: '🤠', label: 'Cowboy', color: '#d99a4e' },
  { id: 'ninja', emoji: '🥷', label: 'Ninja', color: '#7d8597' },
  { id: 'robot', emoji: '🤖', label: 'Robot', color: '#5fb3d9' },
  { id: 'alien', emoji: '👽', label: 'Alien', color: '#7bd88f' },
  { id: 'wizard', emoji: '🧙', label: 'Wizard', color: '#a98bf0' },
  { id: 'fox', emoji: '🦊', label: 'Fox', color: '#f08a4b' },
  { id: 'panda', emoji: '🐼', label: 'Panda', color: '#d8d8e0' },
  { id: 'frog', emoji: '🐸', label: 'Frog', color: '#8fd14f' },
  { id: 'lion', emoji: '🦁', label: 'Lion', color: '#f2c14e' },
  { id: 'octopus', emoji: '🐙', label: 'Octopus', color: '#e86a92' },
  { id: 'ghost', emoji: '👻', label: 'Ghost', color: '#c9d6ee' },
  { id: 'pumpkin', emoji: '🎃', label: 'Pumpkin', color: '#f5883a' },
  { id: 'vampire', emoji: '🧛', label: 'Vampire', color: '#c2455f' },
  { id: 'unicorn', emoji: '🦄', label: 'Unicorn', color: '#f39bd5' },
  { id: 'tiger', emoji: '🐯', label: 'Tiger', color: '#f0a23c' },
  { id: 'penguin', emoji: '🐧', label: 'Penguin', color: '#6fa3e0' },
];

const BY_ID = Object.fromEntries(AVATARS.map((a) => [a.id, a]));
export const FALLBACK_AVATAR = { id: 'unknown', emoji: '❔', label: 'Unknown', color: '#8e84a3' };

export const getAvatar = (id) => BY_ID[id] || FALLBACK_AVATAR;
export const isValidAvatar = (id) => Boolean(BY_ID[id]);
