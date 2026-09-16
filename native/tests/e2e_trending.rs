use std::path::PathBuf;
use std::process::Command;

const IDEA: &str = "AI builds a site in 15 minutes, but creators still pay for sites that convert";

#[test]
#[ignore]
fn trending_e2e_produces_postable_mp4() {
    let tmp = std::env::temp_dir().join(format!("clipflow-e2e-{}", std::process::id()));
    std::fs::create_dir_all(&tmp).unwrap();
    let exe = PathBuf::from(env!("CARGO_BIN_EXE_clipflow"));
    let models = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../public/models");
    let st = Command::new(&exe)
        .args(["render", "--idea", IDEA, "--out"])
        .arg(&tmp)
        .args(["--models"])
        .arg(&models)
        .args(["--voice", "on"])
        .status()
        .expect("run clipflow render");
    assert!(st.success());
    let mp4 = tmp.join("ai-builds-a-916.mp4");
    assert!(mp4.exists(), "missing {mp4:?}");
    let ffprobe = ffmpeg_sidecar::ffprobe::ffprobe_path();
    let v = Command::new(&ffprobe)
        .args(["-v", "error", "-select_streams", "v:0",
               "-show_entries", "stream=width,height,codec_name",
               "-of", "csv=p=0"])
        .arg(&mp4)
        .output()
        .expect("probe video");
    assert!(v.status.success());
    // Newer ffprobe (8.x) emits stream fields in fixed internal order
    // (codec_name,width,height) with a trailing csv comma regardless of
    // the requested -show_entries order; accept either ordering.
    let got_v = String::from_utf8_lossy(&v.stdout).trim().trim_end_matches(',').to_string();
    assert!(
        got_v == "720,1280,h264" || got_v == "h264,720,1280",
        "unexpected video probe: {got_v:?}"
    );
    let a = Command::new(&ffprobe)
        .args(["-v", "error", "-select_streams", "a:0",
               "-show_entries", "stream=codec_name",
               "-of", "csv=p=0"])
        .arg(&mp4)
        .output()
        .expect("probe audio");
    assert!(a.status.success());
    assert_eq!(String::from_utf8_lossy(&a.stdout).trim().trim_end_matches(','), "aac");
    let tiktok = std::fs::read_to_string(tmp.join("ai-builds-a-tiktok.txt")).unwrap();
    assert!(tiktok.contains("#webdesign"));
}
