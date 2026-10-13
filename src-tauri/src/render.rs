use serde::Serialize;
use std::{collections::HashMap, fs::{self, File}, io::Write, path::{Path, PathBuf}, process::{Child, Command, Stdio}, sync::Mutex, time::{Duration, Instant}};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Header names the renderer uses to describe a raw frame batch. The body of a
/// `render_frames` call is pure RGB24 pixels, so the id and frame count travel as
/// headers (see src/lib/frame-batch.ts).
const HDR_RENDER_ID: &str = "x-clipflow-render-id";
const HDR_FRAME_COUNT: &str = "x-clipflow-frame-count";

/// Bytes per RGB24 frame at the given size. Alpha is dropped on the JS side
/// (`packRgb24`): every exported pixel is fully opaque, so rgb24 carries the
/// same picture in 25% fewer bytes than rgba.
const fn frame_bytes(width: u32, height: u32) -> usize { width as usize * height as usize * 3 }

/// Hard cap on staged voice audio: 16 kHz mono, ten minutes. Mirrors the limit
/// the old `Array.from` path enforced after JSON decoding.
const MAX_PCM_SAMPLES: usize = 16000 * 600;
/// A staged WAV nobody claimed is deleted on the next prepare after this long.
const PENDING_AUDIO_TTL: Duration = Duration::from_secs(3600);

struct Job { id: String, child: Child, temp: PathBuf, output: PathBuf, wav: PathBuf, log: PathBuf, frames: u32, expected: u32, width: u32, height: u32 }
/// Audio staged by `prepare_audio`, waiting for `begin_render` to claim it by token.
struct PendingAudio { path: PathBuf, staged_at: Instant }
#[derive(Default)]
pub struct RenderState { job: Mutex<Option<Job>>, pending_audio: Mutex<HashMap<String, PendingAudio>> }
#[derive(Serialize)]
pub struct RenderStart { id: String, output: String }

fn cleanup(job: &Job) { for path in [&job.temp, &job.wav, &job.log] { let _ = fs::remove_file(path); } }
/// Delete staged WAV files and drop their map entries.
fn discard_pending(pending: &mut HashMap<String, PendingAudio>) {
    for (_, staged) in pending.drain() { let _ = fs::remove_file(staged.path); }
}
/// Drop staged audio older than `PENDING_AUDIO_TTL`. A token is normally
/// claimed by `begin_render` seconds after staging; anything older is a render
/// that never started (dialog cancelled after prepare, page closed mid-flow).
fn sweep_pending(pending: &mut HashMap<String, PendingAudio>) {
    let now = Instant::now();
    pending.retain(|_, staged| {
        if now.duration_since(staged.staged_at) > PENDING_AUDIO_TTL { let _ = fs::remove_file(&staged.path); false }
        else { true }
    });
}
pub fn shutdown(state: &RenderState) {
    if let Ok(mut slot) = state.job.lock() {
        if let Some(mut job) = slot.take() { let _ = job.child.kill(); let _ = job.child.wait(); cleanup(&job); }
    }
    if let Ok(mut pending) = state.pending_audio.lock() { discard_pending(&mut pending); }
}
impl Drop for RenderState {
    fn drop(&mut self) {
        if let Ok(slot) = self.job.get_mut() { if let Some(mut job) = slot.take() { let _ = job.child.kill(); let _ = job.child.wait(); cleanup(&job); } }
        if let Ok(pending) = self.pending_audio.get_mut() { discard_pending(pending); }
    }
}

/// Decode little-endian f32 samples shipped as a raw IPC body (see
/// src/lib/pcm-bytes.ts). Pure so the limits are unit-testable without audio.
fn decode_pcm(bytes: &[u8]) -> Result<Vec<f32>, String> {
    if bytes.is_empty() || bytes.len() % 4 != 0 { return Err("Invalid voice audio".into()); }
    let count = bytes.len() / 4;
    if count > MAX_PCM_SAMPLES { return Err("Invalid voice audio".into()); }
    let mut samples = Vec::with_capacity(count);
    for chunk in bytes.chunks_exact(4) {
        let sample = f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
        if !sample.is_finite() { return Err("Invalid voice audio".into()); }
        samples.push(sample);
    }
    Ok(samples)
}

