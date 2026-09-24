use std::path::PathBuf;
use std::process::Command;

use clipflow::render::is_video;

fn probe_size(out: &PathBuf) -> String {
    let ffprobe = ffmpeg_sidecar::ffprobe::ffprobe_path();
    let probe = Command::new(&ffprobe)
        .args(["-v", "error", "-select_streams", "v:0",
               "-show_entries", "stream=width,height",
               "-of", "csv=p=0"])
        .arg(out)
        .output()
        .expect("probe video");
    String::from_utf8_lossy(&probe.stdout).trim().to_string()
}

#[test]
fn clip_input_renders_motion_not_frozen_frame() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
    let clip = root.join("public/broll/clips/clip-4.mp4");
    if !clip.exists() {
        panic!("clip-4.mp4 missing: fixture pool must ship motion clips");
    }
    assert!(is_video(&clip));
    // One 4s video cue + one still cue: mixed concat exercises both chains.
    let out = std::env::temp_dir().join("clipflow-render-clip-fixture.mp4");
    let _ = std::fs::remove_file(&out);
    let job = clipflow::render::Job {
        images: vec![clip.clone(), root.join("public/broll/10.jpg")],
        wav: None,
        ass: root.join("native/tests/blank.ass"),
        out: out.clone(),
    };
    if !job.ass.exists() {
        std::fs::write(&job.ass, "[Script Info]\nScriptType: v4.00+\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Helvetica,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,40,40,140,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.00,0:00:12.00,Default,,0,0,0,,{\\an2}clip test\n").unwrap();
    }
    clipflow::render::render(&job, &[(0.0, 4.0), (4.0, 8.0)]).expect("mixed render");
    assert_eq!(probe_size(&out), "720,1280");
    assert!(out.metadata().unwrap().len() > 100_000);
}
