use serde_json::Value;
use std::{fs, path::{Path, PathBuf}, process::Command};
use tauri::{Manager, AppHandle};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_dialog::MessageDialogButtons;

/// Replace a project manifest without relying on Windows rename-over-existing
/// semantics. The old manifest is moved to a unique sibling backup first and
/// restored if committing the new file fails.
fn replace_manifest(manifest: &Path, contents: &[u8]) -> Result<(), String> {
    if manifest.exists() && !manifest.is_file() {
        return Err("The selected project path is not a file.".into());
    }

    let id = uuid::Uuid::new_v4();
    let name = manifest.file_name().and_then(|s| s.to_str()).unwrap_or("project.clipflow");
    let temp = manifest.with_file_name(format!(".{name}.{id}.tmp"));
    let backup = manifest.with_file_name(format!(".{name}.{id}.bak"));

    fs::write(&temp, contents).map_err(|e| {
        let _ = fs::remove_file(&temp);
        format!("Could not write temporary project: {e}")
    })?;

    let had_previous = manifest.exists();
    if had_previous {
        if let Err(error) = fs::rename(manifest, &backup) {
            let _ = fs::remove_file(&temp);
            return Err(format!("Could not preserve the existing project: {error}"));
        }
    }

    if let Err(error) = fs::rename(&temp, manifest) {
        let restore_error = if had_previous {
            fs::rename(&backup, manifest).err()
        } else {
            None
        };
        let _ = fs::remove_file(&temp);
        return Err(match restore_error {
            Some(restore) => format!(
                "Could not save the new project ({error}); restoring the previous project also failed ({restore}). The backup remains at {}.",
                backup.display()
            ),
            None => format!("Could not commit the new project: {error}"),
        });
    }

    if had_previous {
        // The new manifest is committed. A stale backup is preferable to
        // reporting failure after a successful save, so cleanup is best-effort.
        let _ = fs::remove_file(&backup);
    }
    Ok(())
}

#[tauri::command]
pub async fn confirm_discard(app: AppHandle, message: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || app.dialog().message(message).title("Clipflow").buttons(MessageDialogButtons::YesNo).blocking_show()).await.map_err(|e| e.to_string())
}

fn allow(app: &AppHandle, path: &Path) -> Result<(), String> {
    app.asset_protocol_scope().allow_file(path).map_err(|e| e.to_string())
}

fn media_kind(path: &Path) -> Result<&'static str, String> {
    match path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase().as_str() {
        "mp4" | "mov" | "webm" | "m4v" => Ok("video"),
        "png" | "jpg" | "jpeg" | "webp" | "gif" => Ok("image"),
        _ => Err("Choose an MP4, MOV, WebM, PNG, JPEG or WebP file.".into())
    }
}

#[tauri::command]
pub async fn import_media(app: AppHandle) -> Result<Option<Value>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let picked = app.dialog().file().add_filter("Images and videos", &["mp4", "mov", "webm", "m4v", "png", "jpg", "jpeg", "webp", "gif"]).blocking_pick_file();
        let Some(picked) = picked else { return Ok(None); };
        let original = picked.into_path().map_err(|e| e.to_string())?;
        let kind = media_kind(&original)?;
        let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("imports");
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let id = uuid::Uuid::new_v4().to_string();
        let target = dir.join(format!("{}.{}", id, original.extension().unwrap().to_string_lossy()));
        fs::copy(&original, &target).map_err(|e| e.to_string())?;
        allow(&app, &target)?;
        Ok(Some(serde_json::json!({"kind":"native", "id":id, "path":target, "mediaKind":kind, "name":original.file_name().unwrap().to_string_lossy(), "source":original.to_string_lossy()})))
    }).await.map_err(|e| e.to_string())?
}

fn hydrate(app: &AppHandle, manifest: &Path, data: &mut Value) -> Result<(), String> {
    if data["version"] != 1 { return Err("This project version is not supported.".into()); }
    let scenes = data["sceneChoices"].as_array_mut().ok_or("Project has no scene plan")?;
    if scenes.len() != 5 { return Err("A Clipflow project must contain five scenes.".into()); }
    for scene in scenes {
        if scene["kind"] == "native" {
            let stored = scene["path"].as_str().ok_or("Imported media has no path")?;
            let path = manifest.parent().unwrap().join(stored).canonicalize().map_err(|_| format!("Missing imported media: {}", stored))?;
            let root = manifest.parent().unwrap().canonicalize().map_err(|e| e.to_string())?;
            if !path.starts_with(&root) { return Err("Project media must be inside the project folder.".into()); }
            allow(app, &path)?;
            scene["path"] = Value::String(path.to_string_lossy().into());
        }
    }
    Ok(())
}

