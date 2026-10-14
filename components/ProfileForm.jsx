'use client';
import AvatarPicker from './AvatarPicker';

export default function ProfileForm({ name, avatar, onName, onAvatar, taken, onNameBlur }) {
  return (
    <div className="stack">
      <label className="field">
        <span>Your name</span>
        <input
          value={name}
          maxLength={14}
          placeholder="Guest"
          autoComplete="off"
          onChange={(e) => onName(e.target.value)}
          onBlur={onNameBlur}
        />
      </label>
      <div className="field">
        <span>Your character</span>
        <AvatarPicker value={avatar} onChange={onAvatar} taken={taken} />
      </div>
    </div>
  );
}
