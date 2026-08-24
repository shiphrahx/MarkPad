//! Reading and writing files, with the parts that only bite on Windows.
//!
//! This module deals in whole strings and bytes. It does not know what a line
//! ending is: detecting and preserving those belongs to the TypeScript side,
//! and doing it in both places would mean two implementations to keep in step.

use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::thread;
use std::time::Duration;

/// How many times a write is retried before the error is handed to the user.
const WRITE_ATTEMPTS: u32 = 5;

/// Backoff between attempts, in milliseconds. Antivirus scans on Windows
/// usually clear in well under a second; anything slower than this is a real
/// lock rather than a scan, and the user needs telling instead of waiting.
const RETRY_BACKOFF: [u64; 4] = [20, 60, 150, 400];

#[derive(Debug, thiserror::Error)]
pub enum FileError {
    #[error("{path} could not be opened: {source}")]
    Read {
        path: String,
        #[source]
        source: io::Error,
    },

    #[error("{path} is not valid UTF-8. MarkPad can only open UTF-8 files.")]
    NotUtf8 { path: String },

    #[error("{path} could not be saved: {source}")]
    Write {
        path: String,
        #[source]
        source: io::Error,
    },

    #[error("{path} is in use by another program, so the file was left unchanged.")]
    Locked { path: String },
}

impl serde::Serialize for FileError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

/// Read a file as text, byte order mark and line endings untouched.
pub fn read_text(path: &Path) -> Result<String, FileError> {
    let bytes = fs::read(path).map_err(|source| FileError::Read {
        path: display(path),
        source,
    })?;

    String::from_utf8(bytes).map_err(|_| FileError::NotUtf8 { path: display(path) })
}

/// Write a file atomically: whole contents to a temporary file alongside the
/// target, flushed to disk, then renamed over it.
///
/// The rename is the point. A half written file is never visible under the
/// real name, so a crash or a power cut costs the save, not the document.
///
/// Windows makes this harder than Unix. The rename fails while anything holds
/// a handle on the target, and on a machine with antivirus that is routinely
/// true for a few hundred milliseconds after the temporary file appears. So
/// the rename gets retried with a short backoff before giving up.
pub fn write_text_atomic(path: &Path, contents: &str) -> Result<u64, FileError> {
    let directory = path.parent().unwrap_or_else(|| Path::new("."));
    let temporary = temporary_path(path);

    write_all(&temporary, contents.as_bytes()).map_err(|source| FileError::Write {
        path: display(path),
        source,
    })?;

    let mut last: Option<io::Error> = None;
    for attempt in 0..WRITE_ATTEMPTS {
        match fs::rename(&temporary, path) {
            Ok(()) => {
                // Ask the directory itself to reach the disk, so the rename
                // survives a power cut and not only a crash. Unix only:
                // Windows has no equivalent and does not need one here.
                #[cfg(unix)]
                let _ = fs::File::open(directory).and_then(|dir| dir.sync_all());
                let _ = directory;

                return Ok(contents.len() as u64);
            }
            Err(error) => {
                last = Some(error);
                if let Some(pause) = RETRY_BACKOFF.get(attempt as usize) {
                    thread::sleep(Duration::from_millis(*pause));
                }
            }
        }
    }

    // The buffer is still in the editor and the target file is untouched, so
    // the worst case is the user being told to close whatever holds the file.
    let _ = fs::remove_file(&temporary);

    match last {
        Some(error) if is_locked(&error) => Err(FileError::Locked { path: display(path) }),
        Some(error) => Err(FileError::Write {
            path: display(path),
            source: error,
        }),
        None => unreachable!("the retry loop records an error before giving up"),
    }
}

fn write_all(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let mut file = fs::File::create(path)?;
    file.write_all(bytes)?;
    file.sync_all()
}

/// Sit the temporary file next to the target so the rename stays on one
/// volume. A rename across volumes is a copy, which is not atomic.
fn temporary_path(path: &Path) -> PathBuf {
    let name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| "markpad".to_owned());

    let directory = path.parent().unwrap_or_else(|| Path::new("."));
    directory.join(format!(".{name}.markpad-{}.tmp", std::process::id()))
}

fn is_locked(error: &io::Error) -> bool {
    matches!(
        error.kind(),
        io::ErrorKind::PermissionDenied | io::ErrorKind::AlreadyExists
    )
}

fn display(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_file_back_exactly() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("notes.md");
        fs::write(&path, "one\r\ntwo\r\n").unwrap();

        assert_eq!(read_text(&path).unwrap(), "one\r\ntwo\r\n");
    }

    #[test]
    fn keeps_the_byte_order_mark() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("notes.md");
        fs::write(&path, "\u{feff}# Title\n").unwrap();

        assert_eq!(read_text(&path).unwrap(), "\u{feff}# Title\n");
    }

    #[test]
    fn refuses_a_file_that_is_not_utf8() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("notes.md");
        fs::write(&path, [0xff, 0xfe, 0x00]).unwrap();

        let error = read_text(&path).unwrap_err();
        assert!(matches!(error, FileError::NotUtf8 { .. }));
    }

    #[test]
    fn reports_a_missing_file_by_name() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("missing.md");

        let error = read_text(&path).unwrap_err();
        assert!(error.to_string().contains("missing.md"));
    }

    #[test]
    fn writes_a_new_file() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("notes.md");

        let written = write_text_atomic(&path, "hello\n").unwrap();

        assert_eq!(written, 6);
        assert_eq!(fs::read_to_string(&path).unwrap(), "hello\n");
    }

    #[test]
    fn overwrites_an_existing_file() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("notes.md");
        fs::write(&path, "old contents, rather longer than the new ones\n").unwrap();

        write_text_atomic(&path, "new\n").unwrap();

        assert_eq!(fs::read_to_string(&path).unwrap(), "new\n");
    }

    #[test]
    fn leaves_no_temporary_files_behind() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("notes.md");

        write_text_atomic(&path, "hello\n").unwrap();

        let left: Vec<_> = fs::read_dir(directory.path())
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(left, vec!["notes.md".to_owned()]);
    }

    #[test]
    fn round_trips_crlf_and_a_byte_order_mark() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("notes.md");
        let original = "\u{feff}one\r\ntwo\r\n";

        write_text_atomic(&path, original).unwrap();

        assert_eq!(read_text(&path).unwrap(), original);
    }

    #[test]
    fn counts_bytes_rather_than_characters() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("notes.md");

        let written = write_text_atomic(&path, "caf\u{e9}\n").unwrap();

        assert_eq!(written, 6);
    }
}
