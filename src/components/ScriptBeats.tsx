import type { VideoScript } from "../lib/script";
import type { ScriptOverrides } from "../lib/script-draft";

const labels = ["Hook", "Beat 1", "Beat 2", "Beat 3", "Call to action"];

export default function ScriptBeats({ generated, overrides, selected, onSelect, onEdit, onReset, disabled, captionLabels, onCaptionEdit }: {
  generated: VideoScript;
  overrides: ScriptOverrides;
  selected: number;
  onSelect: (index: number) => void;
  onEdit: (index: number, value: string) => void;
  onReset: (index: number) => void;
  disabled: boolean;
  captionLabels?: string[];
  onCaptionEdit?: (index: number, value: string) => void;
}) {
  return <div className="cf-script-beats" aria-label="Five video beats">
    {generated.cues.map((cue, index) => <div className={`cf-beat ${selected === index ? "selected" : ""}`} key={index}>
      <div className="cf-beat-top"><button type="button" disabled={disabled} onClick={() => onSelect(index)} aria-pressed={selected === index}><span>{String(index + 1).padStart(2, "0")}</span>{labels[index]}</button>{overrides[index] !== undefined && <button type="button" className="cf-reset" disabled={disabled} onClick={() => onReset(index)}>RESTORE GENERATED</button>}</div>
      <textarea aria-label={`${labels[index]} script`} disabled={disabled} rows={index === 0 || index === 4 ? 2 : 3} maxLength={320} value={overrides[index] ?? cue.text} onFocus={() => onSelect(index)} onChange={(event) => onEdit(index, event.target.value)} />
      {captionLabels && <label className="cf-caption-label">On-screen label<input aria-label={`${labels[index]} on-screen label`} disabled={disabled} maxLength={80} placeholder="A short, accurate scene label" value={captionLabels[index] ?? ""} onFocus={() => onSelect(index)} onChange={event => onCaptionEdit?.(index,event.target.value)} /><small>Describe what is visible. This label does not change narration.</small></label>}
    </div>)}
  </div>;
}
