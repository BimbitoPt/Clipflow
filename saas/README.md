# Clipflow SaaS

Next.js 14 + TypeScript + Tailwind + vitest

Commands: `npm install`, `npm test`, `npm run build`, `npm run dev`

Setup for auth/billing/render pipeline lands in later tasks.

## Renderer prerequisite

- Build the native renderer once: `cargo build --release --manifest-path ../native/Cargo.toml` (run from this `saas/` folder, i.e. with `--manifest-path` resolved from the repo root). The worker defaults to `../native/target/release/clipflow.exe` (win32) or `../native/target/release/clipflow` (other platforms).
- Models live at `../public/models` (the worker passes this directory to the CLI's `--models` flag).
- Start the worker with the guard env var: `CLIPFLOW_WORKER=1 npm run worker`.
- Run the slow real-render integration test once: `npm run slow` (up to 15 min timeout; skipped automatically if the binary is not built).
