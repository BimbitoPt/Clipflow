//! Phase 4 spike CLI: timeline/inspect/strip/frame/onion/render for HookClip.

use fframes::RenderOptions;
use fframes_spike::clip::HookClip;
use fframes_spike::SpikeMedia;

fn main() -> std::process::ExitCode {
    let media = match SpikeMedia::new() {
        Ok(media) => media,
        Err(error) => {
            eprintln!("media: {error}");
            return std::process::ExitCode::FAILURE;
        }
    };
    let video = HookClip::default();
    let options = RenderOptions {
        media: Some(&media),
        default_font: fframes_spike::clip::FONT,
        ..Default::default()
    };
    fframes::cli::new(&video, options).run()
}
