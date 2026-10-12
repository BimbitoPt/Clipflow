# Clipflow (DIY) / Clipflow Managed — one engine, two doors

> Clipflow is one engine with two doors: **Clipflow (DIY)** — free, local-first PWA you run yourself — and **Clipflow Managed** (see `docs/managed.md`) — done-for-you by MSTUDIO. This file covers the DIY side only.

Context: DIY local starter assets — tracked in git, app never throws on missing clips.

Starter thumbnails shipped in `public/broll/` (`1.jpg`–`25.jpg`).

Sources (in thumbnail order):

1. https://unsplash.com/photos/teRVpNnlR_c
2. https://unsplash.com/photos/BA2ELfOTqJ4
3. https://unsplash.com/photos/XrIcPJv4dOk
4. https://unsplash.com/photos/euLoiM1zO1s
5. https://unsplash.com/photos/oYzjGQ7LCVE
6. https://unsplash.com/photos/rSZEhnhoK00
7. https://unsplash.com/photos/C1n6WSkAsgg
8. https://unsplash.com/photos/theClRb3XB4
9. https://unsplash.com/photos/5Gm8oxVP18A
10. https://picsum.photos/id/1/720/1280
11. https://picsum.photos/id/3/720/1280
12. https://picsum.photos/id/8/720/1280
13. https://picsum.photos/id/26/720/1280
14. https://picsum.photos/id/48/720/1280
15. https://picsum.photos/id/60/720/1280
16. https://picsum.photos/id/96/720/1280
17. https://picsum.photos/id/106/720/1280
18. https://picsum.photos/id/180/720/1280
19. https://picsum.photos/id/201/720/1280
20. https://picsum.photos/id/213/720/1280
21. https://picsum.photos/id/219/720/1280
22. https://picsum.photos/id/239/720/1280
23. https://picsum.photos/id/242/720/1280
24. https://picsum.photos/id/250/720/1280
25. https://picsum.photos/id/257/720/1280
26. Synthesized locally (code-editor mock, no license needed)

Unsplash License (1-9) + Picsum/Unsplash free to use (10-25) + local synth (26).

Note: thumbnails ship in `public/broll` and must stay tracked in git — ensure `git add` includes them.

## Vertical clips (`public/broll/clips/*.mp4`)

Auto stock also maps 6 vertical clip slots (`clip-1.mp4`–`clip-6.mp4`)
plus 2 MSTUDIO site case-study takes (`web-mstudioweb-hero.mp4`,
`web-mstudioweb-scroll.mp4` — real site footage shot with
`scripts/shoot-websites.mjs`, keyworded to outscore generic stock on
site-related queries so case-study videos open on the site).
Current clips are local Ken Burns motion renders from photos 13/17/22/18/23/10
(interim video stock, 720x1280 5s each) — no external license needed.
Source map (one photo source per video — matcher enforces distinct sources):
clip-1→13, clip-2→17, clip-3→22, clip-4→18, clip-5→23, clip-6→10.
Replace with Pexels/Coverr/Pixabay verticals when verified IDs land.
Fetch with `scripts/fetch-broll.sh`. Missing clips fall back to jpg/gradient —
the app never throws on 404.

Clip sources (free license, vertical 9:16 where available):

1. `clip-1.mp4` (typing / laptop / build) — https://coverr.co/videos/typing-on-laptop-close-up
2. `clip-2.mp4` (team / office / ship) — https://www.pexels.com/video/team-meeting-in-office-3209828/
3. `clip-3.mp4` (phone / creator / scroll) — https://pixabay.com/videos/social-media-phone-scrolling/
4. `clip-4.mp4` (city night / hustle) — https://coverr.co/videos/city-night-aerial
5. `clip-5.mp4` (design studio / mockup) — https://www.pexels.com/video/design-studio-workspace-2795750/
6. `clip-6.mp4` (celebrate / win / proof) — https://pixabay.com/videos/celebration-success-confetti-17271/

Verify each URL serves a vertical Rendition before committing binaries.
Document replacements here when IDs change; filenames must stay stable
because `src/lib/broll.ts` STOCK_POOL maps keywords to these paths.

## Fetched stock (`npm run stock:fetch`)

Real Pexels/Pixabay renditions extend the pool without touching the curated
list: the fetcher searches 8 niche queries per provider (both APIs are free
for commercial use — Pexels License / Pixabay Content License), downloads
480–1080px renditions (4–40s, portrait preferred) into
`public/broll/fetched/` and regenerates `src/lib/broll-fetched.ts`, which
`STOCK_POOL` appends at module load. Pool matching, the "All local stock"
picker and exports pick fetched clips up automatically.

- Keys: `PEXELS_API_KEY` / `PIXABAY_API_KEY` env vars, or
  `stock-keys.local.json` (gitignored via `*.local`). No keys → the script
  exits 0 with instructions and the pool stays exactly as shipped.
- `-- --force` refetches; otherwise the manifest is reused for 7 days
  (respects both providers' caching rules), and `MAX_FETCHED_CLIPS` (24)
  caps pool growth.
- Fetched MP4s are gitignored by default — `git add -f public/broll/fetched`
  together with the regenerated module to ship a fetched pool. Missing files
  fall back to jpg/gradient like every other asset; never throws.
