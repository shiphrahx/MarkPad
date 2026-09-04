mod chrome;
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
    files_from_arguments(std::env::args().skip(1))
}

/// Which of the arguments name a file that is really there.
///
/// Split out from the command so it can be tested. Reading `env::args` is the
/// only reason the whole thing was untestable, and this is the path every
/// "Open with MarkPad" and every double-clicked file arrives through on all
/// three platforms.
fn files_from_arguments<I: IntoIterator<Item = String>>(arguments: I) -> Vec<String> {
    arguments
        .into_iter()
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
            startup_files,
            chrome::set_caption_colors
        ])
        .run(tauri::generate_context!())
        .expect("MarkPad could not start.");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn arguments(items: &[&std::path::Path]) -> Vec<String> {
        items
            .iter()
            .map(|path| path.to_string_lossy().into_owned())
            .collect()
    }

    #[test]
    fn keeps_the_files_that_exist() {
        let directory = tempfile::tempdir().unwrap();
        let one = directory.path().join("one.md");
        let two = directory.path().join("two.md");
        std::fs::write(&one, "one").unwrap();
        std::fs::write(&two, "two").unwrap();

        let opened = files_from_arguments(arguments(&[&one, &two]));

        assert_eq!(opened.len(), 2);
        assert!(opened[0].ends_with("one.md"));
        assert!(opened[1].ends_with("two.md"));
    }

    /// Opening a path that isn't there would give the user an empty buffer
    /// named after a file they never had, which is worse than opening nothing.
    #[test]
    fn drops_a_path_that_is_not_there() {
        let directory = tempfile::tempdir().unwrap();
        let missing = directory.path().join("gone.md");

        assert!(files_from_arguments(arguments(&[&missing])).is_empty());
    }

    #[test]
    fn drops_a_directory() {
        let directory = tempfile::tempdir().unwrap();

        assert!(files_from_arguments(arguments(&[directory.path()])).is_empty());
    }

    #[test]
    fn drops_anything_that_looks_like_a_flag() {
        let flags = vec!["--help".to_owned(), "-v".to_owned()];

        assert!(files_from_arguments(flags).is_empty());
    }

    #[test]
    fn keeps_the_real_file_out_of_a_mixed_command_line() {
        let directory = tempfile::tempdir().unwrap();
        let note = directory.path().join("notes.md");
        std::fs::write(&note, "hello").unwrap();

        let mixed = vec![
            "--devtools".to_owned(),
            note.to_string_lossy().into_owned(),
            directory
                .path()
                .join("missing.md")
                .to_string_lossy()
                .into_owned(),
        ];

        let opened = files_from_arguments(mixed);

        assert_eq!(opened.len(), 1);
        assert!(opened[0].ends_with("notes.md"));
    }

    #[test]
    fn opens_nothing_when_there_are_no_arguments() {
        assert!(files_from_arguments(Vec::new()).is_empty());
    }
}
