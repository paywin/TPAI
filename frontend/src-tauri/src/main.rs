#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_shell::{ShellExt, process::CommandChild};

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            #[cfg(not(debug_assertions))]
            {
                let resources = app.path().resource_dir()?;
                let model = resources.join("models").join("vosk-model-small-pt-0.3");
                let (mut events, child) = app.shell().sidecar("pulso-engine")?
                    .env("VOSK_MODEL_PATH", model.to_string_lossy().to_string())
                    .spawn()?;
                app.manage(Mutex::new(Some(child)));
                tauri::async_runtime::spawn(async move { while events.recv().await.is_some() {} });
            }
            #[cfg(debug_assertions)]
            app.manage(Mutex::new(None::<CommandChild>));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Falha ao iniciar PULSO");
    app.run(|handle, event| {
        if let tauri::RunEvent::Exit = event {
            if let Some(child) = handle.state::<Mutex<Option<CommandChild>>>().lock().unwrap().take() {
                let _ = child.kill();
            }
        }
    });
}
