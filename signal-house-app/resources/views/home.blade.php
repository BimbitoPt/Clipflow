<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#101311">
    <meta name="description" content="Signal House is the independent creative studio behind Clipflow and original media projects. Find the signal. Make it matter.">
    <meta property="og:title" content="Signal House — Find the signal. Make it matter.">
    <meta property="og:description" content="The creative home behind Clipflow and original stories.">
    <meta property="og:type" content="website">
    <title>Signal House — Find the signal. Make it matter.</title>
    <link rel="icon" type="image/svg+xml" href="{{ asset('brand/signal-house-mark.svg') }}">
    <link rel="stylesheet" href="{{ asset('css/site.css') }}">
    <script type="application/json" id="film-data">@json($films)</script>
    @viteReactRefresh
    @vite('resources/js/app.jsx')
</head>
<body>
    <header class="site-header">
        <a class="wordmark" href="#top" aria-label="Signal House home"><img src="{{ asset('brand/signal-house-logo.svg') }}" alt="Signal House"></a>
        <nav aria-label="Main navigation"><a href="#work">Work</a><a href="#studio">Studio</a><a class="nav-cta" href="#work">Explore the films <span aria-hidden="true">↗</span></a></nav>
    </header>

    <main id="top">
        <section class="hero" aria-labelledby="hero-title">
            <div class="hero-copy">
                <div class="eyebrow"><span class="signal-line"></span>Independent creative studio <span class="eyebrow-index">Lisbon / 2026</span></div>
                <h1 id="hero-title">Find the signal.<br><em>Make it matter.</em></h1>
                <p class="hero-lede">We turn ideas into stories people notice and remember. Signal House is the creative home behind Clipflow and a growing collection of original work.</p>
                <a class="text-link" href="#work">Explore selected work <span aria-hidden="true">↗</span></a>
            </div>
            <div class="hero-art" aria-hidden="true">
                <div class="hero-art-label">Strategy / Story / Studio</div>
                <svg viewBox="0 0 600 580" fill="none" role="presentation"><path d="M81 498V82h416v416H289V290h208" stroke="currentColor" stroke-width="18"/><path d="M153 426V154h272v272H289" stroke="currentColor" stroke-width="13" opacity=".45"/><path d="M219 360V220h140" stroke="currentColor" stroke-width="9" opacity=".2"/></svg>
                <span class="hero-art-bottom">An idea becomes a story.</span>
            </div>
            <div class="hero-foot"><span>01 / The creative home</span><span>Scroll to see what we make ↓</span></div>
        </section>

        <section class="intro-band" id="studio" aria-labelledby="studio-title"><div class="section-label">The studio <span>01—03</span></div><div><h2 id="studio-title">Clear thinking.<br>Stories that stay.</h2><p>We build the tools, make the films and put the work into the world. Clipflow powers the production; Signal House gives every project a point of view.</p></div><div class="intro-stamp">SH<span>®</span></div></section>

        <section class="work-section" id="work" aria-labelledby="work-title">
            <div class="section-topline"><span>Selected work</span><span>Films / experiments / originals</span></div>
            <div class="work-heading"><h2 id="work-title">Made to be<br><em>seen.</em></h2><p>From the speed and sound of Octane Archive to product stories for Clipflow and MStudio Web, each piece starts with a clear point of view.</p></div>
            <div id="film-gallery"><div class="film-grid">
                @foreach ($films as $film)
                    <article class="film-card">
                        <div class="film-screen"><video controls playsinline preload="none" poster="{{ asset($film['poster']) }}" aria-label="Watch {{ $film['title'] }} by {{ $film['channel'] }}"><source src="{{ asset($film['video']) }}" type="video/mp4">Your browser does not support video playback.</video><span class="film-index" aria-hidden="true">{{ $film['number'] }}</span></div>
                        <div class="film-meta"><div><span class="film-channel">{{ $film['channel'] }}</span><h3>{{ $film['title'] }}</h3><p>{{ $film['description'] }}</p></div><span class="film-format">{{ $film['format'] }}</span></div>
                    </article>
                @endforeach
            </div></div>
            <p class="work-note">More work from Clipflow will join this collection as it is finished.</p>
        </section>

        <section class="worlds" aria-labelledby="worlds-title"><div class="section-label">The house <span>02—03</span></div><h2 id="worlds-title">One studio.<br><em>Many stories.</em></h2><div class="world-grid"><div><span class="world-number">01 / Product</span><h3>Clipflow</h3><p>Our video creation engine. From a raw idea to a finished short, it helps us move faster while keeping the creative choices human.</p></div><div><span class="world-number">02 / Original channel</span><h3>Octane Archive</h3><p>A visual-first home for car culture: speed, sound, light and the details that make a moment worth replaying.</p></div><div><span class="world-number">03 / Studio partner</span><h3>MStudio Web</h3><p>Digital products and websites with a story worth telling. Signal House makes the films that bring that work into view.</p></div></div></section>
    </main>

    <footer class="site-footer"><div><img src="{{ asset('brand/signal-house-logo.svg') }}" alt="Signal House"><p>Find the signal. Make it matter.</p></div><div><span>Strategy / Story / Studio</span><span>Lisbon, Portugal</span><span>© {{ date('Y') }} Signal House</span></div></footer>
</body>
</html>
