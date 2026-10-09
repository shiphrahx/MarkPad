//! The open and save dialogs, run from Rust rather than from the page.
//!
//! The page could open these itself through the dialog plugin, and used to. It
//! moved here because a path the user picked in a native dialog is the one
//! thing a script in the page cannot fake, so this is where the app finds out
//! which files it has actually been given. See `access.rs`.

use std::path::PathBuf;

use tauri_plugin_dialog::{DialogExt, FilePath};

/// The extensions the dialogs offer, and the ones a dropped file must have.
pub const MARKDOWN_EXTENSIONS: [&str; 5] = ["md", "markdown", "mdown", "mkd", "txt"];

/// The open dialog. Empty when the user cancelled.
///
/// Async on purpose. A synchronous command runs on the main thread, and a
/// blocking dialog there waits for an event loop it is itself holding up.
#[tauri::command]
pub async fn pick_files_to_open(window: tauri::Window) -> Vec<String> {
    let picked = window
        .dialog()
        .file()
        .set_parent(&window)
        .add_filter("Markdown", &MARKDOWN_EXTENSIONS)
        .blocking_pick_files()
        .unwrap_or_default();

    picked.into_iter().filter_map(into_path).map(display).collect()
}

/// The save dialog. None when the user cancelled.
#[tauri::command]
pub async fn pick_path_to_save(window: tauri::Window, suggested_name: String) -> Option<String> {
    let picked = window
        .dialog()
        .file()
        .set_parent(&window)
        .set_file_name(suggested_name)
        .add_filter("Markdown", &MARKDOWN_EXTENSIONS)
        .blocking_save_file()?;

    into_path(picked).map(display)
}

fn into_path(path: FilePath) -> Option<PathBuf> {
    path.into_path().ok()
}

fn display(path: PathBuf) -> String {
    path.to_string_lossy().into_owned()
}
