use serde::Serialize;
use std::{fs::{self, File}, io::Write, path::PathBuf, process::{Child, Command, Stdio}, sync::Mutex};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Header names the renderer uses to describe a raw frame batch. The body of a
/// `render_frames` call is pure RGBA pixels, so the id and frame count travel as
/// headers (see src/lib/frame-batch.ts).
const HDR_RENDER_ID: &str = "x-clipflow-render-id";
const HDR_FRAME_COUNT: &str = "x-clipflow-frame-count";

/// Bytes per RGBA frame at the given size.
const fn frame_bytes(width: u32, height: u32) -> usize { width as usize * height as usize * 4 }

struct Job { id: String, child: Child, temp: PathBuf, output: PathBuf, wav: PathBuf, log: PathBuf, frames: u32, expected: u32, width: u32, height: u32 }
#[derive(Default)]
pub struct RenderState { job: Mutex<Option<Job>> }
#[derive(Serialize)]
pub struct RenderStart { id: String, output: String }

fn cleanup(job: &Job) { for path in [&job.temp, &job.wav, &job.log] { let _ = fs::remove_file(path); } }
pub fn shutdown(state: &RenderState) {
    if let Ok(mut slot) = state.job.lock() {
        if let Some(mut job) = slot.take() { let _ = job.child.kill(); let _ = job.child.wait(); cleanup(&job); }
    }
}
impl Drop for RenderState {
    fn drop(&mut self) {
        if let Ok(slot) = self.job.get_mut() { if let Some(mut job) = slot.take() { let _ = job.child.kill(); let _ = job.child.wait(); cleanup(&job); } }
    }
}

#[tauri::command]
pub async fn begin_render(app: AppHandle, frames: u32, width: u32, height: u32, pcm: Option<Vec<f32>>) -> Result<Option<RenderStart>, String> {
    if frames == 0 || frames > 18000 { return Err("Render duration must be between one frame and ten minutes.".into()); }
    if width == 0 || height == 0 || width > 8192 || height > 8192 { return Err("Invalid render dimensions".into()); }
    // yuv420p (libx264's output here) subsamples chroma, so odd dimensions fail deep
    // inside FFmpeg with an opaque message. Reject them before spawning.
    if width % 2 != 0 || height % 2 != 0 { return Err("Render dimensions must be even.".into()); }
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<RenderState>();
        let mut slot = state.job.lock().map_err(|e| e.to_string())?;
        if slot.is_some() { return Err("Another render is already running.".into()); }
        let picked = app.dialog().file().add_filter("MP4 video", &["mp4"]).set_file_name("clipflow-916.mp4").blocking_save_file();
        let Some(picked) = picked else { return Ok(None); };
        let output = picked.into_path().map_err(|e| e.to_string())?;
        let id = uuid::Uuid::new_v4().to_string();
        let temp = output.with_file_name(format!(".clipflow-{}.mp4", id));
        let wav = output.with_file_name(format!(".clipflow-{}.wav", id));
        let log = output.with_file_name(format!(".clipflow-{}.log", id));
        let ffmpeg = app.path().resource_dir().map_err(|e| e.to_string())?.join("ffmpeg.exe");
        if !ffmpeg.exists() { return Err("Bundled FFmpeg is missing. Reinstall Clipflow.".into()); }
        let mut command = Command::new(ffmpeg);
        #[cfg(windows)] command.creation_flags(0x08000000);
        // Raw RGBA frames arrive over IPC already decoded; FFmpeg only converts the
        // pixel format. This replaces the old image2pipe/png input, which made
        // FFmpeg decompress every frame the renderer had just compressed.
        command.args(["-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pixel_format", "rgba", "-video_size"]);
        command.arg(format!("{}x{}", width, height));
        command.args(["-framerate", "30", "-i", "pipe:0"]);
        if let Some(samples) = pcm {
            if samples.len() > 16000 * 600 || samples.iter().any(|n| !n.is_finite()) { return Err("Invalid voice audio".into()); }
            let spec = hound::WavSpec { channels: 1, sample_rate: 16000, bits_per_sample: 16, sample_format: hound::SampleFormat::Int };
            let mut writer = hound::WavWriter::create(&wav, spec).map_err(|e| e.to_string())?;
            for sample in samples { writer.write_sample((sample.clamp(-1.0, 1.0) * 32767.0) as i16).map_err(|e| e.to_string())?; }
            writer.finalize().map_err(|e| e.to_string())?;
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

/// Accept one batch of raw RGBA frames.
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
    const FRAME: usize = 720 * 1280 * 4;

    #[test]
    fn frame_bytes_is_rgba() {
        assert_eq!(frame_bytes(W, H), 3_686_400);
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
}
