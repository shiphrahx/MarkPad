//! Which files were open last time, kept in a small JSON file in the app's
//! config folder.
//!
//! It used to live in the page's localStorage. It moved here because the page
//! is only allowed to open files the user picked, and a list the page could
//! write for itself and have reopened on the next launch would have been the
//! way round that. Only paths the user really opened get written.
//!
//! Paths only, never contents. Deleting this file costs you your tabs and
//! nothing else, which is the promise.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::access::Access;

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Session {
    pub paths: Vec<String>,
    /// Index into `paths` of the tab that was in front.
    pub active: usize,
}

const FILE_NAME: &str = "session.json";

/// Last time's session, or an empty one if there is none or it is unreadable.
pub fn read(file: &Path) -> Session {
    fs::read_to_string(file)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

/// Write the session, or remove the file when nothing is open.
pub fn write(file: &Path, session: &Session) -> std::io::Result<()> {
    if session.paths.is_empty() {
        return match fs::remove_file(file) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            other => other,
        };
    }

    if let Some(directory) = file.parent() {
        fs::create_dir_all(directory)?;
    }

    let text = serde_json::to_string(session).map_err(std::io::Error::other)?;
    crate::files::write_text_atomic(file, &text)
        .map(|_| ())
        .map_err(std::io::Error::other)
}

pub fn location(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join(FILE_NAME))
}

/// Last time's tabs. Every path in it was given to the app last time, so it
/// is given again now.
#[tauri::command]
pub fn load_session(app: tauri::AppHandle, access: tauri::State<'_, Access>) -> Session {
    let session = location(&app).map(|file| read(&file)).unwrap_or_default();
    access.grant_all(&session.paths);
    session
}

/// Remember the tabs. Anything the user did not give the app is dropped
/// first, so the page cannot launder a path through the session file.
#[tauri::command]
pub fn save_session(
    app: tauri::AppHandle,
    access: tauri::State<'_, Access>,
    session: Session,
) -> Result<(), String> {
    let file = location(&app).ok_or("MarkPad has no config folder to keep its tabs in.")?;
    write(&file, &only_given(&access, session)).map_err(|error| error.to_string())
}

fn only_given(access: &Access, session: Session) -> Session {
    let front = session.paths.get(session.active).cloned();
    let paths: Vec<String> = session
        .paths
        .into_iter()
        .filter(|path| access.is_granted(Path::new(path)))
        .collect();
    let active = front
        .and_then(|front| paths.iter().position(|path| *path == front))
        .unwrap_or(0);

    Session { paths, active }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_back_what_it_wrote() {
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("nested").join(FILE_NAME);
        let session = Session {
            paths: vec!["C:/a.md".into(), "C:/b.md".into()],
            active: 1,
        };

        write(&file, &session).unwrap();

        assert_eq!(read(&file), session);
    }

    #[test]
    fn removes_the_file_when_nothing_is_open() {
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join(FILE_NAME);
        write(
            &file,
            &Session {
                paths: vec!["a.md".into()],
                active: 0,
            },
        )
        .unwrap();

        write(&file, &Session::default()).unwrap();

        assert!(!file.exists());
    }

    #[test]
    fn forgetting_a_session_that_was_never_written_is_fine() {
        let directory = tempfile::tempdir().unwrap();

        write(&directory.path().join(FILE_NAME), &Session::default()).unwrap();
    }

    #[test]
    fn drops_paths_the_user_never_gave_the_app() {
        let directory = tempfile::tempdir().unwrap();
        let given = directory.path().join("given.md");
        let other = directory.path().join("other.md");
        fs::write(&given, "x").unwrap();
        fs::write(&other, "x").unwrap();
        let access = Access::default();
        access.grant(&given);

        let kept = only_given(
            &access,
            Session {
                paths: vec![
                    other.to_string_lossy().into_owned(),
                    given.to_string_lossy().into_owned(),
                ],
                active: 1,
            },
        );

        assert_eq!(kept.paths, vec![given.to_string_lossy().into_owned()]);
        assert_eq!(
            kept.active, 0,
            "the front tab should still be the front tab"
        );
    }

    #[test]
    fn treats_a_damaged_file_as_no_session() {
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join(FILE_NAME);
        fs::write(&file, "{ not json").unwrap();

        assert_eq!(read(&file), Session::default());
    }
}
