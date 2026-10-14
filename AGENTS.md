# Clipflow — agent operating instructions

## Orchestration (every task, no exceptions)

Work as an orchestrated agent team with parallelism:

- The main terminal session is the orchestrator. It plans, implements,
  verifies, and merges. It never does heavy exploration inline.
- Delegate heavy reading (many files, logs, cross-cutting searches) to
  parallel `subagent` workers (`explore` for codebase questions, `general`
  for review/verification). Cap parallel fans to 2–4 agents with a stop rule.
- Estimate cost before fanning out; prefer a few hundred tokens back per
  agent over loading everything into the main context.

## Verification (required before done)

- `npm test` (vitest), `npx tsc --noEmit`, and `cargo test` when Rust
  changed. Never weaken, skip, or delete tests/gates to make them pass.
- Record measured numbers (bench output, test counts) in PR bodies.

## Workflow

- Branch per fix (`fix/...`, `perf/...`, `chore/...`), commit, push,
  open a PR with `gh`, get parallel review agents, then merge to master.
- Keep diffs tight; put design rationale in code comments, not chat.

## Standing teams

Full journey playbooks live in `docs/agent-teams.md`: APP DEV, GAME DEV,
BLUE TEAM, RED TEAM, WEB DEV. Invoke with: "Run the <TEAM> team on
<GOAL>: orchestrator plans, 2–4 parallel subagents explore/build/review,
gates green, PR, merge."