/// Encode samples as 16 kHz mono 16-bit WAV. Identical output to what the old
/// `Array.from` path produced — only the transport changed, not the bytes.
fn write_wav_file(path: &Path, samples: &[f32]) -> Result<(), String> {
    let spec = hound::WavSpec { channels: 1, sample_rate: 16000, bits_per_sample: 16, sample_format: hound::SampleFormat::Int };
    let mut writer = hound::WavWriter::create(path, spec).map_err(|e| e.to_string())?;
    for sample in samples { writer.write_sample((sample.clamp(-1.0, 1.0) * 32767.0) as i16).map_err(|e| e.to_string())?; }
    writer.finalize().map_err(|e| e.to_string())
}

/// Stage voice audio for the next render.
///
/// The body is raw little-endian f32 samples (`InvokeBody::Raw`, shipped as
/// `application/octet-stream` — no `Array.from`, no per-sample JSON). The WAV
/// is encoded here so `begin_render` can hand FFmpeg a file that already
/// exists when the encoder spawns. Returns a one-shot token the renderer
/// passes to `begin_render`; unclaimed tokens are swept after an hour.
#[tauri::command]
pub async fn prepare_audio(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<String, String> {
    // The request body only borrows the invoke payload, so decode (validating)
    // before entering the blocking pool; the owned Vec then moves in.
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => bytes.clone(),
        _ => return Err("Expected raw audio samples".into()),
    };
    let samples = decode_pcm(&bytes)?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<RenderState>();
        let mut pending = state.pending_audio.lock().map_err(|e| e.to_string())?;
        sweep_pending(&mut pending);
        let token = uuid::Uuid::new_v4().to_string();
        let path = std::env::temp_dir().join(format!(".clipflow-{}.wav", token));
        write_wav_file(&path, &samples)?;
        pending.insert(token.clone(), PendingAudio { path, staged_at: Instant::now() });
        Ok(token)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn begin_render(app: AppHandle, frames: u32, width: u32, height: u32, audio_token: Option<String>) -> Result<Option<RenderStart>, String> {
    if frames == 0 || frames > 18000 { return Err("Render duration must be between one frame and ten minutes.".into()); }
    if width == 0 || height == 0 || width > 8192 || height > 8192 { return Err("Invalid render dimensions".into()); }
    // yuv420p (libx264's output here) subsamples chroma, so odd dimensions fail deep
    // inside FFmpeg with an opaque message. Reject them before spawning.
    if width % 2 != 0 || height % 2 != 0 { return Err("Render dimensions must be even.".into()); }
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<RenderState>();
        let mut slot = state.job.lock().map_err(|e| e.to_string())?;
        if slot.is_some() { return Err("Another render is already running.".into()); }
        // Claim staged audio first: an unknown token fails before the dialog,
        // and a cancelled dialog deletes the staged file instead of leaking it.
        let staged_wav: Option<PathBuf> = if let Some(token) = audio_token {
            let mut pending = state.pending_audio.lock().map_err(|e| e.to_string())?;
            Some(pending.remove(&token).ok_or("Unknown voice audio. Re-run the export.".to_string())?.path)
        } else { None };
        let picked = app.dialog().file().add_filter("MP4 video", &["mp4"]).set_file_name("clipflow-916.mp4").blocking_save_file();
        let Some(picked) = picked else {
            if let Some(path) = staged_wav { let _ = fs::remove_file(path); }
            return Ok(None);
        };
        let output = picked.into_path().map_err(|e| e.to_string())?;
        let id = uuid::Uuid::new_v4().to_string();
        let temp = output.with_file_name(format!(".clipflow-{}.mp4", id));
        let has_audio = staged_wav.is_some();
        let wav = staged_wav.unwrap_or_else(|| output.with_file_name(format!(".clipflow-{}.wav", id)));
        let log = output.with_file_name(format!(".clipflow-{}.log", id));
        let ffmpeg = app.path().resource_dir().map_err(|e| e.to_string())?.join("ffmpeg.exe");
        if !ffmpeg.exists() { return Err("Bundled FFmpeg is missing. Reinstall Clipflow.".into()); }
        let mut command = Command::new(ffmpeg);
        #[cfg(windows)] command.creation_flags(0x08000000);
        // Raw RGB24 frames arrive over IPC already decoded; FFmpeg only converts the
        // pixel format. This replaces the old image2pipe/png input, which made
        // FFmpeg decompress every frame the renderer had just compressed.
        command.args(["-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pixel_format", "rgb24", "-video_size"]);
        command.arg(format!("{}x{}", width, height));
        command.args(["-framerate", "30", "-i", "pipe:0"]);
        if has_audio {
            command.arg("-i").arg(&wav).args(["-c:a", "aac", "-b:a", "128k", "-shortest"]);
        }
        command.args(["-c:v", "libx264", "-preset", "fast", "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart"]).arg(&temp);
        let stderr = File::create(&log).map_err(|e| e.to_string())?;
        let child = match command.stdin(Stdio::piped()).stdout(Stdio::null()).stderr(stderr).spawn() {
            Ok(child) => child,
            Err(e) => { let _ = fs::remove_file(&wav); let _ = fs::remove_file(&log); return Err(e.to_string()); }
        };
        let result = RenderStart { id: id.clone(), output: output.to_string_lossy().into() };
        *slot = Some(Job { id, child, temp, output, wav, log, frames: 0, expected: frames, width, height });
        Ok(Some(result))
    }).await.map_err(|e| e.to_string())?
}

