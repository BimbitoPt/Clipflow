export default function DesktopToolbar({ path, dirty, busy, onNew, onOpen, onSave, onImport, error }: {
  path: string | null; dirty: boolean; busy: boolean; error: string;
  onNew: () => void; onOpen: () => void; onSave: () => void; onImport: () => void;
}) {
  return <section className="cf-desktop-toolbar" aria-label="Desktop project">
    <div><span className="cf-kicker">DESKTOP STUDIO</span><strong>{path?.split(/[\\/]/).pop() ?? 'Untitled project'}{dirty ? ' •' : ''}</strong><small>{path ?? 'Save a project to keep your media and edits together.'}</small></div>
    <div className="cf-desktop-actions"><button disabled={busy} onClick={onNew}>New</button><button disabled={busy} onClick={onOpen}>Open project</button><button disabled={busy} onClick={onSave}>Save project</button><button disabled={busy} onClick={onImport}>Import media</button></div>
    {error && <p role="alert" className="cf-error">{error}</p>}
  </section>;
}
