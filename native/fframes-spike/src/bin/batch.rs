//! Phase 5 spike: batch render — three hook+cta cuts, sequential, timed.
//! Mirrors the remotion-studio batch role (N clips per run) with the same
//! shared audio-mix policy constants ported in audio_mix.rs.

use std::time::Instant;

use fframes::RenderOptions;
use fframes_spike::audio_mix::{
    self, DUCK_STANDARD, LOUDNORM, MIX_LIMIT,
};
use fframes_spike::clip::{
    HookClip, CLIPFLOW, MINI_CLIPFLOW, MINI_MSTUDIO_A, MINI_MSTUDIO_B, MSTUDIO,
};
use fframes_spike::SpikeMedia;

fn main() -> std::process::ExitCode {
    let media = match SpikeMedia::new() {
        Ok(media) => media,
        Err(error) => {
            eprintln!("media: {error}");
            return std::process::ExitCode::FAILURE;
        }
    };

    let clips: [(&str, HookClip); 3] = [
        (
            "out/batch-01-mstudio-a.mp4",
            HookClip {
                cues: MINI_MSTUDIO_A,
                theme: MSTUDIO,
                secs: 15.0,
            },
        ),
        (
            "out/batch-02-mstudio-b.mp4",
            HookClip {
                cues: MINI_MSTUDIO_B,
                theme: MSTUDIO,
                secs: 15.0,
            },
        ),
        (
            "out/batch-03-clipflow.mp4",
            HookClip {
                cues: MINI_CLIPFLOW,
                theme: CLIPFLOW,
                secs: 15.0,
            },
        ),
    ];

    println!(
        "audio policy (from shared/audio-mix.ts port): duck speaking/idle {}/{} lead {}s, loudnorm {}, limit {}",
        DUCK_STANDARD.speaking,
        DUCK_STANDARD.idle,
        DUCK_STANDARD.lead_secs,
        LOUDNORM,
        MIX_LIMIT
    );
    println!(
        "voice graph sample: {}",
        audio_mix::voice_mix_tail(2, 45.0, "a")
    );

    let _ = std::fs::create_dir_all("out");
    let batch_start = Instant::now();
    for (index, (path, video)) in clips.iter().enumerate() {
        let options = RenderOptions {
            media: Some(&media),
            default_font: fframes_spike::clip::FONT,
            ..Default::default()
        };
        let start = Instant::now();
        let backend = fframes::cpu::CpuRenderingBackend::default();
        if let Err(error) = fframes::render(path, video, backend, &options) {
            eprintln!("{path}: {error}");
            return std::process::ExitCode::FAILURE;
        }
        println!(
            "[{}/{}] {} {:.1}s clip -> {path}",
            index + 1,
            clips.len(),
            start.elapsed().as_secs_f32(),
            video.secs
        );
    }
    println!(
        "batch total: {:.1}s for {} clips",
        batch_start.elapsed().as_secs_f32(),
        clips.len()
    );
    std::process::ExitCode::SUCCESS
}
