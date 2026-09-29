"use client";

import { useCallback, useEffect, useState } from "react";
import type { BrandKit } from "@/src/lib/domain";

function blankBrand(): BrandKit {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1, id: `brand-${crypto.randomUUID().slice(0, 8)}`, name: "New brand",
    palette: { background: "#080A0D", foreground: "#F7F8FA", accent: "#CFFF47", accentAlt: "#CFFF47" },
    fonts: { heading: "System UI", body: "System UI" }, logoPath: null, audioPath: null, toneNotes: "",
    defaultCta: "Learn more.", captionStyle: { wordsPerChunk: 3, highlightColor: "#CFFF47", safeAreaPercent: 10 },
    approvedAssets: [], updatedAt: now,
  };
}

export default function BrandLibrary() {
  const [brands, setBrands] = useState<BrandKit[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selected, setSelected] = useState<BrandKit | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (selectId?: string) => {
    const response = await fetch("/api/brands", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not load brand kits");
    const items: BrandKit[] = result.brands;
    setBrands(items);
    const nextId = selectId ?? selectedId;
    const found = items.find((brand) => brand.id === nextId) ?? items[0] ?? null;
    setSelectedId(found?.id ?? "");
    setSelected(found);
  }, [selectedId]);

  useEffect(() => { void refresh().catch((error) => setNotice(error.message)); }, [refresh]);

  async function save(brand: BrandKit) {
    setBusy(true); setNotice("");
    try {
      const exists = brands.some((item) => item.id === brand.id);
      const response = await fetch(exists ? `/api/brands/${brand.id}` : "/api/brands", {
        method: exists ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(brand),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save kit");
      await refresh(result.brand.id);
      setNotice("Brand kit saved to this workspace.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save kit"); }
    finally { setBusy(false); }
  }

  async function addBrand() {
    const brand = blankBrand();
    setSelectedId(brand.id); setSelected(brand);
  }

  async function upload(file: File, kind: string, note: string, source: string) {
    if (!selected) return;
    setBusy(true); setNotice("");
    try {
      const form = new FormData(); form.set("file", file); form.set("kind", kind); form.set("note", note); form.set("source", source);
      const response = await fetch(`/api/brands/${selected.id}/assets`, { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Upload failed");
      await refresh(selected.id); setNotice("Approved asset added to the local kit.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Upload failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="studio-shell">
      <aside className="sidebar">
        <a className="brand-mark" href="/"><span className="brand-glyph">▶</span><span>CLIPFLOW <span style={{ color: "#8d98a6", fontWeight: 500 }}>REMOTION</span></span></a>
        <nav className="nav-list" aria-label="Main navigation"><a className="nav-item" href="/">Studio</a><a className="nav-item active" href="/brands">Brand kits</a></nav>
        <div style={{ marginTop: "auto" }} className="eyebrow">LOCAL PRODUCTION</div>
      </aside>
      <main className="main">
        <div className="topline"><span className="eyebrow">CONTENT OPERATIONS / 02</span><span className="status-pill">● PRIVATE BRAND LIBRARY</span></div>
        <section className="hero">
          <div><div className="eyebrow">IDENTITY SYSTEMS</div><h1>Every brand,<br />its own signal.</h1><p className="subtle">Keep colors, voice, calls to action and approved media together. Each clip takes its look from its assigned kit.</p></div>
          <button className="button" type="button" onClick={addBrand}>＋ &nbsp; ADD A BRAND</button>
        </section>
        {notice && <p role="status" className="notice">{notice}</p>}
        <div className="brand-layout">
          <section className="panel brand-list">
            <div className="section-heading"><h2>Brand library</h2><span className="eyebrow">{brands.length} KITS</span></div>
            {brands.map((brand) => <button key={brand.id} type="button" onClick={() => { setSelectedId(brand.id); setSelected(brand); }} className={`brand-choice ${selectedId === brand.id ? "chosen" : ""}`}>
              <span className="swatches"><i style={{ background: brand.palette.background }} /><i style={{ background: brand.palette.accent }} /><i style={{ background: brand.palette.accentAlt }} /></span>
              <span><b>{brand.name}</b><small>{brand.id}</small></span><span className="arrow">›</span>
            </button>)}
            <p className="brand-note">Sabre starts as a blank kit. Add its approved identity and real marketing claims before making clips for it.</p>
          </section>
          {selected ? <BrandEditor key={selected.id} brand={selected} busy={busy} onSave={save} onUpload={upload} /> : <section className="panel empty"><h3>Loading brand kits</h3></section>}
        </div>
      </main>
    </div>
  );
}

function BrandEditor({ brand, busy, onSave, onUpload }: { brand: BrandKit; busy: boolean; onSave: (kit: BrandKit) => void; onUpload: (file: File, kind: string, note: string, source: string) => void }) {
  const [draft, setDraft] = useState(brand);
  const [assetKind, setAssetKind] = useState("logo");
  const [source, setSource] = useState("");
  const [note, setNote] = useState("");
  const patch = (value: Partial<BrandKit>) => setDraft((current) => ({ ...current, ...value }));
  const patchPalette = (key: keyof BrandKit["palette"], value: string) => patch({ palette: { ...draft.palette, [key]: value } });

  return <section className="panel editor-panel">
    <div className="section-heading"><h2>Kit details</h2><span className="eyebrow mono">{draft.id}</span></div>
    <div className="form-grid">
      <label>Display name<input value={draft.name} onChange={(event) => patch({ name: event.target.value })} /></label>
      <label>Stable ID<input value={draft.id} disabled={brand.id === "clipflow" || brand.id === "mstudio"} onChange={(event) => patch({ id: event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "-") })} /></label>
      <ColorField label="Background" value={draft.palette.background} onChange={(value) => patchPalette("background", value)} />
      <ColorField label="Text" value={draft.palette.foreground} onChange={(value) => patchPalette("foreground", value)} />
      <ColorField label="Accent" value={draft.palette.accent} onChange={(value) => patchPalette("accent", value)} />
      <ColorField label="CTA / highlight" value={draft.palette.accentAlt} onChange={(value) => patchPalette("accentAlt", value)} />
      <label>Heading font<input value={draft.fonts.heading} onChange={(event) => patch({ fonts: { ...draft.fonts, heading: event.target.value } })} /></label>
      <label>Body font<input value={draft.fonts.body} onChange={(event) => patch({ fonts: { ...draft.fonts, body: event.target.value } })} /></label>
      <label className="wide">Voice and creative guidance<textarea rows={4} value={draft.toneNotes} onChange={(event) => patch({ toneNotes: event.target.value })} placeholder="Tone, phrases to use or avoid, visual rules..." /></label>
      <label className="wide">Default call to action<input value={draft.defaultCta} onChange={(event) => patch({ defaultCta: event.target.value })} /></label>
    </div>
    <div className="asset-section">
      <div><h3>Approved local media</h3><p>PNG, JPEG, WebP, GIF, MP3, WAV and WOFF2. Max 10 MB per asset.</p></div>
      <div className="upload-row">
        <select aria-label="Asset type" value={assetKind} onChange={(event) => setAssetKind(event.target.value)}><option value="logo">Brand logo</option><option value="audio">Brand audio</option><option value="approved">Approved media</option></select>
        <input aria-label="Asset source or license" value={source} onChange={(event) => setSource(event.target.value)} placeholder="Source / rights note" />
        <input aria-label="Asset description" value={note} onChange={(event) => setNote(event.target.value)} placeholder="What is this asset?" />
        <label className="file-button">CHOOSE FILE<input type="file" accept="image/png,image/jpeg,image/webp,image/gif,audio/mpeg,audio/wav,font/woff2" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file, assetKind, note, source); event.currentTarget.value = ""; }} /></label>
      </div>
      <div className="asset-items">
        {draft.logoPath && <AssetItem kind="LOGO" assetPath={draft.logoPath} />}
        {draft.audioPath && <AssetItem kind="AUDIO" assetPath={draft.audioPath} />}
        {draft.approvedAssets.map((asset) => <AssetItem key={asset.path} kind="APPROVED" assetPath={asset.path} note={asset.note} />)}
        {!draft.logoPath && !draft.audioPath && draft.approvedAssets.length === 0 && <span className="muted-note">No local assets attached yet.</span>}
      </div>
    </div>
    <div className="editor-actions"><span className="muted-note">Edits are saved locally on this machine.</span><button className="button" disabled={busy} onClick={() => onSave({ ...draft, updatedAt: new Date().toISOString() })}>{busy ? "SAVING…" : "SAVE BRAND KIT"}</button></div>
  </section>;
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label>{label}<div className="color-control"><input type="color" value={/^#[\da-f]{6}$/i.test(value) ? value : "#000000"} onChange={(event) => onChange(event.target.value.toUpperCase())} /><input value={value} onChange={(event) => onChange(event.target.value)} /></div></label>;
}

function AssetItem({ kind, assetPath, note }: { kind: string; assetPath: string; note?: string }) {
  return <div className="asset-item"><span className="asset-kind">{kind}</span><span className="mono">{assetPath}</span>{note && <span>{note}</span>}</div>;
}
