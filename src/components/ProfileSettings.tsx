import type { Profile } from "../lib/profile";

const fields: Array<{ key: keyof Profile; label: string; hint: string }> = [
  { key: "niche", label: "Niche", hint: "What space do you work in?" },
  { key: "audience", label: "Audience", hint: "Who should watch this?" },
  { key: "offer", label: "Offer", hint: "What do you make or sell?" },
  { key: "tone", label: "Tone", hint: "How should this sound?" },
  { key: "proof", label: "Proof", hint: "Use only verified facts." },
];

export default function ProfileSettings({ profile, onChange, onSave, saved, disabled }: {
  profile: Profile;
  onChange: (field: keyof Profile, value: string) => void;
  onSave: () => void;
  saved: string;
  disabled: boolean;
}) {
  return <details className="cf-profile">
    <summary><span><b>Brand context</b><small>{profile.niche || "Add your niche"}</small></span><span className="cf-profile-action">EDIT CONTEXT ↗</span></summary>
    <div className="cf-profile-fields">
      {fields.map(({ key, label, hint }) => <label key={key}>{label}<input disabled={disabled} value={profile[key]} onChange={(event) => onChange(key, event.target.value)} placeholder={hint} /></label>)}
      <div className="cf-profile-save"><button type="button" className="cf-button cf-button-secondary" disabled={disabled} onClick={onSave}>SAVE CONTEXT</button>{saved && <span role="status">{saved}</span>}</div>
    </div>
  </details>;
}
