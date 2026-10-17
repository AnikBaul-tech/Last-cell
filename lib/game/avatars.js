// Characters players can pick. Each one is an SVG in /public/avatars/<id>.svg.
// To swap in your own art, replace the SVG (or PNG) file and update `src` below.
// Keep the ids stable: they are what gets stored in the database.
const make = (id, label, color) => ({ id, label, color, src: `/avatars/${id}.svg` });

export const AVATARS = [
  make('cowboy', 'Cowboy', '#d99a4e'),
  make('ninja', 'Ninja', '#7d8597'),
  make('robot', 'Robot', '#5fb3d9'),
  make('alien', 'Alien', '#7bd88f'),
  make('wizard', 'Wizard', '#a98bf0'),
  make('fox', 'Fox', '#f08a4b'),
  make('panda', 'Panda', '#d8d8e0'),
  make('frog', 'Frog', '#8fd14f'),
  make('lion', 'Lion', '#f2c14e'),
  make('octopus', 'Octopus', '#e86a92'),
  make('ghost', 'Ghost', '#c9d6ee'),
  make('pumpkin', 'Pumpkin', '#f5883a'),
  make('vampire', 'Vampire', '#c2455f'),
  make('unicorn', 'Unicorn', '#f39bd5'),
  make('tiger', 'Tiger', '#f0a23c'),
  make('penguin', 'Penguin', '#6fa3e0'),
];

const BY_ID = Object.fromEntries(AVATARS.map((a) => [a.id, a]));
export const FALLBACK_AVATAR = { id: 'unknown', label: 'Unknown', color: '#8e84a3', src: '/avatars/unknown.svg' };

export const getAvatar = (id) => BY_ID[id] || FALLBACK_AVATAR;
export const isValidAvatar = (id) => Boolean(BY_ID[id]);
