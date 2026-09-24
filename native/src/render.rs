use std::path::{Path, PathBuf};
use std::process::Command;

/// Render a 720x1280 fixture clip from a single still image.
///
/// Spawns the ffmpeg-sidecar binary: loops the input image, mixes in
/// 3s of silent stereo audio, applies a scale + slow zoompan to
/// 720x1280@30fps, and encodes H.264 + AAC with faststart. Overwrites `out`.
pub fn render_fixture(image: &Path, out: &Path) -> anyhow::Result<()> {
    ffmpeg_sidecar::download::auto_download()?;
    let ffmpeg = ffmpeg_sidecar::paths::ffmpeg_path();
    let output = Command::new(&ffmpeg)
        .args([
            "-y",
            "-loop",
            "1",
            "-i",
        ])
        .arg(image)
        .args(["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo:d=3"])
        .args([
            "-vf",
            "scale=1440:2560,zoompan=z='min(zoom+0.0015,1.30)':d=90:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=720x1280:fps=30",
            "-map",
            "0:v",
            "-map",
            "1:a",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "22",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-shortest",
            "-movflags",
            "+faststart",
        ])
        .arg(out)
        .output()?;
    if !output.status.success() {
        anyhow::bail!(
            "ffmpeg failed ({}): {}",
            output.status,
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }
    Ok(())
}

pub struct Job {
    pub images: Vec<PathBuf>,
    pub wav: Option<PathBuf>,
    pub ass: PathBuf,
    pub out: PathBuf,
}

pub fn is_video(path: &Path) -> bool {
    match path.extension().and_then(|e| e.to_str()) {
        Some(ext) => matches!(ext.to_ascii_lowercase().as_str(), "mp4" | "mov" | "webm" | "mkv"),
        None => false,
    }
}

/// Full mixed render: per cue, a still gets slow zoompan and a motion clip
/// gets scale+crop with the span trimmed from a seamless loop (`-stream_loop`
/// keeps short clips alive over longer spans). Clip audio is dropped; the VO
/// track is the only audio. concat -> brand bar -> subtitles -> yuv420p.
pub fn render(job: &Job, cue_secs: &[(f64, f64)]) -> anyhow::Result<()> {
    if job.images.len() != cue_secs.len() {
        anyhow::bail!(
            "images ({}) and cue_secs ({}) length mismatch",
            job.images.len(),
            cue_secs.len()
        );
    }
    ffmpeg_sidecar::download::auto_download()?;
    let ffmpeg = ffmpeg_sidecar::paths::ffmpeg_path();

    let mut filter_parts: Vec<String> = Vec::new();
    let mut concat_inputs = String::new();
    for (i, (start, end)) in cue_secs.iter().enumerate() {
        let span = *end - *start;
        let chain = if is_video(&job.images[i]) {
            format!(
                "[{i}:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=30,trim=duration={span},setpts=PTS-STARTPTS,setsar=1[v{i}]"
            )
        } else {
            let n = ((end * 30.0).round() - (start * 30.0).round()) as i64;
            let n = n.max(1);
            format!(
                "[{i}:v]scale=1440:2560,zoompan=z='min(zoom+0.0015,1.30)':d={n}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=720x1280:fps=30,setsar=1[v{i}]"
            )
        };
        filter_parts.push(chain);
        concat_inputs.push_str(&format!("[v{i}]"));
    }
    let n_segs = cue_secs.len();
    filter_parts.push(format!("{concat_inputs}concat=n={n_segs}:v=1:a=0[vcat]"));
    filter_parts.push("[vcat]drawbox=x=0:y=0:w=720:h=12:c=0x246BFD:t=fill[vbox]".to_string());
    let mut ass = job.ass.to_string_lossy().replace('\\', "/");
    ass = ass
        .replace('\\', "\\\\")
        .replace('\'', "\\'")
        .replace(':', "\\:");
    filter_parts.push(format!("[vbox]subtitles='{ass}',format=yuv420p[vout]"));
    let filter = filter_parts.join(";");

    let mut cmd = Command::new(&ffmpeg);
    cmd.arg("-y");
    for img in &job.images {
        if is_video(img) {
            // Infinite loop lets short clips cover any cue span; the
            // per-segment trim bounds it and -shortest ends the mux.
            cmd.args(["-stream_loop", "-1"]);
        }
        cmd.arg("-i").arg(img);
    }
    if let Some(wav) = &job.wav {
        cmd.arg("-i").arg(wav);
    }
    cmd.args(["-filter_complex", &filter]);
    if job.wav.is_some() {
        cmd.args(["-map", "[vout]", "-map", &format!("{n_segs}:a")]);
        // Normalize ort/SAPI voiceovers: raw TTS renders whisper-quiet
        // (measured max -26 dB). Single-pass loudnorm to social loudness.
        cmd.args(["-af", "loudnorm=I=-14:TP=-1:LRA=11"]);
        cmd.args(["-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2"]);
    } else {
        cmd.args(["-map", "[vout]"]);
    }
    cmd.args(["-movflags", "+faststart", "-shortest"]);
    cmd.args(["-c:v", "libx264", "-preset", "veryfast", "-crf", "20"]);
    cmd.arg(&job.out);
    if let Some(parent) = job.out.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }
    let output = cmd.output()?;
    if !output.status.success() {
        anyhow::bail!(
            "ffmpeg failed ({}): {}",
            output.status,
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }
    Ok(())
}
