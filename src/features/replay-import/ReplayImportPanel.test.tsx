import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReplayImportPanel } from "./ReplayImportPanel";

const typeLink = (value: string) => fireEvent.change(screen.getByLabelText(/video link/i), { target: { value } });

describe("ReplayImportPanel", () => {
  it("starts empty with Analyze disabled", () => {
    render(<ReplayImportPanel onAnalyze={vi.fn()} />);
    expect(screen.getByRole("button", { name: /analyze replay/i })).toBeDisabled();
  });

  it("shows validation error for an unsupported link", async () => {
    render(<ReplayImportPanel onAnalyze={vi.fn()} />);
    typeLink("https://vimeo.com/1");
    expect(await screen.findByRole("alert")).toHaveTextContent(/youtube video or twitch vod/i);
    expect(screen.getByRole("button", { name: /analyze replay/i })).toBeDisabled();
  });

  it("YouTube defaults to full video and reveals timestamps when unchecked", async () => {
    render(<ReplayImportPanel onAnalyze={vi.fn()} />);
    typeLink("https://youtu.be/dQw4w9WgXcQ");
    const checkbox = screen.getByRole("checkbox", { name: /full video/i });
    expect(checkbox).toBeChecked();
    expect(screen.queryByLabelText(/start timestamp/i)).toBeNull();
    await userEvent.click(checkbox);
    expect(screen.getByLabelText(/start timestamp/i)).toBeInTheDocument();
  });

  it("Twitch defaults to a clip range and submits it", async () => {
    const onAnalyze = vi.fn();
    render(<ReplayImportPanel onAnalyze={onAnalyze} />);
    typeLink("https://twitch.tv/videos/12345");
    expect(screen.getByRole("checkbox", { name: /full video/i })).not.toBeChecked();
    expect(screen.getByRole("button", { name: /analyze replay/i })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/start timestamp/i), { target: { value: "1:00:00" } });
    fireEvent.change(screen.getByLabelText(/end timestamp/i), { target: { value: "1:20:00" } });
    expect(screen.getByText(/source accepted/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /analyze replay/i }));
    expect(onAnalyze).toHaveBeenCalledWith({
      kind: "twitch",
      url: "https://twitch.tv/videos/12345",
      clipRange: { isFullVideo: false, startTimestamp: "1:00:00", endTimestamp: "1:20:00", startSeconds: 3600, endSeconds: 4800 },
    });
  });

  it("auto-formats typed timestamps with a colon", () => {
    render(<ReplayImportPanel onAnalyze={vi.fn()} />);
    typeLink("https://twitch.tv/videos/12345");
    const start = screen.getByLabelText(/start timestamp/i);
    fireEvent.change(start, { target: { value: "1230" } });
    expect(start).toHaveValue("12:30");
    const end = screen.getByLabelText(/end timestamp/i);
    fireEvent.change(end, { target: { value: "14800" } });
    expect(end).toHaveValue("1:48:00");
  });

  it("keeps timestamps the user typed with colons intact", () => {
    render(<ReplayImportPanel onAnalyze={vi.fn()} />);
    typeLink("https://twitch.tv/videos/12345");
    const start = screen.getByLabelText(/start timestamp/i);
    fireEvent.change(start, { target: { value: "1:00:00" } });
    expect(start).toHaveValue("1:00:00");
  });

  it("renders the full-video checkbox larger with a gray unchecked surface", () => {
    render(<ReplayImportPanel onAnalyze={vi.fn()} />);
    typeLink("https://youtu.be/dQw4w9WgXcQ");
    const checkbox = screen.getByRole("checkbox", { name: /full video/i });
    const swatch = checkbox.nextElementSibling as HTMLElement;
    expect(swatch).toHaveClass("size-5", "bg-muted");
    expect(checkbox.className).not.toContain("accent-primary");
  });

  it("shows download progress when provided", () => {
    render(<ReplayImportPanel onAnalyze={vi.fn()} downloadProgress={42} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "42");
  });
});
