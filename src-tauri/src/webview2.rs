//! Making sure Windows has WebView2 before opening a window into it.
//!
//! Windows 11 ships with it, and the installer offers to fetch it, but neither
//! of those is a guarantee: an offline install, an image built by IT, or a
//! machine where it was removed all end up here. Without this check the app
//! opens a window with nothing in it and no explanation, which is the worst
//! possible way to find out.

use std::process::Command;

use windows_sys::Win32::UI::WindowsAndMessaging::{
    MessageBoxW, IDYES, MB_ICONWARNING, MB_YESNO,
};

const DOWNLOAD_PAGE: &str = "https://developer.microsoft.com/microsoft-edge/webview2/";

pub fn is_available() -> bool {
    tauri::webview_version().is_ok()
}

/// Explain the problem and offer to open the download page.
///
/// Says what is missing, what it is for and what happens next, rather than
/// apologising. There is nothing the app can do about it on its own: silently
/// downloading and running an installer is not a thing an editor should do
/// without asking.
pub fn offer_the_bootstrapper() {
    let message = concat!(
        "MarkPad needs Microsoft Edge WebView2, which is not installed on this computer.\r\n\r\n",
        "WebView2 is a free Microsoft component that MarkPad uses to draw its window.\r\n\r\n",
        "Open the download page now?"
    );

    if ask(message, "WebView2 is missing") {
        // `start` is a shell builtin, so it needs a shell. The empty string is
        // the window title argument, which `start` requires before the URL.
        let _ = Command::new("cmd")
            .args(["/C", "start", "", DOWNLOAD_PAGE])
            .spawn();
    }
}

fn ask(message: &str, title: &str) -> bool {
    let message = wide(message);
    let title = wide(title);

    // SAFETY: both strings are null terminated and outlive the call, and a
    // null window handle means the box has no owner window, which is correct
    // here because there is no window yet.
    let answer = unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            message.as_ptr(),
            title.as_ptr(),
            MB_YESNO | MB_ICONWARNING,
        )
    };

    answer == IDYES
}

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}
