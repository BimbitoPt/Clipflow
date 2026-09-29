import { useEffect, useState } from "react";
import { AI_BACKGROUNDS, type AiBackground } from "../lib/ai-backgrounds";
import { STOCK_POOL, type StockAsset } from "../lib/broll";
import type { SceneChoice } from "../lib/scene-assets";

type LibraryTab = "ai" | "stock" | "upload";

export default function SceneTray({ selected, choice, suggestion, asset, loading, onChoice, onUpload, disabled }: {
  selected: number;
  choice: SceneChoice;
  suggestion: AiBackground;
  asset: StockAsset | null;
  loading: boolean;
  onChoice: (choice: SceneChoice) => void;
  onUpload: (file: File) => void;
  disabled: boolean;
}) {
  const [tab, setTab] = useState<LibraryTab>("ai");
  useEffect(() => { setTab(choice.kind === "stock" ? "stock" : choice.kind === "upload" ? "upload" : "ai"); }, [selected, choice.kind]);
  const selectedImage = choice.kind === "auto-ai" ? suggestion : choice.kind === "ai" ? AI_BACKGROUNDS.find((image) => image.id === choice.id) : null;
  const title = selectedImage?.label ?? (choice.kind === "stock" ? "Local stock" : choice.kind === "upload" ? "Your uploaded image" : "Gradient fallback");
  return <section className="cf-scene-tray" aria-label="Scene backgrounds">
    <div className="cf-panel-heading"><span className="cf-kicker">VISUAL DIRECTION / {String(selected + 1).padStart(2, "0")}</span><h2>Scene look</h2><p>Pick one background for this beat. Text stays in Clipflow.</p></div>
    <div className="cf-current-look">{selectedImage ? <img src={selectedImage.src} alt="" /> : asset?.kind === "image" && asset.src.startsWith("/") ? <img src={asset.src} alt="" /> : <span>{choice.kind === "upload" ? "YOUR IMAGE" : "LOCAL VISUAL"}</span>}<div><small>CURRENT LOOK</small><b>{title}</b><span>{loading ? "Loading visual…" : asset ? "Ready in preview and export" : "Gradient fallback will be used"}</span></div></div>
    <div className="cf-library-tabs" role="tablist" aria-label="Background sources">{(["ai", "stock", "upload"] as LibraryTab[]).map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item === "ai" ? "AI LIBRARY" : item === "stock" ? "STOCK" : "UPLOAD"}</button>)}</div>
    {tab === "ai" && <div className="cf-library-content" role="tabpanel"><button type="button" className={`cf-auto-choice ${choice.kind === "auto-ai" ? "active" : ""}`} disabled={disabled} onClick={() => onChoice({ kind: "auto-ai" })}><span>✦</span><span><b>Match this beat</b><small>Clipflow chooses from the offline AI collection.</small></span></button><div className="cf-image-grid">{AI_BACKGROUNDS.map((image) => <button key={image.id} type="button" disabled={disabled} className={choice.kind === "ai" && choice.id === image.id ? "selected" : ""} onClick={() => onChoice({ kind: "ai", id: image.id })} aria-label={`Use ${image.label}`}><img src={image.src} alt="" loading="lazy" /><span>{image.label}</span></button>)}</div></div>}
    {tab === "stock" && <div className="cf-library-content" role="tabpanel"><p className="cf-library-note">Use real footage when the scene needs proof or a specific subject.</p><div className="cf-image-grid">{STOCK_POOL.filter((entry) => entry.kind === "image").slice(0, 9).map((entry) => <button key={entry.src} type="button" disabled={disabled} className={choice.kind === "stock" && choice.src === entry.src ? "selected" : ""} onClick={() => onChoice({ kind: "stock", src: entry.src })} aria-label={`Use stock ${entry.keywords.slice(0, 2).join(" ")}`}><img src={entry.src} alt="" loading="lazy" /><span>{entry.keywords.slice(0, 2).join(" · ")}</span></button>)}</div><label className="cf-stock-select">All local stock<select disabled={disabled} value={choice.kind === "stock" ? choice.src : ""} onChange={(event) => event.target.value && onChoice({ kind: "stock", src: event.target.value })}><option value="">Choose another image or video</option>{STOCK_POOL.map((entry) => <option key={entry.src} value={entry.src}>{entry.kind === "video" ? "VIDEO" : "IMAGE"} · {entry.keywords.slice(0, 3).join(" / ")}</option>)}</select></label></div>}
    {tab === "upload" && <div className="cf-library-content" role="tabpanel"><p className="cf-library-note">Add a scene-specific image from this device. It stays in this session.</p><label className="cf-upload">CHOOSE IMAGE<input type="file" accept="image/*" disabled={disabled} onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.target.value = ""; }} /></label>{choice.kind === "upload" && <p className="cf-library-note">This scene uses your uploaded image.</p>}</div>}
  </section>;
}
