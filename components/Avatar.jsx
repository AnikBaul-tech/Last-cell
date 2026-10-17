'use client';

// Renders one character image. Pass the object returned by getAvatar().
export default function Avatar({ avatar, className = '' }) {
  return <img className={`avatar-img ${className}`.trim()} src={avatar.src} alt="" draggable={false} />;
}
