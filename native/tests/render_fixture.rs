use std::path::PathBuf;
use std::process::Command;

#[test]
fn fixture_renders_720x1280_mp4() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
    let out = std::env::temp_dir().join("clipflow-render-fixture.mp4");
    clipflow::render::render_fixture(&root.join("public/broll/10.jpg"), &out).expect("render");
    assert!(out.exists());
    let ffprobe = ffmpeg_sidecar::ffprobe::ffprobe_path();
    let probe = Command::new(&ffprobe)
        .args(["-v", "error", "-select_streams", "v:0",
               "-show_entries", "stream=width,height",
               "-of", "csv=p=0"])
        .arg(&out)
        .output()
        .expect("probe video");
    assert_eq!(String::from_utf8_lossy(&probe.stdout).trim(), "720,1280");
}
