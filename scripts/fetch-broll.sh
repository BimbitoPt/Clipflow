# Clipflow stock fetch
# Vertical 720x1280 MP4s for public/broll/clips/. Re-run to (re)fetch.
# Sources are free-license (Coverr / Pexels / Pixabay). See docs/broll.md.
set -euo pipefail
cd "$(dirname "$0")/../public/broll/clips"
base="https://cdn.coverr.co/videos"
# Placeholder Coverr IDs — replace with final picks, keep filenames stable.
curl -L -o clip-1.mp4 "$base/coverr-typing-on-laptop-1234/1080p.mp4" || true
curl -L -o clip-2.mp4 "$base/coverr-team-meeting-5678/1080p.mp4" || true
curl -L -o clip-3.mp4 "$base/coverr-phone-scrolling-9012/1080p.mp4" || true
curl -L -o clip-4.mp4 "$base/coverr-city-night-3456/1080p.mp4" || true
curl -L -o clip-5.mp4 "$base/coverr-design-studio-7890/1080p.mp4" || true
curl -L -o clip-6.mp4 "$base/coverr-celebration-1122/1080p.mp4" || true
ls -la
