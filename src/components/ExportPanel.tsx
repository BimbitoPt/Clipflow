import type { VideoScript } from "../lib/script";

export default function ExportPanel({ script, tiktok, xpost, voiceOn, onVoiceChange, onPreviewVoice, onExport, onCopy, status, progress, message, voiceWarn }: {
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
}) {
  return <section className="cf-export-panel" id="export"><div><span className="cf-kicker">FINAL STEP / 04</span><h2>Ready to make the file?</h2><p>Five scenes, one vertical MP4. Review the frame and voice, then export locally.</p></div><div className="cf-export-controls"><label className="cf-voice-toggle"><input type="checkbox" checked={voiceOn} disabled={status === "working"} onChange={(event) => onVoiceChange(event.target.checked)} /><span><b>Voiceover + captions</b><small>First voice render downloads the local model and caches it.</small></span></label><button type="button" className="cf-button cf-button-secondary" disabled={status === "working"} onClick={onPreviewVoice}>PREVIEW VOICE</button><button type="button" className="cf-button cf-button-primary" disabled={status === "working"} onClick={onExport}>{status === "working" ? "EXPORTING…" : "EXPORT 9:16 MP4 →"}</button></div>{status === "working" && <div className="cf-export-progress" role="status"><div><span style={{ width: `${progress}%` }} /></div><small>{message || "Preparing your clip…"}</small></div>}{status === "exported" && <p className="cf-success" role="status">MP4 downloaded. Your selected scene backgrounds are in the file.</p>}{voiceWarn && <p className="cf-warning" role="status">{voiceWarn}</p>}<div className="cf-post-copy"><h3>Ready-to-post copy</h3>{[{ label: "TikTok", text: tiktok }, { label: "X", text: xpost }, { label: "LinkedIn", text: script.linkedin.body }].map((item) => <details key={item.label}><summary>{item.label}<span>OPEN ↗</span></summary><p>{item.text}</p><button type="button" className="cf-button cf-button-secondary" onClick={() => onCopy(item.text)}>COPY {item.label.toUpperCase()} COPY</button></details>)}</div></section>;
}
