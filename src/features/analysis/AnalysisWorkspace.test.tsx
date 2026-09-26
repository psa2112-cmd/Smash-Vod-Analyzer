import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnalysisWorkspace } from "./AnalysisWorkspace";

describe("AnalysisWorkspace", () => {
  beforeEach(() => window.localStorage.clear());

  it("sorts the event table and seeks from a timestamp", async () => {
    const user = userEvent.setup();
    render(<AnalysisWorkspace onBack={() => undefined} />);

    await user.click(screen.getByRole("button", { name: /sort by timestamp/i }));
    await user.click(screen.getByRole("button", { name: /sort by timestamp/i }));
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]!).getByText("0:18")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /jump to 0:18/i }));
    expect(screen.getByTestId("playhead-time")).toHaveTextContent("0:17");
  });

  it("supports multi-column sorting and column visibility", async () => {
    const user = userEvent.setup();
    render(<AnalysisWorkspace onBack={() => undefined} />);
    await user.click(screen.getByRole("button", { name: /sort by event type/i }));
    await user.keyboard("{Shift>}");
    await user.click(screen.getByRole("button", { name: /sort by timestamp/i }));
    await user.keyboard("{/Shift}");
    expect(screen.getByRole("button", { name: /sort by event type/i })).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /sort by timestamp/i })).toHaveTextContent("2");

    await user.click(screen.getByRole("button", { name: /choose visible columns/i }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Damage" }));
    expect(screen.queryByRole("columnheader", { name: /damage/i })).not.toBeInTheDocument();
  });

  it("hides a column from its header eye and resets table preferences", async () => {
    const user = userEvent.setup();
    render(<AnalysisWorkspace onBack={() => undefined} />);
    await user.click(screen.getByRole("button", { name: /hide character column/i }));
    expect(screen.queryByRole("columnheader", { name: /character/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /reset layout/i }));
    expect(screen.getByRole("columnheader", { name: /character/i })).toBeInTheDocument();
  });

  it("closes the tag editor when clicking outside", async () => {
    const user = userEvent.setup();
    render(<AnalysisWorkspace onBack={() => undefined} />);
    await user.click(screen.getAllByRole("button", { name: "Edit tags" })[0]!);
    expect(screen.getByRole("button", { name: "Close tag editor" })).toBeInTheDocument();
    await user.click(screen.getByRole("heading", { name: "Detected events" }));
    expect(screen.queryByRole("button", { name: "Close tag editor" })).not.toBeInTheDocument();
  });

  it("filters events and resets the result", async () => {
    const user = userEvent.setup();
    render(<AnalysisWorkspace onBack={() => undefined} />);

    await user.click(screen.getByRole("button", { name: "Manual Events" }));
    expect(screen.getAllByText("Missed Tech Chase").length).toBeGreaterThan(0);
    expect(screen.queryByText("Hit Received", { selector: "span" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /reset filters/i }));
    expect(screen.getAllByText("Hit Received", { selector: "span" }).length).toBeGreaterThan(0);
  });

  it("adds a manual event at the current playhead", async () => {
    const user = userEvent.setup();
    render(<AnalysisWorkspace onBack={() => undefined} />);

    await user.click(screen.getByRole("button", { name: /add event/i }));
    const dialog = screen.getByRole("dialog");
    await user.selectOptions(within(dialog).getByLabelText("Event type", { exact: true }), "Neutral Win");
    await user.type(within(dialog).getByLabelText("Event note", { exact: true }), "Held center stage.");
    await user.click(within(dialog).getByRole("button", { name: /save event/i }));
    expect(screen.getByDisplayValue("Held center stage.")).toBeInTheDocument();
  });

  it("edits notes and toggles workspace panels", async () => {
    const user = userEvent.setup();
    render(<AnalysisWorkspace onBack={() => undefined} />);

    const notes = screen.getByLabelText("Match notes", { exact: true });
    await user.clear(notes);
    await user.type(notes, "Stop jumping from the corner.");
    expect(screen.getByText(/saved locally/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /hide match notes/i }));
    expect(screen.queryByLabelText("Match notes", { exact: true })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /show match notes/i }));
    expect(screen.getByLabelText("Match notes", { exact: true })).toBeInTheDocument();
  });

  it("offers vertical resizing, page scrolling, and a fitted replay frame", () => {
    render(<AnalysisWorkspace onBack={() => undefined} />);
    expect(screen.getByRole("separator", { name: /resize video and review/i })).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: /resize event table and lower panels/i })).toBeInTheDocument();
    expect(screen.getByRole("main")).not.toHaveClass("h-screen", "overflow-hidden");
    expect(screen.getByAltText(/replay frame/i)).toHaveClass("object-contain");
  });

  it("changes playback speed through a menu and toggles video controls", async () => {
    const user = userEvent.setup();
    render(<AnalysisWorkspace onBack={() => undefined} />);
    screen.getByRole("button", { name: /playback speed/i }).focus();
    await user.keyboard("{ArrowDown}");
    await user.click(screen.getByRole("menuitemradio", { name: /1.5×/i }));
    expect(screen.getByRole("button", { name: /playback speed/i })).toHaveTextContent("1.5×");
    await user.click(screen.getByRole("button", { name: /hide video controls/i }));
    expect(screen.queryByRole("button", { name: /play replay/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /show video controls/i }));
    expect(screen.getByRole("button", { name: /play replay/i })).toBeInTheDocument();
  });

  it("marks selected tags with the blue accent while editing", async () => {
    const user = userEvent.setup();
    render(<AnalysisWorkspace onBack={() => undefined} />);
    const firstTagEditor = screen.getAllByRole("button", { name: "Edit tags" })[0];
    expect(firstTagEditor).toBeDefined();
    if (!firstTagEditor) return;
    await user.click(firstTagEditor);
    expect(screen.getByRole("button", { name: "Neutral", pressed: true })).toHaveClass("bg-primary");
  });

  it("supports click-to-play and keyboard hotkeys", async () => {
    const user = userEvent.setup();
    render(<AnalysisWorkspace onBack={() => undefined} />);
    await user.click(screen.getByRole("button", { name: /toggle playback from video/i }));
    expect(screen.getByRole("button", { name: /pause replay/i })).toBeInTheDocument();
    await user.keyboard(" ");
    expect(screen.getByRole("button", { name: /play replay/i })).toBeInTheDocument();
    (document.activeElement as HTMLElement | null)?.blur();
    await user.keyboard("8");
    expect(screen.getByTestId("playhead-time")).toHaveTextContent("0:22");
    await user.keyboard("7u");
    expect(screen.getByTestId("playhead-time")).toHaveTextContent("0:16");
    await user.keyboard("{Control>}m{/Control}");
    expect(screen.queryByRole("button", { name: /play replay/i })).not.toBeInTheDocument();
    await user.keyboard("{Control>}n{/Control}");
    expect(screen.queryByLabelText("Match notes", { exact: true })).not.toBeInTheDocument();
  });
});
