//! Links in a document open in the browser, and never in this window.
//!
//! Clicking a link in the preview used to navigate the app's own webview to
//! the page, which replaced MarkPad with a website and took any unsaved work
//! with it. Two layers now. The page sends link clicks here to be opened
//! outside. And anything that still tries to move the window off the app,
//! a raw HTML link or a meta refresh, is stopped by the navigation guard.

use tauri::plugin::TauriPlugin;
use tauri::{Runtime, Url};
use tauri_plugin_opener::OpenerExt;

/// Open a link from a document in the system's handler for it.
///
/// Only web pages and email. A `file:` link or a custom scheme could launch
/// something on the machine, and a document from the internet should not be
/// able to do that with one click.
#[tauri::command]
pub fn open_link(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let parsed = Url::parse(&url).map_err(|_| format!("{url} is not a link MarkPad can open."))?;
    if !is_openable(&parsed) {
        return Err(format!(
            "MarkPad only opens web and email links. {url} was left alone."
        ));
    }

    app.opener()
        .open_url(parsed.as_str(), None::<&str>)
        .map_err(|error| format!("{url} could not be opened: {error}"))
}

/// Keeps the window on the app. A web link that gets this far opens in the
/// browser instead, so it still goes where the person clicking it expected.
pub fn navigation_guard<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("navigation-guard")
        .on_navigation(|webview, url| {
            if is_app(url) {
                return true;
            }
            if is_openable(url) {
                let _ = webview.opener().open_url(url.as_str(), None::<&str>);
            }
            false
        })
        .build()
}

pub fn is_openable(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https" | "mailto")
}

/// Whether a URL is the app itself rather than somewhere else.
///
/// `tauri://localhost` on macOS and Linux, `http(s)://tauri.localhost` on
/// Windows. `about:` covers the blank page and the print iframe's srcdoc. The
/// dev server only counts in a debug build.
pub fn is_app(url: &Url) -> bool {
    match url.scheme() {
        "tauri" | "about" => true,
        "http" | "https" => match url.host_str() {
            Some("tauri.localhost") => true,
            Some("localhost") => cfg!(debug_assertions) && url.port() == Some(1420),
            _ => false,
        },
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(text: &str) -> Url {
        Url::parse(text).unwrap()
    }

    #[test]
    fn opens_web_and_email_links() {
        assert!(is_openable(&url("https://example.com")));
        assert!(is_openable(&url("http://example.com")));
        assert!(is_openable(&url("mailto:someone@example.com")));
    }

    #[test]
    fn will_not_launch_anything_on_the_machine() {
        assert!(!is_openable(&url("file:///etc/passwd")));
        assert!(!is_openable(&url("C:/Windows/System32/calc.exe")));
        assert!(!is_openable(&url("ms-settings:privacy")));
        assert!(!is_openable(&url("javascript:alert(1)")));
    }

    #[test]
    fn knows_the_app_on_every_platform() {
        assert!(is_app(&url("tauri://localhost/index.html")));
        assert!(is_app(&url("http://tauri.localhost/")));
        assert!(is_app(&url("https://tauri.localhost/#heading")));
        assert!(is_app(&url("about:srcdoc")));
    }

    #[test]
    fn keeps_the_window_off_the_web() {
        assert!(!is_app(&url("https://example.com/")));
        assert!(!is_app(&url("http://tauri.localhost.example.com/")));
        assert!(!is_app(&url("file:///C:/notes.md")));
    }
}
