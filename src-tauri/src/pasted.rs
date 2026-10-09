//! Saving a pasted picture as a file next to the document it was pasted into.
//!
//! Markdown has nowhere to keep a picture except a file, so pasting one means
//! writing it somewhere and linking to it. Somewhere is an `images` folder
//! beside the document, which is the layout people already use by hand and
//! the one every other Markdown tool reads.
//!
//! The page sends the bytes and the document's path. The document has to be
//! one the user gave the app, the bytes have to really be a picture, and the
//! file is always new: a paste never overwrites anything.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::access::Access;

/// Larger than any screenshot, small enough that a paste of something absurd
/// fails rather than filling the disk.
const LARGEST: usize = 32 * 1024 * 1024;

const FOLDER: &str = "images";

/// The command. The body is the picture's bytes; the document's path comes
/// in a header, percent-encoded, because a body can only be one thing.
#[tauri::command]
pub fn save_pasted_image(
    access: tauri::State<'_, Access>,
    request: tauri::ipc::Request<'_>,
) -> Result<String, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("The picture did not arrive. Try pasting it again.".into());
    };

    let document = request
        .headers()
        .get("x-document")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| {
            percent_encoding::percent_decode_str(value)
                .decode_utf8()
                .ok()
        })
        .map(|value| PathBuf::from(value.as_ref()))
        .ok_or("Save the document first, so the picture has a folder to go in.")?;

    if !access.is_granted(&document) {
        return Err("MarkPad can only add pictures beside files you opened.".into());
    }

    store(&document, bytes, now_millis())
}

/// Write the picture and return the link to put in the document, relative to
/// it and with forward slashes, which is what Markdown means on every platform.
pub fn store(document: &Path, bytes: &[u8], stamp: u128) -> Result<String, String> {
    if bytes.len() > LARGEST {
        return Err("That picture is larger than 32 MB, so it was not added.".into());
    }
    let extension = kind_of(bytes).ok_or("Only PNG, JPEG, GIF and WebP pictures can be pasted.")?;

    let folder = document
        .parent()
        .ok_or("Save the document first, so the picture has a folder to go in.")?
        .join(FOLDER);
    fs::create_dir_all(&folder).map_err(|error| {
        format!("The images folder beside the document could not be made: {error}")
    })?;

    for attempt in 0..100u32 {
        let name = if attempt == 0 {
            format!("pasted-{stamp}.{extension}")
        } else {
            format!("pasted-{stamp}-{attempt}.{extension}")
        };

        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(folder.join(&name))
        {
            Ok(mut file) => {
                file.write_all(bytes)
                    .and_then(|()| file.sync_all())
                    .map_err(|error| format!("The picture could not be saved: {error}"))?;
                return Ok(format!("{FOLDER}/{name}"));
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("The picture could not be saved: {error}")),
        }
    }

    Err("The picture could not be saved: too many with the same name.".into())
}

/// What a picture is, from its first bytes rather than from what the page says
/// it is.
fn kind_of(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("png")
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("jpg")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("gif")
    } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("webp")
    } else {
        None
    }
}

fn now_millis() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\nrest of the picture";

    #[test]
    fn saves_into_an_images_folder_beside_the_document() {
        let directory = tempfile::tempdir().unwrap();
        let document = directory.path().join("notes.md");

        let link = store(&document, PNG, 42).unwrap();

        assert_eq!(link, "images/pasted-42.png");
        assert_eq!(
            fs::read(directory.path().join("images").join("pasted-42.png")).unwrap(),
            PNG
        );
    }

    #[test]
    fn never_overwrites_an_earlier_paste() {
        let directory = tempfile::tempdir().unwrap();
        let document = directory.path().join("notes.md");

        let first = store(&document, PNG, 42).unwrap();
        let second = store(&document, PNG, 42).unwrap();

        assert_ne!(first, second);
    }

    #[test]
    fn knows_the_kind_from_the_bytes() {
        assert_eq!(kind_of(&[0xFF, 0xD8, 0xFF, 0xE0]), Some("jpg"));
        assert_eq!(kind_of(b"GIF89a..."), Some("gif"));
        assert_eq!(kind_of(b"RIFF\0\0\0\0WEBPVP8 "), Some("webp"));
    }

    #[test]
    fn refuses_something_that_is_not_a_picture() {
        let directory = tempfile::tempdir().unwrap();
        let document = directory.path().join("notes.md");

        assert!(store(&document, b"#!/bin/sh\nrm -rf ~", 42).is_err());
        assert!(
            !directory.path().join("images").exists()
                || fs::read_dir(directory.path().join("images"))
                    .unwrap()
                    .next()
                    .is_none()
        );
    }
}
