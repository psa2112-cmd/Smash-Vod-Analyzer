import { afterEach, describe, expect, it, vi } from "vitest";
import { getDesktopBridge, isDesktopEnvironment, type DesktopBridge } from "./desktopBridge";
import { downloadReplayVideo } from "@/features/analysis/storageAdapter";

const makeBridge = (extra: Partial<DesktopBridge> = {}): DesktopBridge => ({
  isDesktop: true,
  onCloseRequested: () => () => {},
  confirmClose: () => {},
  ...extra,
});

describe("desktop bridge", () => {
  afterEach(() => { delete window.desktopBridge; });

  it("is absent in a plain browser", () => {
    expect(getDesktopBridge()).toBeNull();
    expect(isDesktopEnvironment()).toBe(false);
  });

  it("detects the desktop app", () => {
    window.desktopBridge = makeBridge();
    expect(isDesktopEnvironment()).toBe(true);
  });

  it("hands video downloads to the desktop app", async () => {
    const downloadVideo = vi.fn(async ({ onProgress }: { onProgress: (p: number) => void }) => {
      onProgress(100);
      return { filePath: "/videos/real.mp4" };
    });
    window.desktopBridge = makeBridge({ downloadVideo });
    const onProgress = vi.fn();
    const path = await downloadReplayVideo("https://youtu.be/dQw4w9WgXcQ", { isFullVideo: true }, onProgress);
    expect(path).toBe("/videos/real.mp4");
    expect(downloadVideo).toHaveBeenCalledOnce();
    expect(onProgress).toHaveBeenCalledWith(100);
  });
});
