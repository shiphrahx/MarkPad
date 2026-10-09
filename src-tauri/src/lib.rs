mod access;
mod chrome;
mod dialogs;
mod files;
mod images;
mod links;
mod opening;
mod pasted;
mod session;
#[cfg(windows)]
mod webview2;

use std::path::PathBuf;

use tauri::Manager;

use access::Access;
pub use files::FileError;

/// A file's contents and when it was last changed.
#[derive(serde::Serialize)]
struct TextFile {
    text: String,
    modified: Option<u64>,
}

/// What a save wrote: the size, for the status bar, and the new modified time,
/// so the next save can tell whether anything else has touched the file since.
#[derive(serde::Serialize)]
struct Written {
    bytes: u64,
    modified: Option<u64>,
}

/// Read a file as text. The byte order mark and the line endings come back
/// exactly as they were on disk; the editor decides what to do with them.
///
/// Only a file the user gave the app. See `access.rs`.
#[tauri::command]
fn read_text_file(access: tauri::State<'_, Access>, path: String) -> Result<TextFile, FileError> {
    let path = PathBuf::from(path);
    allowed(&access, &path)?;
    // Taken first. If the file changes between the two, the editor sees an
    // older time than the contents deserve and asks once too often, which is
    // the safe direction to be wrong in.
    let modified = files::modified(&path);
    let text = files::read_text(&path)?;
    Ok(TextFile { text, modified })
}

/// When a file the user gave the app was last changed.
#[tauri::command]
fn file_modified(access: tauri::State<'_, Access>, path: String) -> Result<Option<u64>, FileError> {
    let path = PathBuf::from(path);
    allowed(&access, &path)?;
    Ok(files::modified(&path))
}

/// Write a file atomically, retrying while Windows has it locked.
///
/// Returns the number of bytes written, which the status bar shows as the
/// file size.
#[tauri::command]
fn write_text_file(
    access: tauri::State<'_, Access>,
    path: String,
    contents: String,
) -> Result<Written, FileError> {
    let path = PathBuf::from(path);
    allowed(&access, &path)?;
    let bytes = files::write_text_atomic(&path, &contents)?;
    Ok(Written {
        bytes,
        modified: files::modified(&path),
    })
}

fn allowed(access: &Access, path: &std::path::Path) -> Result<(), FileError> {
    if access.is_granted(path) {
        Ok(())
    } else {
        Err(FileError::NotGiven {
            path: path.to_string_lossy().into_owned(),
        })
    }
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
        // First, as the plugin asks: it has to see a second launch before
        // anything else gets a chance to set up a second window.
        .plugin(tauri_plugin_single_instance::init(
            |app, arguments, directory| {
                opening::second_launch(app, arguments, directory);
            },
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(links::navigation_guard())
        .manage(opening::Arrivals::default())
        .manage(Access::default())
        .register_asynchronous_uri_scheme_protocol(
            images::SCHEME,
            |_context, request, responder| {
                // Reading a picture off disk is not something to do on the thread
                // that draws the window.
                std::thread::spawn(move || responder.respond(images::respond(&request)));
            },
        )
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
            file_modified,
            opening::startup_files,
            session::load_session,
            session::save_session,
            links::open_link,
            pasted::save_pasted_image,
            dialogs::pick_files_to_open,
            dialogs::pick_path_to_save,
            chrome::set_caption_colors
        ])
        .build(tauri::generate_context!())
        .expect("MarkPad could not start.")
        .run(|_app, _event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = &_event {
                opening::opened(_app, urls);
            }
        });
}