/// Read a required ASCII header from the raw IPC request.
fn header<'r>(request: &'r tauri::ipc::Request<'_>, name: &str) -> Result<&'r str, String> {
    request.headers().get(name).and_then(|v| v.to_str().ok())
        .ok_or_else(|| format!("Missing {} header", name))
}

/// Check that a raw batch is internally consistent before anything is written.
///
/// Pure so it can be unit-tested: a body whose length is not an exact whole
/// number of `count` frames would otherwise be written straight to FFmpeg,
/// shifting every later frame and producing a silently corrupt video.
fn validate_batch(width: u32, height: u32, count: u32, len: usize, frames: u32, expected: u32) -> Result<(), String> {
    if count == 0 { return Err("Frame batch is empty".into()); }
    let batch_bytes = frame_bytes(width, height)
        .checked_mul(count as usize).ok_or("Frame batch is too large")?;
    if len != batch_bytes {
        return Err(format!("Frame batch is {} bytes, expected {} ({} frames of {}x{})",
            len, batch_bytes, count, width, height));
    }
    if frames + count > expected { return Err("Too many render frames".into()); }
    Ok(())
}

/// Accept one batch of raw RGB24 frames.
///
/// The body is the pixels themselves (`InvokeBody::Raw`), with the job id and
/// frame count carried in headers — no base64, no PNG round trip. FFmpeg is
/// started with `-f rawvideo`, so these bytes go straight to its stdin.
///
/// Ordering: the renderer keeps at most one batch in flight and awaits this
/// command before sending the next, so frames cannot be written out of order.
/// The length check below turns a truncated or over-long body into a clear
/// error instead of silently shifting every later frame.
#[tauri::command]
pub async fn render_frames(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<u32, String> {
    let id = header(&request, HDR_RENDER_ID)?.to_owned();
    let count: u32 = header(&request, HDR_FRAME_COUNT)?.parse()
        .map_err(|_| "Invalid frame count".to_string())?;
    // The request body only borrows the invoke payload, so copy it once to hand
    // an owned buffer to the blocking pool. The memcpy is a few milliseconds
    // against a batch FFmpeg spends far longer encoding.
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => bytes.clone(),
        _ => return Err("Expected raw frame pixels".into()),
    };
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<RenderState>();
        let mut slot = state.job.lock().map_err(|e| e.to_string())?;
        let job = slot.as_mut().filter(|job| job.id == id).ok_or("Render cancelled")?;
        validate_batch(job.width, job.height, count, bytes.len(), job.frames, job.expected)?;
        job.child.stdin.as_mut().ok_or("Encoder input closed")?.write_all(&bytes).map_err(|e| format!("Encoder stopped: {}", e))?;
        job.frames += count;
        Ok(count)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn finish_render(app: AppHandle, id: String) -> Result<String, String> {
    // Close input, then poll outside the lock so cancellation can kill FFmpeg during finalization.
    {
        let state = app.state::<RenderState>();
        let mut slot = state.job.lock().map_err(|e| e.to_string())?;
        let job = slot.as_mut().filter(|job| job.id == id).ok_or("Render cancelled")?;
        if job.frames != job.expected { return Err("Render is incomplete".into()); }
        job.child.stdin.take();
    }
    tauri::async_runtime::spawn_blocking(move || loop {
        {
            let state = app.state::<RenderState>();
            let mut slot = state.job.lock().map_err(|e| e.to_string())?;
            let job = slot.as_mut().filter(|job| job.id == id).ok_or("Render cancelled")?;
            if let Some(status) = job.child.try_wait().map_err(|e| e.to_string())? {
                let job = slot.take().unwrap();
                if !status.success() {
                    let error = fs::read_to_string(&job.log).unwrap_or_default();
                    cleanup(&job);
                    return Err(format!("FFmpeg could not finish the video: {}", error));
                }
                if let Err(e) = fs::rename(&job.temp, &job.output) { cleanup(&job); return Err(format!("Could not save MP4: {}", e)); }
                app.asset_protocol_scope().allow_file(&job.output).map_err(|e| e.to_string())?;
                cleanup(&job);
                return Ok(job.output.to_string_lossy().into());
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn cancel_render(app: AppHandle, id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<RenderState>();
        let mut slot = state.job.lock().map_err(|e| e.to_string())?;
        if slot.as_ref().is_some_and(|j| j.id == id) {
            let mut job = slot.take().unwrap();
            let _ = job.child.kill(); let _ = job.child.wait(); cleanup(&job);
        }
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    const W: u32 = 720;
    const H: u32 = 1280;
    const FRAME: usize = 720 * 1280 * 3;

    #[test]
    fn frame_bytes_is_rgb24() {
        assert_eq!(frame_bytes(W, H), 2_764_800);
    }

    #[test]
    fn accepts_a_whole_batch() {
        assert!(validate_batch(W, H, 4, FRAME * 4, 0, 30).is_ok());
    }

    #[test]
    fn accepts_the_final_partial_batch() {
        // A render of 10 frames batches as 4 + 4 + 2.
        assert!(validate_batch(W, H, 4, FRAME * 4, 0, 10).is_ok());
        assert!(validate_batch(W, H, 4, FRAME * 4, 4, 10).is_ok());
        assert!(validate_batch(W, H, 2, FRAME * 2, 8, 10).is_ok());
    }

    #[test]
    fn rejects_a_truncated_body() {
        // One byte short is the failure that silently corrupts every later frame.
        let err = validate_batch(W, H, 4, FRAME * 4 - 1, 0, 30).unwrap_err();
        assert!(err.contains("expected"), "got: {err}");
    }

    #[test]
    fn rejects_an_overlong_body() {
        assert!(validate_batch(W, H, 4, FRAME * 4 + 1, 0, 30).is_err());
    }

    #[test]
    fn rejects_a_body_that_is_not_whole_frames() {
        // Correct size for two frames, but declared as one.
        assert!(validate_batch(W, H, 1, FRAME * 2, 0, 30).is_err());
    }

    #[test]
    fn rejects_zero_frames() {
        assert!(validate_batch(W, H, 0, 0, 0, 30).is_err());
    }

    #[test]
    fn rejects_more_frames_than_the_job_wants() {
        // Exactly at the limit is fine; one past it is not.
        assert!(validate_batch(W, H, 4, FRAME * 4, 26, 30).is_ok());
        let err = validate_batch(W, H, 4, FRAME * 4, 27, 30).unwrap_err();
        assert!(err.contains("Too many"), "got: {err}");
    }

    #[test]
    fn rejects_a_count_that_would_overflow() {
        // Never panics: on 64-bit the multiply fits and the length check rejects
        // it; on 32-bit checked_mul saturates to the "too large" error instead.
        assert!(validate_batch(W, H, u32::MAX, 0, 0, u32::MAX).is_err());
    }

    #[test]
    fn decode_pcm_round_trips_f32_le() {
        let samples = [1.0f32, -0.5, 0.0, 0.123456];
        let mut bytes = Vec::new();
        for s in samples { bytes.extend_from_slice(&s.to_le_bytes()); }
        assert_eq!(decode_pcm(&bytes).unwrap(), samples);
    }

    #[test]
    fn decode_pcm_rejects_an_empty_body() {
        assert!(decode_pcm(&[]).is_err());
    }

    #[test]
    fn decode_pcm_rejects_a_length_that_is_not_whole_samples() {
        assert!(decode_pcm(&[0, 0, 0]).is_err());
        assert!(decode_pcm(&[0, 0, 0, 0, 0]).is_err());
    }

    #[test]
    fn decode_pcm_rejects_more_than_ten_minutes() {
        // 4 bytes over the cap, all zeros (no 38 MB allocation in the test).
        let over = (MAX_PCM_SAMPLES + 1) * 4;
        assert!(decode_pcm(&vec![0u8; over]).is_err());
        assert!(decode_pcm(&vec![0u8; MAX_PCM_SAMPLES * 4]).unwrap().len() == MAX_PCM_SAMPLES);
    }

    #[test]
    fn decode_pcm_rejects_non_finite_samples() {
        let mut bytes = 0.5f32.to_le_bytes().to_vec();
        bytes.extend_from_slice(&f32::NAN.to_le_bytes());
        let err = decode_pcm(&bytes).unwrap_err();
        assert!(err.contains("Invalid voice audio"), "got: {err}");
        let mut inf = Vec::new();
        inf.extend_from_slice(&f32::INFINITY.to_le_bytes());
        assert!(decode_pcm(&inf).is_err());
    }

    #[test]
    fn write_wav_file_encodes_clamped_i16_mono() {
        // Same bytes the old Array.from path produced: clamp, scale, truncate.
        let path = std::env::temp_dir().join(format!(".clipflow-test-{}.wav", uuid::Uuid::new_v4()));
        let samples = [1.0f32, -1.0, 0.5, 2.0, -2.0, 0.0];
        write_wav_file(&path, &samples).unwrap();
        let mut reader = hound::WavReader::open(&path).unwrap();
        let spec = reader.spec();
        assert_eq!((spec.channels, spec.sample_rate, spec.bits_per_sample), (1, 16000, 16));
        let got: Vec<i16> = reader.samples::<i16>().map(|s| s.unwrap()).collect();
        assert_eq!(got, [32767, -32767, 16383, 32767, -32767, 0]);
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn sweep_pending_keeps_fresh_and_deletes_stale() {
        use std::time::Instant;
        let fresh_path = std::env::temp_dir().join(format!(".clipflow-test-{}.wav", uuid::Uuid::new_v4()));
        let stale_path = std::env::temp_dir().join(format!(".clipflow-test-{}.wav", uuid::Uuid::new_v4()));
        fs::write(&fresh_path, b"fresh").unwrap();
        fs::write(&stale_path, b"stale").unwrap();
        let mut map = HashMap::new();
        map.insert("fresh".to_string(), PendingAudio { path: fresh_path.clone(), staged_at: Instant::now() });
        map.insert("stale".to_string(), PendingAudio { path: stale_path.clone(), staged_at: Instant::now() - PENDING_AUDIO_TTL - Duration::from_secs(1) });
        sweep_pending(&mut map);
        assert!(map.contains_key("fresh") && !map.contains_key("stale"));
        assert!(fresh_path.exists() && !stale_path.exists());
        let _ = fs::remove_file(&fresh_path);
    }
}
