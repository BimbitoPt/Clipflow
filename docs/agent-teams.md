# Standing agent teams — full development journey

Five standing teams covering every build surface. Any future prompt can
invoke one with: **"Run the <TEAM> team on <GOAL>: orchestrator plans,
2–4 parallel subagents explore/build/review, gates green, PR, merge."**

The main terminal session is always the orchestrator. It never does heavy
exploration inline — it dispatches the team's roles as parallel subagents
and assembles their output.

## Dispatch recipe (copy-paste per team)

```
Run the <TEAM> team on <GOAL>.
- Planner/scout subagents explore in parallel, ≤400 tokens back each.
- Builder implements on branch <type>/<slug>.
- Verifier runs the team gate, records numbers.
- 1–2 reviewer subagents approve in parallel.
- Orchestrator opens the PR with metrics, merges to master.
```

## APP DEV — Tauri desktop + React PWA video studio

**Mission:** Ship Clipflow features fast without regressions. Sustain PWA
parity, native performance, zero-broken-master discipline.

**Roles:** Planner (file-scoped plan + cost est.) · Builder (one tight
diff per branch, rationale in comments) · Verifier (full gates + numbers,
never weakens them) · Reviewer (correctness, scope, PWA/desktop parity).

**Journey:** Plan (exit: written plan) → Build (exit: tight diff) →
Verify (exit: gates green + numbers) → Review (exit: agent approvals) →
Ship (exit: merged, metrics in PR body).

**Gate:** `npm test` + `npx tsc --noEmit` + `cargo test` (when Rust touched).

**Red lines:** never weaken gates; never merge to master directly; never
explore inline — delegate to capped subagents.

## GAME DEV — reusable gameplay loops (generic)

**Mission:** Mechanic spec → playable slice → tuned at 60fps. Engine
agnostic; reusable across 2D/3D web + native.

**Roles:** Loop Designer (one-page loop spec: verb, fail/win, feel) ·
World Builder (vertical slice: input, systems, budgeted assets) ·
Perf + Playtest Runner (frame/memory budgets, bots/seeds/replays).

**Journey:** Plan (exit: loop spec + budgets, e.g. 16.6 ms frame) →
Build (exit: playable slice) → Verify (exit: budgets met, playtest
green) → Review (exit: fun-check + approvals) → Ship (exit: tagged
build + playtest report).

**Gate:** `npm test` + `npx tsc --noEmit` + automated playtest green.

**Red lines:** no slice without spec + budgets + playtest proof; no
hardcoded tuning (config/data only); no flaky-skipped greens.

**Clipflow transfers:** canvas render pipeline, timeline perf discipline,
Tauri native export for desktop builds.

## BLUE TEAM — defense / hardening

**Mission:** Harden Tauri IPC, file scope, and web persistence against
untrusted media and projects. Least privilege without breaking workflows.

**Roles:** ipc-guard (11 commands in `src-tauri/src/projects.rs` +
`render.rs`: arg validation, path traversal, TOCTOU) · scope-sentry
(`asset_protocol_scope`, `import_media`/`save_project`/`show_in_folder`,
CSP `connect-src`) · store-warden (upload decode, OPFS, object-URL
lifecycle/revoke).

**Journey:** Map (exit: IPC×scope matrix) → Harden (exit: patches +
allowlists) → Prove (exit: abuse-case tests pass).

**Gate:** `npm test` + `npx tsc --noEmit` + `cargo test` green, no test
weakened, IPC fuzz log attached to the PR.

## RED TEAM — adversarial testing

**Mission:** Break in before attackers do. Every PoC becomes severity +
fix sketch for Blue Team.

**Roles:** ipc-breaker (forged `invoke()` payloads, traversal, oversized
media, command chaining) · media-mutator (polyglots, EXIF bombs,
decode abuse via `createImageBitmap`) · web-raider (XSS/CSRF/OPFS
poisoning in `saas/` + `landing/`, CSP bypass attempts).

**Journey:** Recon (exit: ranked target list) → Exploit (exit: sandboxed
PoC per finding) → Report (exit: severity + repro + fix sketch filed).

**Rules of engagement:** sandboxed local PoCs only; never weaken gates
or tests; never exfiltrate real data; stop and report immediately on
anything smelling like RCE; never touch prod.

**Gate:** all PoCs locally reproducible; every finding has severity +
one-paragraph fix.

## WEB DEV — landing / SaaS / PWA web

**Mission:** Fast landing + `saas/` apps with PWA installability and
conversion focus. Shared UI stays consistent; no IPC/file-scope
regressions.

**Roles:** landing-smith (hero, pricing, SEO/meta, OG assets) ·
saas-builder (editor, uploads, OPFS drafts) · pwa-polisher (manifest,
service worker, offline cache, Lighthouse/a11y pass).

**Journey:** Slice (exit: route/component contract) → Build (exit:
feature behind flag, types clean) → Polish (exit: Lighthouse ≥ 90,
mobile OK).

**Gate:** `npm test` + `npx tsc --noEmit` green, `vite build` succeeds,
offline-install smoke passes.
