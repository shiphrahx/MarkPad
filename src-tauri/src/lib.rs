mod files;
#[cfg(windows)]
mod webview2;

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

/// Paths passed on the command line.
///
/// This is how "Open with MarkPad" and double-clicking a `.md` file arrive.
/// Anything that is not a file that exists is dropped rather than opened as an
/// empty buffer with a nonsense name.
#[tauri::command]
fn startup_files() -> Vec<String> {
    std::env::args()
        .skip(1)
        .filter(|argument| !argument.starts_with('-'))
        .filter(|argument| PathBuf::from(argument).is_file())
        .collect()
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
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            write_text_file,
            startup_files
        ])
        .run(tauri::generate_context!())
        .expect("MarkPad could not start.");
}
