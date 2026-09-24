export default function HomePage() {
  return (
    <div className="studio-shell">
      <aside className="sidebar">
        <div className="brand-mark"><span className="brand-glyph">▶</span><span>CLIPFLOW <span style={{ color: "#8d98a6", fontWeight: 500 }}>REMOTION</span></span></div>
        <nav className="nav-list" aria-label="Main navigation">
          <a className="nav-item active" href="/">Studio</a>
          <a className="nav-item" href="/brands">Brand kits</a>
        </nav>
        <div style={{ marginTop: "auto" }} className="eyebrow">LOCAL PRODUCTION</div>
      </aside>
      <main className="main">
        <div className="topline"><span className="eyebrow">CONTENT OPERATIONS / 01</span><span className="status-pill">● LOCAL WORKSPACE</span></div>
        <section className="hero">
          <div><div className="eyebrow">DAILY VIDEO FACTORY</div><h1>Make the next<br />good post move.</h1><p className="subtle">Plan a mixed-brand batch, shape each story, then preview and approve every clip before it renders.</p></div>
          <button className="button" type="button" disabled title="Batch creation is the next implementation step">＋ &nbsp; CREATE A BATCH</button>
        </section>
        <section className="stats" aria-label="Studio overview">
          <div className="panel stat"><span className="stat-number">—</span><span className="stat-label">CLIPS IN PRODUCTION</span></div>
          <div className="panel stat"><span className="stat-number">—</span><span className="stat-label">READY TO REVIEW</span></div>
          <div className="panel stat"><span className="stat-number">—</span><span className="stat-label">BRAND KITS</span></div>
        </section>
        <section>
          <div className="section-heading"><h2>Recent batches</h2><span className="eyebrow">YOUR LIBRARY</span></div>
          <div className="panel empty"><div className="empty-mark">✳</div><h3>Your next batch starts here</h3><p>Bring 10–20 hooks and ideas together across Clipflow, MStudio Web, Sabre and any brands you add.</p><span className="eyebrow">DRAFT → REVIEW → RENDER → EXPORT</span></div>
        </section>
      </main>
    </div>
  );
}
