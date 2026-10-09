mod chrome;
mod dialogs;
mod files;
mod opening;
#[cfg(windows)]
mod webview2;

use std::path::PathBuf;

use tauri::Manager;

pub use files::FileError;

/// Read a file as text. The byte order mark and the line endings come back
/// exactly as they were on disk; the editor decides what to do with them.
#[tauri::command]
fn read_text_file(path: String) -> Result<String, FileError> {
    files::read_text(&PathBuf::from(path))
}

/// Write a file atomically, retrying while Windows has it locked.
///
/// Returns the number of bytes written, which the status bar shows as the
/// file size.
#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<u64, FileError> {
    files::write_text_atomic(&PathBuf::from(path), &contents)
}

/// Let the webview load images out of one folder.
///
/// The asset protocol starts with nothing allowed at all. Opening a file widens
/// it to that file's own folder, so a note can show the picture sitting next to
/// it and cannot reach anything the user has not opened. Not recursive, for the
/// same reason.
///
/// Without this, every image in every Markdown file is a broken image, which is
/// a strange thing for a Markdown editor to be.
#[tauri::command]
fn allow_images_in(app: tauri::AppHandle, directory: String) -> Result<(), String> {
    app.asset_protocol_scope()
        .allow_directory(PathBuf::from(directory), false)
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Windows without WebView2 would otherwise open a window with nothing in
    // it and no explanation. Checked before the window exists, so there is
    // never a blank one on screen.
    #[cfg(windows)]
    if !webview2::is_available() {
        webview2::offer_the_bootstrapper();
        return;
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(opening::Arrivals::default())
        .on_window_event(|window, event| {
            // Handled here rather than in the page, so a dropped file arrives
            // the same way as every other file that comes from outside.
            if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
                opening::dropped(window.app_handle(), paths);
            }
        })
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            write_text_file,
            opening::startup_files,
            allow_images_in,
            dialogs::pick_files_to_open,
            dialogs::pick_path_to_save,
            chrome::set_caption_colors
        ])
        .run(tauri::generate_context!())
        .expect("MarkPad could not start.");
}
