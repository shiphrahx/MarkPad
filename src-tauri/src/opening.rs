//! Files arriving from outside the window: the command line, a drop, and later
//! the operating system handing us one.
//!
//! Every route ends in the same event, `open-files`, so the page has one
//! listener rather than one per route. The catch is timing. A file can arrive
//! before the page has finished loading and started listening, so anything
//! that turns up early waits in a queue until the page asks for it.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::{Emitter, Manager};

use crate::dialogs::MARKDOWN_EXTENSIONS;

/// The event the page listens for. Its payload is a list of paths.
pub const OPEN_FILES: &str = "open-files";

#[derive(Default)]
pub struct Arrivals {
    inner: Mutex<Queue>,
}

#[derive(Default)]
struct Queue {
    /// Whether the page has asked for its startup files yet. Until it has, it
    /// is not listening and an emitted event would be lost.
    listening: bool,
    waiting: Vec<String>,
}

/// Hand some paths to the page, or hold them until it is listening.
pub fn deliver(app: &tauri::AppHandle, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }

    let arrivals = app.state::<Arrivals>();
    let mut queue = arrivals.inner.lock().unwrap_or_else(|e| e.into_inner());

    if queue.listening {
        drop(queue);
        let _ = app.emit(OPEN_FILES, paths);
    } else {
        queue.waiting.extend(paths);
    }
}

/// Paths passed on the command line, plus anything that arrived early.
///
/// This is how "Open with MarkPad" and double-clicking a `.md` file arrive.
/// Calling it is also the page saying it is now listening, so it must only be
/// called once the `open-files` listener is in place.
#[tauri::command]
pub fn startup_files(arrivals: tauri::State<'_, Arrivals>) -> Vec<String> {
    let mut queue = arrivals.inner.lock().unwrap_or_else(|e| e.into_inner());
    queue.listening = true;

    let mut paths = files_from_arguments(std::env::args().skip(1), None);
    paths.append(&mut queue.waiting);
    paths
}

/// Files dropped on the window. Only the ones that look like Markdown.
pub fn dropped(app: &tauri::AppHandle, paths: &[PathBuf]) {
    let markdown = paths
        .iter()
        .filter(|path| looks_like_markdown(path))
        .map(|path| path.to_string_lossy().into_owned())
        .collect();

    deliver(app, markdown);
}

fn looks_like_markdown(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            MARKDOWN_EXTENSIONS
                .iter()
                .any(|wanted| wanted.eq_ignore_ascii_case(extension))
        })
}

/// Which of the arguments name a file that is really there.
///
/// Anything that is not a file that exists is dropped rather than opened as
/// an empty buffer with a nonsense name. A relative path is read against
/// `directory` when there is one, which is what a second launch from a
/// terminal needs: its working directory is not ours.
pub fn files_from_arguments<I: IntoIterator<Item = String>>(
    arguments: I,
    directory: Option<&Path>,
) -> Vec<String> {
    arguments
        .into_iter()
        .filter(|argument| !argument.starts_with('-'))
        .map(|argument| match directory {
            Some(directory) => directory.join(argument),
            None => PathBuf::from(argument),
        })
        .filter(|path| path.is_file())
        .map(|path| path.to_string_lossy().into_owned())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn arguments(items: &[&Path]) -> Vec<String> {
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

        let opened = files_from_arguments(arguments(&[&one, &two]), None);

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

        assert!(files_from_arguments(arguments(&[&missing]), None).is_empty());
    }

    #[test]
    fn drops_a_directory() {
        let directory = tempfile::tempdir().unwrap();

        assert!(files_from_arguments(arguments(&[directory.path()]), None).is_empty());
    }

    #[test]
    fn drops_anything_that_looks_like_a_flag() {
        let flags = vec!["--help".to_owned(), "-v".to_owned()];

        assert!(files_from_arguments(flags, None).is_empty());
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

        let opened = files_from_arguments(mixed, None);

        assert_eq!(opened.len(), 1);
        assert!(opened[0].ends_with("notes.md"));
    }

    #[test]
    fn opens_nothing_when_there_are_no_arguments() {
        assert!(files_from_arguments(Vec::new(), None).is_empty());
    }

    #[test]
    fn reads_a_relative_path_against_the_directory_given() {
        let directory = tempfile::tempdir().unwrap();
        std::fs::write(directory.path().join("notes.md"), "hello").unwrap();

        let opened = files_from_arguments(vec!["notes.md".to_owned()], Some(directory.path()));

        assert_eq!(opened.len(), 1);
        assert!(Path::new(&opened[0]).is_absolute());
    }

    #[test]
    fn knows_markdown_by_its_extension() {
        assert!(looks_like_markdown(Path::new("notes.md")));
        assert!(looks_like_markdown(Path::new("NOTES.MARKDOWN")));
        assert!(looks_like_markdown(Path::new("list.txt")));
        assert!(!looks_like_markdown(Path::new("photo.png")));
        assert!(!looks_like_markdown(Path::new("README")));
    }
}
