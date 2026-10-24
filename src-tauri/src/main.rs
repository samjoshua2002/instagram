// Hides the extra console window on Windows release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    chatter_os_lib::run()
}
