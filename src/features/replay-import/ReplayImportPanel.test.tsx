import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReplayImportPanel } from "./ReplayImportPanel";

describe("ReplayImportPanel", () => {
  it("starts empty with Analyze disabled", () => {
    render(<ReplayImportPanel onAnalyze={vi.fn()} />);
    expect(screen.getByRole("button", { name: /analyze replay/i })).toBeDisabled();
  });

  it("shows validation error for a bad YouTube link", async () => {
    render(<ReplayImportPanel onAnalyze={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/youtube url/i), "https://vimeo.com/1");
    expect(await screen.findByRole("alert")).toHaveTextContent(/youtube/i);
    expect(screen.getByRole("button", { name: /analyze replay/i })).toBeDisabled();
  });

  it("accepts a valid Twitch VOD and calls onAnalyze", async () => {
    const onAnalyze = vi.fn();
    render(<ReplayImportPanel onAnalyze={onAnalyze} />);
    await userEvent.type(screen.getByLabelText(/twitch vod url/i), "https://twitch.tv/videos/12345");
    expect(screen.getByText(/source accepted/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /analyze replay/i }));
    expect(onAnalyze).toHaveBeenCalledWith({ kind: "twitch", url: "https://twitch.tv/videos/12345" });
  });
});
