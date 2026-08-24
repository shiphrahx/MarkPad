//! Painting the real title bar rather than drawing a fake one.
//!
//! The mockup shows soft grey chrome. Windows draws its own caption and a CSS
//! file cannot reach it, so the usual answer is to turn the decorations off and
//! rebuild the title bar in HTML.
//!
//! We do not do that. The rules ask for native positions, native hit targets
//! and native maximise and snap behaviour, and a hand-built title bar loses all
//! of them: the snap layouts flyout that appears on hovering maximise, the
//! double-click to maximise, dragging to an edge to tile, and the
//! accessibility tree that comes with the real thing.
//!
//! Windows 11 lets an application colour its own caption instead. That gets
//! the mockup's grey and leaves every one of those behaviours alone.

/// Tint the window caption to match the app's chrome.
///
/// The colours come from the front end, where the design tokens live, so there
/// is still one place that decides what grey this is.
#[tauri::command]
pub fn set_caption_colors(
    window: tauri::Window,
    background: (u8, u8, u8),
    text: (u8, u8, u8),
    border: (u8, u8, u8),
) -> Result<(), String> {
    // macOS has no equivalent and needs none: its caption already follows the
    // system appearance, which is what the mockup shows there.
    #[cfg(windows)]
    {
        windows_only::apply(&window, background, text, border)?;
    }

    #[cfg(not(windows))]
    {
        let _ = (window, background, text, border);
    }

    Ok(())
}

#[cfg(windows)]
mod windows_only {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_CAPTION_COLOR, DWMWA_TEXT_COLOR,
    };

    pub fn apply(
        window: &tauri::Window,
        background: (u8, u8, u8),
        text: (u8, u8, u8),
        border: (u8, u8, u8),
    ) -> Result<(), String> {
        let handle = window.hwnd().map_err(|error| error.to_string())?;
        let handle = handle.0 as HWND;

        set(handle, DWMWA_CAPTION_COLOR, colorref(background));
        set(handle, DWMWA_TEXT_COLOR, colorref(text));
        set(handle, DWMWA_BORDER_COLOR, colorref(border));

        Ok(())
    }

    /// Windows wants 0x00BBGGRR, which is back to front from every other place
    /// a colour is written down.
    fn colorref((r, g, b): (u8, u8, u8)) -> u32 {
        (b as u32) << 16 | (g as u32) << 8 | r as u32
    }

    fn set(handle: HWND, attribute: i32, value: u32) {
        // SAFETY: the handle comes from the window we were called on, the
        // attribute is one of DWM's own constants, and the value is a COLORREF
        // whose size is passed alongside it.
        //
        // The result is ignored on purpose. These attributes arrived in
        // Windows 11; on Windows 10 the call fails and the caption stays the
        // system colour, which is the right outcome and not worth an error
        // dialog on startup.
        unsafe {
            let _ = DwmSetWindowAttribute(
                handle,
                attribute as u32,
                std::ptr::addr_of!(value).cast(),
                std::mem::size_of::<u32>() as u32,
            );
        }
    }
}
