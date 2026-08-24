mod files;

use std::path::PathBuf;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![read_text_file, write_text_file])
        .run(tauri::generate_context!())
        .expect("MarkPad could not start.");
}
