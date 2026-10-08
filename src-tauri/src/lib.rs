//! Native desktop backend for Smash Replay Analyzer (Tauri v2).
//!
//! Responsibilities:
//! - Download (and optionally trim) YouTube videos via the bundled yt-dlp
//!   and ffmpeg sidecars, streaming progress to the frontend as events.
//! - Expose file dialogs, text file I/O, and existence checks.
//! - Intercept window close requests so the frontend can prompt about
//!   unsaved changes before the window is destroyed.

use regex::Regex;
use serde::Serialize;
use std::path::PathBuf;
use tauri::webview::PageLoadEvent;
use tauri::{Emitter, WindowEvent};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

/// Folder where downloaded replays are stored: ~/Videos/SmashReplayAnalyzer
fn video_storage_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let home = app
        .path()
        .video_dir()
        .map_err(|e| format!("Could not locate the Videos folder: {e}"))?;
    Ok(home.join("SmashReplayAnalyzer"))
}

#[derive(Clone, Serialize)]
struct DownloadProgress {
    percent: u8,
}

/// Downloads a video with the bundled yt-dlp sidecar. When `start_seconds` /
/// `end_seconds` are provided, yt-dlp uses its ffmpeg-backed section download
/// to trim the clip without a separate pass.
///
/// Progress is emitted as `download-progress` events with `{ percent: 0-100 }`.
/// Returns the absolute path of the saved file.
#[tauri::command]
async fn download_video(
    app: tauri::AppHandle,
    url: String,
    file_name: String,
    start_seconds: Option<f64>,
    end_seconds: Option<f64>,
) -> Result<String, String> {
    let dir = video_storage_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Could not create video folder: {e}"))?;
    let output_path = dir.join(&file_name);

    let mut args: Vec<String> = vec![
        "-f".into(),
        "best[ext=mp4]/best".into(),
        "--newline".into(), // one progress line per update, easy to parse
        "-o".into(),
        output_path.to_string_lossy().to_string(),
    ];

    if let (Some(start), Some(end)) = (start_seconds, end_seconds) {
        args.push("--download-sections".into());
        args.push(format!("*{start}-{end}"));
        args.push("--force-keyframes-at-cuts".into());
    }
    args.push(url.clone());

    let sidecar = app
        .shell()
        .sidecar("binaries/yt-dlp")
        .map_err(|e| format!("yt-dlp sidecar unavailable: {e}"))?
        .args(args);

    let (mut rx, _child) = sidecar
        .spawn()
        .map_err(|e| format!("Failed to start yt-dlp: {e}"))?;

    // yt-dlp prints lines like: [download]  42.3% of  120.00MiB at ...
    let percent_re = Regex::new(r"\[download\]\s+(\d+(?:\.\d+)?)%").unwrap();

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) | CommandEvent::Stderr(line) => {
                let text = String::from_utf8_lossy(&line);
                if let Some(caps) = percent_re.captures(&text) {
                    if let Ok(pct) = caps[1].parse::<f64>() {
                        let _ = app.emit(
                            "download-progress",
                            DownloadProgress {
                                percent: pct.round().clamp(0.0, 100.0) as u8,
                            },
                        );
                    }
                }
            }
            CommandEvent::Terminated(status) => {
                if status.code != Some(0) {
                    return Err(format!("yt-dlp exited with code {:?}", status.code));
                }
            }
            _ => {}
        }
    }

    let _ = app.emit("download-progress", DownloadProgress { percent: 100 });
    Ok(output_path.to_string_lossy().to_string())
}

/// Checks whether a file exists on disk.
#[tauri::command]
fn file_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

/// Reads a UTF-8 text file from disk.
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Could not read {path}: {e}"))
}

/// Writes a UTF-8 text file to disk, creating parent folders as needed.
#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Could not create folder: {e}"))?;
    }
    std::fs::write(&path, contents).map_err(|e| format!("Could not write {path}: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            download_video,
            file_exists,
            read_text_file,
            write_text_file,
        ])
        // Inject the frontend bridge (window.desktopBridge) on every page load,
        // including refreshes and navigations, so it never goes missing.
        .on_page_load(|webview, payload| {
            if payload.event() == PageLoadEvent::Finished {
                webview.eval(include_str!("../bridge.js")).ok();
            }
        })
        .on_window_event(|window, event| {
            // Intercept OS close requests: ask the frontend first. The frontend
            // calls confirmClose() (window.destroy) when it's safe to exit.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.emit("close-requested", ());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Smash Replay Analyzer");
}
