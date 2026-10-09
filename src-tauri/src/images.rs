//! Serving the pictures a Markdown file points at, and nothing else.
//!
//! This replaced Tauri's asset protocol. That one was scoped by folder: opening
//! a file allowed its folder, not recursively. Which meant `images/chart.png`,
//! the most common layout there is, never loaded, and neither did
//! `../assets/chart.png`. Allowing whole trees recursively would have fixed
//! that by letting the page read any file under wherever you opened a note,
//! home folder included.
//!
//! So the question changed from "which folders" to "which kinds of file". This
//! protocol hands back images and refuses everything else, from anywhere. A
//! document can show you a picture on your own disk. It cannot read your SSH
//! keys, whatever it puts in a `src`. `docs/decisions/0007-image-protocol.md`
//! has the rest.

use std::path::{Path, PathBuf};

use tauri::http::{header, Request, Response, StatusCode};

/// The scheme the page asks for. `convertFileSrc(path, SCHEME)` builds URLs.
pub const SCHEME: &str = "markpad-image";

/// Larger than any picture anybody puts in a note, and small enough that a
/// path to something enormous with a `.png` on the end is not read into memory.
const LARGEST: u64 = 64 * 1024 * 1024;

/// Answer one request. Runs off the main thread: see `lib.rs`.
pub fn respond(request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    match find(request.uri().path()) {
        Ok((path, kind)) => match std::fs::read(&path) {
            Ok(bytes) => Response::builder()
                .header(header::CONTENT_TYPE, kind)
                .body(bytes)
                .unwrap_or_else(|_| refuse(StatusCode::INTERNAL_SERVER_ERROR)),
            Err(_) => refuse(StatusCode::NOT_FOUND),
        },
        Err(status) => refuse(status),
    }
}

/// Which file a request means, and its content type, or why not.
fn find(uri_path: &str) -> Result<(PathBuf, &'static str), StatusCode> {
    // convertFileSrc percent-encodes the whole path as one segment, so the
    // URL path is a slash and then the encoded file path.
    let encoded = uri_path.strip_prefix('/').unwrap_or(uri_path);
    let decoded = percent_encoding::percent_decode_str(encoded)
        .decode_utf8()
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    let path = PathBuf::from(decoded.as_ref());

    if !path.is_absolute() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let kind = content_type(&path).ok_or(StatusCode::FORBIDDEN)?;

    // Checked on the real file, so a link called `photo.png` pointing at
    // something that is not a picture is judged by what it points at.
    let real = std::fs::canonicalize(&path).map_err(|_| StatusCode::NOT_FOUND)?;
    if content_type(&real).is_none() {
        return Err(StatusCode::FORBIDDEN);
    }

    let metadata = std::fs::metadata(&real).map_err(|_| StatusCode::NOT_FOUND)?;
    if !metadata.is_file() {
        return Err(StatusCode::NOT_FOUND);
    }
    if metadata.len() > LARGEST {
        return Err(StatusCode::PAYLOAD_TOO_LARGE);
    }

    Ok((real, kind))
}

fn content_type(path: &Path) -> Option<&'static str> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    Some(match extension.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        // An SVG drawn by an <img> cannot run script, which is the only way
        // this protocol is ever used.
        "svg" => "image/svg+xml",
        _ => return None,
    })
}

fn refuse(status: StatusCode) -> Response<Vec<u8>> {
    let mut response = Response::new(Vec::new());
    *response.status_mut() = status;
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    fn encoded(path: &Path) -> String {
        let text = path.to_string_lossy();
        format!(
            "/{}",
            percent_encoding::utf8_percent_encode(&text, percent_encoding::NON_ALPHANUMERIC)
        )
    }

    #[test]
    fn serves_a_picture() {
        let directory = tempfile::tempdir().unwrap();
        let picture = directory.path().join("chart.png");
        std::fs::write(&picture, b"png").unwrap();

        let (path, kind) = find(&encoded(&picture)).unwrap();

        assert_eq!(std::fs::read(path).unwrap(), b"png");
        assert_eq!(kind, "image/png");
    }

    #[test]
    fn serves_a_picture_in_a_subfolder_or_above() {
        let directory = tempfile::tempdir().unwrap();
        std::fs::create_dir(directory.path().join("images")).unwrap();
        std::fs::create_dir(directory.path().join("notes")).unwrap();
        let picture = directory.path().join("images").join("chart.png");
        std::fs::write(&picture, b"png").unwrap();

        let through_parent = directory
            .path()
            .join("notes")
            .join("..")
            .join("images")
            .join("chart.png");

        assert!(find(&encoded(&through_parent)).is_ok());
    }

    #[test]
    fn refuses_anything_that_is_not_a_picture() {
        let directory = tempfile::tempdir().unwrap();
        let secret = directory.path().join("id_ed25519");
        std::fs::write(&secret, b"key").unwrap();

        assert_eq!(find(&encoded(&secret)), Err(StatusCode::FORBIDDEN));
    }

    #[test]
    fn refuses_a_text_file_whatever_the_case_of_its_name() {
        let directory = tempfile::tempdir().unwrap();
        let notes = directory.path().join("NOTES.MD");
        std::fs::write(&notes, b"x").unwrap();

        assert_eq!(find(&encoded(&notes)), Err(StatusCode::FORBIDDEN));
    }

    #[test]
    fn refuses_a_relative_path() {
        assert_eq!(find("/chart.png"), Err(StatusCode::BAD_REQUEST));
    }

    #[test]
    fn says_not_found_for_a_missing_picture() {
        let directory = tempfile::tempdir().unwrap();

        assert_eq!(
            find(&encoded(&directory.path().join("gone.png"))),
            Err(StatusCode::NOT_FOUND)
        );
    }

    #[test]
    fn refuses_a_folder_named_like_a_picture() {
        let directory = tempfile::tempdir().unwrap();
        let folder = directory.path().join("album.png");
        std::fs::create_dir(&folder).unwrap();

        assert_eq!(find(&encoded(&folder)), Err(StatusCode::NOT_FOUND));
    }

    #[cfg(unix)]
    #[test]
    fn judges_a_link_by_what_it_points_at() {
        let directory = tempfile::tempdir().unwrap();
        let secret = directory.path().join("secret.txt");
        let link = directory.path().join("innocent.png");
        std::fs::write(&secret, b"x").unwrap();
        std::os::unix::fs::symlink(&secret, &link).unwrap();

        assert_eq!(find(&encoded(&link)), Err(StatusCode::FORBIDDEN));
    }
}