#[tauri::command]
pub fn initial_project(app: AppHandle) -> Result<Option<Value>, String> {
    let Some(arg) = std::env::args().nth(1) else { return Ok(None); };
    let manifest = PathBuf::from(arg);
    if manifest.extension().and_then(|s| s.to_str()) != Some("clipflow") { return Ok(None); }
    let mut project: Value = serde_json::from_slice(&fs::read(&manifest).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    hydrate(&app, &manifest, &mut project)?;
    Ok(Some(serde_json::json!({"path":manifest,"project":project})))
}

#[tauri::command]
pub async fn save_project(app: AppHandle, mut project: Value) -> Result<Option<Value>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if project["version"] != 1 { return Err("Unsupported project format".into()); }
        let picked = app.dialog().file().add_filter("Clipflow project", &["clipflow"]).set_file_name("Untitled.clipflow").blocking_save_file();
        let Some(picked) = picked else { return Ok(None); };
        let manifest = picked.into_path().map_err(|e| e.to_string())?;
        let parent = manifest.parent().ok_or("Invalid project folder")?;
        let assets_name = format!("{}.assets", manifest.file_stem().unwrap().to_string_lossy());
        let assets = parent.join(&assets_name);
        fs::create_dir_all(&assets).map_err(|e| e.to_string())?;
        for scene in project["sceneChoices"].as_array_mut().ok_or("No scene plan")? {
            if scene["kind"] == "upload" { return Err("Import this image with the native Import media button before saving.".into()); }
            if scene["kind"] == "native" {
                let source = PathBuf::from(scene["path"].as_str().ok_or("Media has no path")?);
                let id = scene["id"].as_str().ok_or("Media has no ID")?;
                if !id.chars().all(|c| c.is_ascii_hexdigit() || c == '-') { return Err("Invalid media ID".into()); }
                let name = format!("{}.{}", id, source.extension().and_then(|e| e.to_str()).unwrap_or("mp4"));
                let target = assets.join(&name);
                let same_file = source.canonicalize().ok().zip(target.canonicalize().ok()).is_some_and(|(a,b)| a == b);
                if !same_file { fs::copy(&source, &target).map_err(|e| e.to_string())?; }
                scene["path"] = Value::String(format!("{}/{}", assets_name, name));
            }
        }
        let serialized = serde_json::to_vec_pretty(&project).map_err(|e| e.to_string())?;
        replace_manifest(&manifest, &serialized)?;
        hydrate(&app, &manifest, &mut project)?;
        Ok(Some(serde_json::json!({"path":manifest,"project":project})))
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn open_project(app: AppHandle) -> Result<Option<Value>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let picked = app.dialog().file().add_filter("Clipflow project", &["clipflow"]).blocking_pick_file();
        let Some(picked) = picked else { return Ok(None); };
        let manifest = picked.into_path().map_err(|e| e.to_string())?;
        let mut project: Value = serde_json::from_slice(&fs::read(&manifest).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        hydrate(&app, &manifest, &mut project)?;
        Ok(Some(serde_json::json!({"path":manifest,"project":project})))
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn show_in_folder(path: String) -> Result<(), String> {
    let path = PathBuf::from(path).canonicalize().map_err(|e| e.to_string())?;
    Command::new("explorer.exe").arg(format!("/select,{}", path.display())).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::replace_manifest;
    use std::{fs, path::PathBuf};

    fn temp_project_path() -> PathBuf {
        std::env::temp_dir().join(format!("clipflow-test-{}.clipflow", uuid::Uuid::new_v4()))
    }

    #[test]
    fn creates_a_new_manifest() {
        let path = temp_project_path();
        replace_manifest(&path, br#"{"version":1,"idea":"first"}"#).unwrap();
        assert_eq!(fs::read(&path).unwrap(), br#"{"version":1,"idea":"first"}"#);
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn replaces_an_existing_manifest_and_cleans_backup() {
        let path = temp_project_path();
        fs::write(&path, br#"{"version":1,"idea":"old"}"#).unwrap();

        replace_manifest(&path, br#"{"version":1,"idea":"updated"}"#).unwrap();

        assert_eq!(fs::read(&path).unwrap(), br#"{"version":1,"idea":"updated"}"#);
        let parent = path.parent().unwrap();
        let prefix = format!(".{}.", path.file_name().unwrap().to_string_lossy());
        assert!(!fs::read_dir(parent).unwrap().filter_map(Result::ok).any(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            name.starts_with(&prefix) && (name.ends_with(".bak") || name.ends_with(".tmp"))
        }));
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn refuses_to_replace_a_directory() {
        let path = temp_project_path();
        fs::create_dir(&path).unwrap();
        assert!(replace_manifest(&path, b"{}").is_err());
        fs::remove_dir(path).unwrap();
    }
}
