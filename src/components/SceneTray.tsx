import { useEffect, useState } from "react";
import { AI_BACKGROUNDS, type AiBackground } from "../lib/ai-backgrounds";
import { STOCK_POOL, type StockAsset } from "../lib/broll";
import { desktop } from "../lib/desktop";
import { isSecretKey, type KeyframeStatus } from "../lib/keyframes";
import type { SceneChoice } from "../lib/scene-assets";

type LibraryTab = "ai" | "gen" | "stock" | "upload";

const KEYFRAME_LABELS = ["Hook", "Beat 01", "Beat 02", "Beat 03", "CTA"];

export default function SceneTray({ selected, choice, suggestion, asset, loading, thumb, keyframeStatus, pollinationsKey, onPollinationsKeyChange, onChoice, onUpload, onGenerate, disabled }: {
  selected: number;
  choice: SceneChoice;
  suggestion: AiBackground;
  asset: StockAsset | null;
  loading: boolean;
  thumb?: string;
  keyframeStatus: KeyframeStatus[];
  pollinationsKey: string;
  onPollinationsKeyChange: (value: string) => void;
  onChoice: (choice: SceneChoice) => void;
  onUpload: (file: File) => void;
  onGenerate: (index: number, force: boolean) => void;
  disabled: boolean;
}) {
  const [tab, setTab] = useState<LibraryTab>("ai");
  useEffect(() => { setTab(choice.kind === "stock" ? "stock" : choice.kind === "generated" ? "gen" : (choice.kind === "upload" || choice.kind === "native") ? "upload" : "ai"); }, [selected, choice.kind]);
  const selectedImage = choice.kind === "auto-ai" ? suggestion : choice.kind === "ai" ? AI_BACKGROUNDS.find((image) => image.id === choice.id) : null;
  const title = selectedImage?.label ?? (choice.kind === "native" ? choice.name : choice.kind === "stock" ? "Local stock" : choice.kind === "generated" ? "Generated keyframe" : choice.kind === "upload" ? "Your uploaded image" : "Gradient fallback");
  const sceneStatus = keyframeStatus[selected] ?? "idle";
  const sceneIsCurrent = choice.kind === "generated";
  return <section className="cf-scene-tray" aria-label="Scene backgrounds">
    <div className="cf-panel-heading"><div className="cf-step-num">03</div><h2>Scene look</h2><p>Pick one background for this beat. Text stays in Clipflow.</p></div>
    <div className="cf-current-look">{selectedImage ? <img src={selectedImage.src} alt="" /> : choice.kind === "generated" && thumb ? <img src={thumb} alt="" /> : asset?.kind === "image" && asset.src.startsWith("/") ? <img src={asset.src} alt="" /> : <span>{choice.kind === "upload" ? "YOUR IMAGE" : choice.kind === "generated" ? "GENERATING…" : "LOCAL VISUAL"}</span>}<div><small>CURRENT LOOK</small><b>{title}</b><span>{loading ? "Loading visual…" : asset ? "Ready in preview and export" : choice.kind === "generated" && sceneStatus === "error" ? "Kept offline pool — retry below" : "Gradient fallback will be used"}</span></div></div>
    <div className="cf-library-tabs" role="group" aria-label="Background sources">{(["ai", "gen", "stock", "upload"] as LibraryTab[]).map((item) => <button key={item} type="button" aria-pressed={tab === item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item === "ai" ? "AI LIBRARY" : item === "gen" ? "KEYFRAMES" : item === "stock" ? "STOCK" : "UPLOAD"}</button>)}</div>
    {tab === "ai" && <div className="cf-library-content"><button type="button" className={`cf-auto-choice ${choice.kind === "auto-ai" ? "active" : ""}`} disabled={disabled} onClick={() => onChoice({ kind: "auto-ai" })}><span>✦</span><span><b>Match this beat</b><small>Clipflow chooses from the offline AI collection.</small></span></button><div className="cf-image-grid">{AI_BACKGROUNDS.map((image) => <button key={image.id} type="button" disabled={disabled} className={choice.kind === "ai" && choice.id === image.id ? "selected" : ""} onClick={() => onChoice({ kind: "ai", id: image.id })} aria-label={`Use ${image.label}`}><img src={image.src} alt="" loading="lazy" /><span>{image.label}</span></button>)}</div></div>}
    {tab === "gen" && <div className="cf-library-content"><p className="cf-library-note">{pollinationsKey ? "Key saved — new keyframes generate without watermark (flux, private). Same script always produces the same image; results are cached on this device." : "Clipflow writes a prompt from this beat's line in your script and fetches a fresh keyframe — free, no key needed, but anonymous images carry a small watermark. Add a free Pollinations key below for clean images."}</p><div className="cf-keyframe-status" role="status">{keyframeStatus.map((status, index) => <span key={index} className={status === "ready" ? "on" : ""} title={`${KEYFRAME_LABELS[index]}: ${status}`}>{status === "generating" ? "◐" : status === "ready" ? "●" : status === "error" ? "!" : "○"} {KEYFRAME_LABELS[index]}</span>)}</div><div className="cf-keyframe-actions"><button type="button" className="cf-button cf-button-primary" disabled={disabled || sceneStatus === "generating"} onClick={() => onGenerate(selected, sceneStatus === "ready")}>{sceneStatus === "generating" ? "GENERATING…" : sceneStatus === "ready" && sceneIsCurrent ? "REGENERATE KEYFRAME" : sceneStatus === "error" ? "RETRY KEYFRAME" : "GENERATE KEYFRAME"}</button>{sceneIsCurrent && <button type="button" className="cf-button cf-button-secondary" disabled={disabled} onClick={() => onChoice({ kind: "auto-ai" })}>BACK TO AI LIBRARY</button>}</div><label className="cf-stock-select">Pollinations key (free, removes watermark)<input type="password" autoComplete="off" spellCheck={false} placeholder="pk_… publishable, or your own scoped sk_… for local use" disabled={disabled} value={pollinationsKey} onChange={(event) => onPollinationsKeyChange(event.target.value)} style={{ fontSize: 12 }} /></label>{isSecretKey(pollinationsKey) && <p className="cf-library-note">Secret key active — solo-local use only. Anyone with this build can spend its capped budget. Never distribute builds containing it; multi-user needs BYOP OAuth instead.</p>}<p className="cf-library-note">Free at <b>enter.pollinations.ai → Keys → publishable key</b>. Paste it here — stored only in this browser. Adding a key affects new generations; hit REGENERATE on watermarked scenes for clean versions. Generated keyframes are AI artwork — never use them as proof. Keep real uploads for results.</p></div>}
    {tab === "stock" && <div className="cf-library-content"><p className="cf-library-note">Use real footage when the scene needs proof or a specific subject.</p><div className="cf-image-grid">{STOCK_POOL.filter((entry) => entry.kind === "image").slice(0, 9).map((entry) => <button key={entry.src} type="button" disabled={disabled} className={choice.kind === "stock" && choice.src === entry.src ? "selected" : ""} onClick={() => onChoice({ kind: "stock", src: entry.src })} aria-label={`Use stock ${entry.keywords.slice(0, 2).join(" ")}`}><img src={entry.src} alt="" loading="lazy" /><span>{entry.keywords.slice(0, 2).join(" · ")}</span></button>)}</div><label className="cf-stock-select">All local stock<select disabled={disabled} value={choice.kind === "stock" ? choice.src : ""} onChange={(event) => event.target.value && onChoice({ kind: "stock", src: event.target.value })}><option value="">Choose another image or video</option>{STOCK_POOL.map((entry) => <option key={entry.src} value={entry.src}>{entry.kind === "video" ? "VIDEO" : "IMAGE"} · {entry.keywords.slice(0, 3).join(" / ")}</option>)}</select></label></div>}
    {tab === "upload" && desktop && <div className="cf-library-content"><p className="cf-library-note">Use Import media above to add an image or video to this scene. Saving a project copies its media into the project assets folder.</p>{choice.kind === "native" && <b>{choice.name}</b>}</div>}
    {tab === "upload" && !desktop && <div className="cf-library-content"><p className="cf-library-note">Add a scene-specific image from this device. It stays in this session.</p><label className="cf-upload">CHOOSE IMAGE<input type="file" accept="image/*" disabled={disabled} onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.target.value = ""; }} /></label>{choice.kind === "upload" && <><p className="cf-library-note">This scene uses your uploaded image.</p><label className="cf-proof-approval"><input type="checkbox" disabled={disabled} checked={choice.approvedProof === true} onChange={(event) => onChoice({ ...choice, approvedProof: event.target.checked })} /><span><b>Approved proof</b><small>Use this real image as evidence in the video.</small></span></label></>}</div>}
  </section>;
}
