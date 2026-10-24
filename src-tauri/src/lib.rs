//! Chatter OS desktop shell (PLAN.md §13 Phase 8).
//! Loads the exported Next.js app, keeps running in the tray when the window
//! is closed so native alerts keep arriving, and tells the web app which
//! installer it is (for /api/desktop/register).

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, WindowEvent,
};

/// Platform id matching models/DesktopDevice.js
#[tauri::command]
fn platform_id() -> &'static str {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => "macos-arm64",
        ("macos", _) => "macos-x64",
        ("windows", "x86") => "windows-x86",
        _ => "windows-x64",
    }
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![platform_id])
        .setup(|app| {
            let open = MenuItem::with_id(app, "open", "Open Chatter OS", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;

            let mut tray = TrayIconBuilder::with_id("main")
                .tooltip("Chatter OS")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            Ok(())
        })
        // Closing the window hides it to the tray; Quit in the tray menu exits
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Chatter OS")
        .run(|app, event| {
            // macOS: clicking the Dock icon brings the hidden window back
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                show_main(app);
            }
            let _ = (app, event);
        });
}
