# Sidecar binaries

Place platform-specific executables here before running `tauri build`.
Names must include the Rust target triple:

- Windows x64: `yt-dlp-x86_64-pc-windows-msvc.exe`, `ffmpeg-x86_64-pc-windows-msvc.exe`
- macOS Apple Silicon: `yt-dlp-aarch64-apple-darwin`, `ffmpeg-aarch64-apple-darwin`
- macOS Intel: `yt-dlp-x86_64-apple-darwin`, `ffmpeg-x86_64-apple-darwin`
- Linux x64: `yt-dlp-x86_64-unknown-linux-gnu`, `ffmpeg-x86_64-unknown-linux-gnu`

Find your triple with `rustc -vV` (the `host:` line).
