import type { VideoScript } from "../lib/script";
import type { CaptionMode } from "../../shared/caption-plan";
import { VISUAL_EFFECTS, visualEffectLabels, type VisualEffect } from "../../shared/visual-effects";
import { PLATFORM_PRESETS, platformPreset, type PlatformId } from "../../shared/platform-presets";

export default function ExportPanel({ script, tiktok, xpost, voiceOn, onVoiceChange, onPreviewVoice, onExport, onCopy, status, progress, message, voiceWarn, downloadUrl, captionMode, onCaptionModeChange, visualEffect, onVisualEffectChange, platform, onPlatformChange, creditOn, onCreditChange, nativeOutput, nativePreview, onReveal, onCancel }: {
  nativeOutput?: string | null;
  nativePreview?: string | null;
  onReveal?: () => void;
  onCancel?: () => void;
  script: VideoScript;
  tiktok: string;
  xpost: string;
  voiceOn: boolean;
  onVoiceChange: (value: boolean) => void;
  onPreviewVoice: () => void;
  onExport: () => void;
  onCopy: (text: string) => void;
  status: "idle" | "working" | "exported" | "error";
  progress: number;
  message: string;
  voiceWarn: string;
  downloadUrl?: string | null;
  captionMode?: CaptionMode;
  onCaptionModeChange?: (mode: CaptionMode) => void;
  visualEffect: VisualEffect;
  onVisualEffectChange: (effect: VisualEffect) => void;
  platform: PlatformId;
  onPlatformChange: (platform: PlatformId) => void;
  creditOn: boolean;
  onCreditChange: (value: boolean) => void;
}) {
  const preset = platformPreset(platform);
  return <section className="cf-export-panel" id="export"><div><span className="cf-kicker">FINAL STEP / 04</span><h2>Ready to make the file?</h2><p>Five scenes, one vertical MP4. Review the frame and voice, then export locally.</p></div><div className="cf-export-controls"><label className="cf-voice-toggle"><input type="checkbox" checked={voiceOn} disabled={status === "working"} onChange={(event) => onVoiceChange(event.target.checked)} /><span><b>Voiceover</b><small>First voice render downloads the local model and caches it.</small></span></label><label className="cf-caption-control">Caption style<select aria-label="Caption style" disabled={status === "working"} value={captionMode ?? "auto"} onChange={event => onCaptionModeChange?.(event.target.value as CaptionMode)}><option value="auto">Auto for this video</option><option value="scene">Short scene labels</option><option value="speech">Speech in phrases</option><option value="off">No captions</option></select></label><label className="cf-caption-control">Visual effect<select aria-label="Visual effect" disabled={status === "working"} value={visualEffect} onChange={event => onVisualEffectChange(event.target.value as VisualEffect)}>{VISUAL_EFFECTS.map(effect => <option key={effect} value={effect}>{visualEffectLabels[effect]}</option>)}</select></label><label className="cf-voice-toggle"><input type="checkbox" checked={creditOn} disabled={status === "working"} onChange={(event) => onCreditChange(event.target.checked)} /><span><b>Clipflow credit</b><small>Adds a 2s end card — your exports carry the mark.</small></span></label><label className="cf-caption-control">Target platform<select aria-label="Target platform" disabled={status === "working"} value={platform} onChange={event => onPlatformChange(event.target.value as PlatformId)}>{PLATFORM_PRESETS.map(entry => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select><small>{preset.spec} — {preset.tip}</small></label><button type="button" className="cf-button cf-button-secondary" disabled={status === "working"} onClick={onPreviewVoice}>PREVIEW VOICE</button><button type="button" className="cf-button cf-button-primary" disabled={status === "working"} onClick={onExport}>{status === "working" ? "EXPORTING…" : "EXPORT 9:16 MP4 →"}</button></div>{status === "working" && onCancel && <button className="cf-button cf-button-secondary" onClick={onCancel}>CANCEL EXPORT</button>}{status === "working" && <div className="cf-export-progress" role="status"><div><span style={{ width: `${progress}%` }} /></div><small>{message || "Preparing your clip…"}</small></div>}{status === "exported" && <p className="cf-success" role="status">MP4 ready. Your selected scene backgrounds are in the file.{downloadUrl && <><br /><a className="cf-button cf-button-primary" href={downloadUrl} download="clipflow-916.mp4">Download rendered MP4</a><br /><video aria-label="Rendered MP4 preview" src={downloadUrl} controls playsInline style={{ width: 180, maxWidth: "100%", marginTop: 16, borderRadius: 12 }} /></>}</p>}{status === "exported" && nativeOutput && <div className="cf-native-output"><p className="cf-success">Saved to {nativeOutput}</p><button className="cf-button cf-button-secondary" onClick={onReveal}>SHOW IN EXPLORER</button>{nativePreview && <video aria-label="Native MP4 preview" src={nativePreview} controls playsInline style={{width: 240, maxWidth: "100%", marginTop: 16, borderRadius: 12}} />}</div>}{voiceWarn && <p className="cf-warning" role="status">{voiceWarn}</p>}<div className="cf-post-copy"><h3>Ready-to-post copy</h3>{[{ label: "TikTok", text: tiktok }, { label: "X", text: xpost }, { label: "LinkedIn", text: script.linkedin.body }].map((item) => <details key={item.label}><summary>{item.label}<span>OPEN ↗</span></summary><p>{item.text}</p><button type="button" className="cf-button cf-button-secondary" onClick={() => onCopy(item.text)}>COPY {item.label.toUpperCase()} COPY</button></details>)}</div></section>;
}
