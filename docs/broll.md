# Clipflow (DIY) / Clipflow Managed — one engine, two doors

> Clipflow is one engine with two doors: **Clipflow (DIY)** — free, local-first PWA you run yourself — and **Clipflow Managed** (see `docs/managed.md`) — done-for-you by MSTUDIO. This file covers the DIY side only.

Context: DIY local starter assets — tracked in git, app never throws on missing clips.

Starter thumbnails shipped in `public/broll/` (`1.jpg`–`9.jpg`).

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

Unsplash License, free to use.

Note: thumbnails ship in `public/broll` and must stay tracked in git — ensure `git add` includes them.

## Vertical clips (`public/broll/clips/*.mp4`)

Auto stock also maps 6 vertical clip slots (`clip-1.mp4`–`clip-6.mp4`).
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
