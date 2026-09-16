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

/// Full multi-image render: slow zoompan per image over its cue span,
/// concat → brand bar → subtitles → yuv420p, plus optional WAV audio.
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
        let n = ((*end - *start) * 30.0).round() as i64;
        let n = n.max(15);
        filter_parts.push(format!(
            "[{i}:v]scale=1440:2560,zoompan=z='min(zoom+0.0015,1.30)':d={n}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=720x1280:fps=30,setsar=1[v{i}]"
        ));
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
        cmd.arg("-i").arg(img);
    }
    if let Some(wav) = &job.wav {
        cmd.arg("-i").arg(wav);
    }
    cmd.args(["-filter_complex", &filter]);
    if job.wav.is_some() {
        cmd.args(["-map", "[vout]", "-map", &format!("{n_segs}:a")]);
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
