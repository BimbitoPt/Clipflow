#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod projects;
mod render;

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(render::RenderState::default())
        .invoke_handler(tauri::generate_handler![
            projects::save_project, projects::open_project, projects::initial_project, projects::confirm_discard, projects::import_media,
            projects::show_in_folder, render::begin_render, render::render_frame,
            render::finish_render, render::cancel_render
        ])
        .build(tauri::generate_context!())
        .expect("Could not start Clipflow desktop");
    app.run(|handle, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            use tauri::Manager;
            render::shutdown(&handle.state::<render::RenderState>());
        }
    });
}
