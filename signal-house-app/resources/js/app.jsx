import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

const labels = ['All work', 'Octane Archive', 'Clipflow', 'MStudio Web'];

function FilmGallery({ films }) {
    const [active, setActive] = useState('All work');
    const visible = active === 'All work' ? films : films.filter((film) => film.channel === active);

    function pauseOtherFilms(current) {
        document.querySelectorAll('#film-gallery video').forEach((video) => {
            if (video !== current) video.pause();
        });
    }

    return <>
        <div className="film-filters" role="group" aria-label="Filter films by channel">
            {labels.map((label) => <button
                key={label}
                type="button"
                className={active === label ? 'active' : ''}
                aria-pressed={active === label}
                onClick={() => setActive(label)}
            >{label}<span aria-hidden="true">{label === 'All work' ? String(films.length).padStart(2, '0') : String(films.filter((film) => film.channel === label).length).padStart(2, '0')}</span></button>)}
        </div>
        <p className="sr-only" role="status">Showing {visible.length} {visible.length === 1 ? 'film' : 'films'}.</p>
        <div className="film-grid">
            {visible.map((film) => <article className="film-card" key={film.number}>
                <div className="film-screen">
                    <video controls playsInline preload="none" poster={`/${film.poster}`} aria-label={`Watch ${film.title} by ${film.channel}`} onPlay={(event) => pauseOtherFilms(event.currentTarget)}>
                        <source src={`/${film.video}`} type="video/mp4" />
                        Your browser does not support video playback.
                    </video>
                    <span className="film-index" aria-hidden="true">{film.number}</span>
                </div>
                <div className="film-meta"><div><span className="film-channel">{film.channel}</span><h3>{film.title}</h3><p>{film.description}</p></div><span className="film-format">{film.format}</span></div>
            </article>)}
        </div>
    </>;
}

const mount = document.getElementById('film-gallery');
const data = document.getElementById('film-data');
if (mount && data) {
    const films = JSON.parse(data.textContent || '[]');
    createRoot(mount).render(<FilmGallery films={films} />);
}
