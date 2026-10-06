use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use std::{fs::{self, File}, io::Write, path::PathBuf, process::{Child, Command, Stdio}, sync::Mutex};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
#[cfg(windows)]
use std::os::windows::process::CommandExt;

struct Job { id: String, child: Child, temp: PathBuf, output: PathBuf, wav: PathBuf, log: PathBuf, frames: u32, expected: u32 }
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
pub async fn begin_render(app: AppHandle, frames: u32, pcm: Option<Vec<f32>>) -> Result<Option<RenderStart>, String> {
    if frames == 0 || frames > 18000 { return Err("Render duration must be between one frame and ten minutes.".into()); }
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
        command.args(["-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", "30", "-vcodec", "png", "-i", "pipe:0"]);
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
        *slot = Some(Job { id, child, temp, output, wav, log, frames: 0, expected: frames });
        Ok(Some(result))
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn render_frame(app: AppHandle, id: String, png: String) -> Result<(), String> {
    if png.len() > 8_000_000 { return Err("Frame exceeds the supported size".into()); }
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = STANDARD.decode(png).map_err(|e| e.to_string())?;
        if !bytes.starts_with(b"\x89PNG\r\n\x1a\n") { return Err("Expected a PNG frame".into()); }
        let state = app.state::<RenderState>();
        let mut slot = state.job.lock().map_err(|e| e.to_string())?;
        let job = slot.as_mut().filter(|job| job.id == id).ok_or("Render cancelled")?;
        if job.frames >= job.expected { return Err("Too many render frames".into()); }
        job.child.stdin.as_mut().ok_or("Encoder input closed")?.write_all(&bytes).map_err(|e| format!("Encoder stopped: {}", e))?;
        job.frames += 1;
        Ok(())
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
