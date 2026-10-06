# Signal House

Laravel portfolio for the creative studio behind Clipflow. The home page uses the existing Signal House brandkit and opens with three Octane Archive car edits plus finished Clipflow and MStudio Web films.

## Run locally

Requires PHP 8.3 or newer and Composer. From this directory:

```sh
composer install
cp .env.example .env
php artisan key:generate
npm install
npm run build
php artisan serve
```

Then visit `http://127.0.0.1:8000`. Laravel renders the page and film cards; a small React component adds channel filters and pauses other films when a new one plays. The design CSS is in `public/css/site.css`. If the JavaScript bundle is unavailable, the Blade film grid remains visible.

## Add work

1. Copy a final MP4 and poster image into `public/work/`.
2. Add an entry to `config/portfolio.php` with a title, description, channel, format, poster, and video path.
3. Review the page and play the media on desktop and mobile before publishing.

The car edits are local review drafts from Octane Archive. Their source footage and music information is recorded in [`../brand/octane-archive-visual-direction.md`](../brand/octane-archive-visual-direction.md) and [`../brand/octane-archive-sources.json`](../brand/octane-archive-sources.json). The two product films come from the Remotion Studio ready-to-post set dated 29 September 2026.

## Identity

The palette, typography, mark, and voice follow [`../brand/signal-house-brandkit.md`](../brand/signal-house-brandkit.md). Signal House is the creative home; Clipflow remains its own product brand.
