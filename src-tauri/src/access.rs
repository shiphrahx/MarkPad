//! Which files the page is allowed to read and write.
//!
//! Only the ones the user gave it: picked in a dialog, dropped on the window,
//! named on the command line, or reopened from last time's session (which only
//! ever holds paths that got here one of those ways).
//!
//! Before this, the read and write commands took any path at all. The page
//! renders Markdown from files people download, and the content security
//! policy was the only thing between a bug in that rendering and every file in
//! the user's home folder. This is the second thing.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Default)]
pub struct Access {
    granted: Mutex<HashSet<PathBuf>>,
}

impl Access {
    pub fn grant(&self, path: &Path) {
        if let Some(key) = key(path) {
            self.lock().insert(key);
        }
    }

    pub fn grant_all<'a, I: IntoIterator<Item = &'a String>>(&self, paths: I) {
        for path in paths {
            self.grant(Path::new(path));
        }
    }

    pub fn is_granted(&self, path: &Path) -> bool {
        key(path).is_some_and(|key| self.lock().contains(&key))
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, HashSet<PathBuf>> {
        // A panic while holding this lock leaves a set of paths, which is
        // still a perfectly good set of paths.
        self.granted.lock().unwrap_or_else(|e| e.into_inner())
    }
}

/// One spelling per file, so `C:\notes.md`, `c:/notes.md` and a symlink to it
/// all count as the same thing.
///
/// A file that does not exist yet, which is what a save dialog hands back,
/// cannot be canonicalised, so its folder is instead and the name goes back on
/// the end. Relative paths are refused outright: nothing legitimate sends one.
fn key(path: &Path) -> Option<PathBuf> {
    if !path.is_absolute() {
        return None;
    }

    if let Ok(real) = std::fs::canonicalize(path) {
        return Some(real);
    }

    let name = path.file_name()?;
    let folder = std::fs::canonicalize(path.parent()?).ok()?;
    Some(folder.join(name))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_what_was_never_granted() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("notes.md");
        std::fs::write(&path, "x").unwrap();

        assert!(!Access::default().is_granted(&path));
    }

    #[test]
    fn allows_what_was_granted() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("notes.md");
        std::fs::write(&path, "x").unwrap();
        let access = Access::default();

        access.grant(&path);

        assert!(access.is_granted(&path));
    }

    #[test]
    fn granting_a_file_does_not_grant_its_neighbours() {
        let directory = tempfile::tempdir().unwrap();
        let notes = directory.path().join("notes.md");
        let secret = directory.path().join("secret.txt");
        std::fs::write(&notes, "x").unwrap();
        std::fs::write(&secret, "x").unwrap();
        let access = Access::default();

        access.grant(&notes);

        assert!(!access.is_granted(&secret));
    }

    #[test]
    fn a_file_from_the_save_dialog_stays_granted_once_it_exists() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("new.md");
        let access = Access::default();

        access.grant(&path);
        std::fs::write(&path, "x").unwrap();

        assert!(access.is_granted(&path));
    }

    #[test]
    fn sees_through_a_dot_dot() {
        let directory = tempfile::tempdir().unwrap();
        std::fs::create_dir(directory.path().join("sub")).unwrap();
        let path = directory.path().join("notes.md");
        std::fs::write(&path, "x").unwrap();
        let access = Access::default();

        access.grant(&path);

        assert!(access.is_granted(&directory.path().join("sub").join("..").join("notes.md")));
    }

    #[test]
    fn refuses_a_relative_path() {
        let access = Access::default();
        access.grant(Path::new("notes.md"));

        assert!(!access.is_granted(Path::new("notes.md")));
    }

    #[cfg(unix)]
    #[test]
    fn a_symlink_and_its_target_are_the_same_file() {
        let directory = tempfile::tempdir().unwrap();
        let real = directory.path().join("real.md");
        let link = directory.path().join("link.md");
        std::fs::write(&real, "x").unwrap();
        std::os::unix::fs::symlink(&real, &link).unwrap();
        let access = Access::default();

        access.grant(&link);

        assert!(access.is_granted(&real));
    }
}
