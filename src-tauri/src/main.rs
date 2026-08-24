// Windows release builds open a console window unless this is here.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    markpad_lib::run()
}
