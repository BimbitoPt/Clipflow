use std::path::PathBuf;
use std::process::Command;

const IDEA: &str = "AI builds a site in 15 minutes, but creators still pay for sites that convert";

fn parse_ass_secs(s: &str) -> f64 {
    let mut parts = s.trim().split(':');
    let h: f64 = parts.next().unwrap_or("0").trim().parse().unwrap();
    let m: f64 = parts.next().unwrap_or("0").trim().parse().unwrap();
    let sec: f64 = parts.next().unwrap_or("0").trim().parse().unwrap();
    h.mul_add(3600.0, m.mul_add(60.0, sec))
}

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
    let d = Command::new(&ffprobe)
        .args(["-v", "error", "-show_entries", "format=duration",
               "-of", "csv=p=0"])
        .arg(&mp4)
        .output()
        .expect("probe duration");
    assert!(d.status.success());
    let duration: f64 = String::from_utf8_lossy(&d.stdout)
        .trim()
        .parse()
        .expect("mp4 duration parses as f64");
    // GATE 1 — LOUDNESS FLOOR: raw ort output measured -26 dB on
    // 2026-09-16; the loudnorm stage measures -3.8 dB today. A
    // threshold of -12 dB passes now and catches a future loudnorm
    // regression (missing/bypassed normalization).
    let ffmpeg = ffmpeg_sidecar::paths::ffmpeg_path();
    let nulldev = if cfg!(windows) { "NUL" } else { "/dev/null" };
    let vd = Command::new(&ffmpeg)
        .args(["-v", "info", "-i"])
        .arg(&mp4)
        .args(["-map", "0:a", "-af", "volumedetect", "-f", "null"])
        .arg(nulldev)
        .output()
        .expect("run volumedetect");
    let err = String::from_utf8_lossy(&vd.stderr).to_string();
    let mut max_volume: Option<f64> = None;
    for line in err.lines() {
        if let Some(pos) = line.find("max_volume") {
            let after = &line[pos + "max_volume".len()..];
            // after looks like ": -3.8 dB"; take the token before "dB".
            if let Some(db_pos) = after.find("dB") {
                let num: String = after[..db_pos]
                    .chars()
                    .filter(|c| c.is_ascii_digit() || *c == '.' || *c == '-' || *c == '+')
                    .collect();
                if let Ok(v) = num.parse::<f64>() {
                    max_volume = Some(v);
                }
            }
        }
    }
    let max_volume =
        max_volume.expect("volumedetect stderr must report max_volume");
    println!("measured max_volume: {max_volume} dB");
    assert!(
        max_volume > -12.0,
        "loudness floor failed: max_volume {max_volume} dB <= -12 dB\n{err}"
    );
    // GATE 2 — CAPTION COVERAGE: the e2e binary writes intermediates
    // (wav, ass) to a per-process temp dir
    // `std::env::temp_dir()/clipflow-{childpid}` (native/src/main.rs),
    // so scan temp for the freshest `ai-builds-a.ass` outside our own
    // `clipflow-e2e-*` out dir. Last Dialogue end must sit within
    // ±1.5s of the probed mp4 duration.
    // Bound rationale: a 77-word script chunked at ≤4 words yields
    // 20+ Dialogue events, while a single-blob caption failure yields
    // ≤6; requiring ≥ 10 separates the two regimes robustly.
    let mut ass_path: Option<PathBuf> = None;
    let mut ass_mtime: Option<std::time::SystemTime> = None;
    for entry in std::fs::read_dir(std::env::temp_dir()).unwrap() {
        let entry = entry.unwrap();
        let name = entry.file_name().to_string_lossy().into_owned();
        if !name.starts_with("clipflow-") || name.starts_with("clipflow-e2e-") {
            continue;
        }
        let cand = entry.path().join("ai-builds-a.ass");
        if !cand.exists() {
            continue;
        }
        let mtime = std::fs::metadata(&cand)
            .and_then(|m| m.modified())
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
        if ass_mtime.is_none_or(|t| mtime > t) {
            ass_mtime = Some(mtime);
            ass_path = Some(cand);
        }
    }
    let ass_path = ass_path.expect("intermediate ai-builds-a.ass must exist");
    let ass = std::fs::read_to_string(&ass_path).unwrap();
    let mut dialogue_count = 0usize;
    let mut last_end = 0.0f64;
    for line in ass.lines() {
        let stripped = line.trim_start();
        if !stripped.starts_with("Dialogue:") {
            continue;
        }
        let fields: Vec<&str> =
            stripped["Dialogue:".len()..].split(',').collect();
        assert!(
            fields.len() >= 3,
            "malformed Dialogue line in {ass_path:?}: {line:?}"
        );
        dialogue_count += 1;
        let end = parse_ass_secs(fields[2]);
        if end > last_end {
            last_end = end;
        }
    }
    assert!(
        dialogue_count >= 10,
        "caption coverage failed: {dialogue_count} Dialogue events < 10"
    );
    assert!(
        (last_end - duration).abs() <= 1.5,
        "caption coverage failed: last Dialogue end {last_end}s vs mp4 {duration}s"
    );
    // SOURCE DIVERSITY gate deliberately skipped here: segment
    // composition cannot be probed reliably from the finished mp4.
    // Diversity is covered at unit level by `assigns_five_distinct_sources`
    // + `source_of_maps_clips_to_photos` in native/src/broll.rs.
}
