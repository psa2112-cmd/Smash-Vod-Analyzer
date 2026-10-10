import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnalysisWorkspace } from "./AnalysisWorkspace";
import { DEFAULT_FILTERS, DEFAULT_TABLE_PREFERENCES, INITIAL_ANALYSIS_EVENTS } from "./analysisData";
import { createProjectFile, serializeProjectFile } from "./projectFile";

describe("AnalysisWorkspace", () => {
  beforeEach(() => window.localStorage.clear());

  it("starts an unimported workspace with an untitled review and no sample video", async () => {
    render(<AnalysisWorkspace onBack={() => undefined} />);
    expect(screen.getByRole("heading", { name: "Untitled Review" })).toBeInTheDocument();
    expect(await screen.findByText("No Video Found")).toBeInTheDocument();
    const player = screen.getByRole("region", { name: "Video player" });
    expect(player.querySelector("img")).toBeNull();
    expect(player.querySelector('[data-slot="badge"]')).toBeNull();
  });

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

    screen.getByRole("button", { name: /choose visible columns/i }).focus();
    await user.keyboard("{ArrowDown}");
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Damage" }));
    expect(screen.queryByRole("columnheader", { name: /damage/i })).not.toBeInTheDocument();
  });


  it("edits damage, character, event type and timestamp inline with undo", async () => {
    const user = userEvent.setup();
    render(<AnalysisWorkspace onBack={() => undefined} />);
    await user.click(screen.getByRole("button", { name: "Edit damage at 0:18" }));
    const damage = screen.getByRole("textbox", { name: "damage at 0:18" });
    fireEvent.change(damage, { target: { value: "22.5%" } }); fireEvent.keyDown(damage, { key: "Enter" });
    expect(screen.getByText("22.5%")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit character at 0:18" }));
    const character = screen.getByRole("combobox", { name: "character at 0:18" });
    fireEvent.change(character, { target: { value: "Fox" } }); fireEvent.keyDown(character, { key: "Enter" });
    expect(screen.getByRole("button", { name: "Edit character at 0:18" })).toHaveTextContent("Fox");
    await user.selectOptions(screen.getByRole("combobox", { name: "Event type at 0:18" }), "Neutral Win");
    expect(screen.getByRole("combobox", { name: "Event type at 0:18" })).toHaveValue("Neutral Win");
    await user.click(screen.getByRole("button", { name: "Edit timestamp at 0:18" }));
    const time = screen.getByRole("textbox", { name: "timestamp at 0:18" });
    fireEvent.change(time, { target: { value: "bad" } }); fireEvent.keyDown(time, { key: "Enter" });
    expect(screen.getByRole("button", { name: "Edit timestamp at 0:18" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit timestamp at 0:18" }));
    const time2 = screen.getByRole("textbox", { name: "timestamp at 0:18" });
    fireEvent.change(time2, { target: { value: "00:20" } }); fireEvent.keyDown(time2, { key: "Enter" });
    expect(screen.getByRole("button", { name: "Edit timestamp at 0:20" })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
    expect(screen.getByRole("button", { name: "Edit timestamp at 0:18" })).toBeInTheDocument();
  });

  it("opens the manual event dialog with Ctrl+E and saves with Ctrl+Enter", async () => {
    render(<AnalysisWorkspace onBack={() => undefined} />);
    fireEvent.keyDown(document.body, { key: "e", ctrlKey: true });
    const note = await screen.findByRole("textbox", { name: "Event note" });
    fireEvent.change(note, { target: { value: "Shortcut saved" } });
    fireEvent.keyDown(note, { key: "Enter", ctrlKey: true });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Shortcut saved")).toBeInTheDocument();
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
    expect(screen.queryByRole("combobox", { name: "Event type at 0:32" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /reset filters/i }));
    expect(screen.getByRole("combobox", { name: "Event type at 0:32" })).toBeInTheDocument();
  });

  it("adds a manual event at the current playhead", async () => {
    const user = userEvent.setup();
    render(<AnalysisWorkspace onBack={() => undefined} />);

    await user.click(screen.getByRole("button", { name: /add event/i }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("combobox", { name: "Event type" }));
    await user.click(screen.getByRole("option", { name: "Neutral Win" }));
    await user.type(within(dialog).getByLabelText("Event note", { exact: true }), "Held center stage.");
    await user.click(within(dialog).getByRole("button", { name: /save event/i }));
    expect(screen.getByDisplayValue("Held center stage.")).toBeInTheDocument();
  });

  it("pauses playback while adding an event and resumes only if it was playing", async () => {
    const user = userEvent.setup();
    render(<AnalysisWorkspace onBack={() => undefined} />);
    await user.click(screen.getByRole("button", { name: "Play replay" }));
    await user.click(screen.getByRole("button", { name: /add event/i }));
    expect(screen.getByRole("button", { name: "Play replay", hidden: true })).toBeInTheDocument();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Pause replay" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Pause replay" }));
    await user.click(screen.getByRole("button", { name: /add event/i }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /save event/i }));
    expect(screen.getByRole("button", { name: "Play replay" })).toBeInTheDocument();
  });

  it("moves between event type, tags and note with arrow keys", async () => {
    const user = userEvent.setup();
    render(<AnalysisWorkspace onBack={() => undefined} />);
    await user.click(screen.getByRole("button", { name: /add event/i }));
    const dialog = screen.getByRole("dialog");
    const eventType = within(dialog).getByRole("combobox", { name: "Event type" });
    eventType.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await user.keyboard("{ArrowDown}");
    expect(within(dialog).getByRole("button", { name: "Landing" })).toHaveFocus();

    const note = within(dialog).getByLabelText("Event note", { exact: true });
    await user.click(note);
    await user.type(note, "ab");
    await user.keyboard("{ArrowUp}");
    expect(note).toHaveFocus();
    (note as HTMLTextAreaElement).setSelectionRange(0, 0);
    await user.keyboard("{ArrowUp}");
    const tagButtons = within(dialog).getAllByRole("button").filter((button) => button.hasAttribute("aria-pressed"));
    expect(tagButtons[tagButtons.length - 1]).toHaveFocus();
  });

  it("edits notes and toggles workspace panels", async () => {
    const user = userEvent.setup();
    render(<AnalysisWorkspace onBack={() => undefined} />);

    const notes = screen.getByLabelText("Match notes", { exact: true });
    await user.clear(notes);
    await user.type(notes, "Stop jumping from the corner.");
    expect(screen.getByText(/saved locally/i)).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: /hide match notes/i })).not.toBeInTheDocument();
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
    await user.keyboard("k");
    expect(screen.getByTestId("playhead-time")).toHaveTextContent("0:05");
    await user.keyboard("{ArrowRight}");
    expect(screen.getByTestId("playhead-time")).toHaveTextContent("0:10");
    await user.keyboard("j");
    expect(screen.getByTestId("playhead-time")).toHaveTextContent("0:05");
    await user.keyboard("{Control>}m{/Control}");
    expect(screen.queryByRole("button", { name: /play replay/i })).not.toBeInTheDocument();
    await user.keyboard("{Control>},{/Control}");
    expect(screen.queryByLabelText("Match notes", { exact: true })).not.toBeInTheDocument();
  });
});

describe("AnalysisWorkspace save & load", () => {
  beforeEach(() => window.localStorage.clear());

  const openFileMenu = async (user: ReturnType<typeof userEvent.setup>) => {
    screen.getByRole("button", { name: /file menu/i }).focus();
    await user.keyboard("{ArrowDown}");
  };

  it("saves with Ctrl+S and shows the notification", async () => {
    const user = userEvent.setup();
    render(<AnalysisWorkspace onBack={() => undefined} />);
    fireEvent.change(screen.getByLabelText("Match notes", { exact: true }), { target: { value: "Changed notes" } });
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
    await user.keyboard("{Control>}s{/Control}");
    expect(await screen.findByText("Saved Successfully")).toBeInTheDocument();
    expect(screen.queryByText(/• unsaved changes/i)).not.toBeInTheDocument();
  });

  it("saves from File → Save", async () => {
    const user = userEvent.setup();
    render(<AnalysisWorkspace onBack={() => undefined} />);
    await openFileMenu(user);
    await user.click(screen.getByRole("menuitem", { name: /save/i }));
    expect(await screen.findByText("Saved Successfully")).toBeInTheDocument();
  });

  it("does not mark unsaved on playback or seeking", async () => {
    const user = userEvent.setup();
    render(<AnalysisWorkspace onBack={() => undefined} />);
    await user.click(screen.getByRole("button", { name: /play replay/i }));
    await user.click(screen.getByRole("button", { name: /jump to 0:18/i }));
    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();
  });

  it("asks before Analyze New Replay and Open when changes are unsaved", async () => {
    const user = userEvent.setup();
    let wentBack = 0;
    render(<AnalysisWorkspace onBack={() => { wentBack += 1; }} />);
    fireEvent.change(screen.getByLabelText("Match notes", { exact: true }), { target: { value: "Changed notes" } });
    await openFileMenu(user);
    await user.click(screen.getByRole("menuitem", { name: /analyze new replay/i }));
    expect(screen.getByText("You have unsaved changes. Save before continuing?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(wentBack).toBe(0);
    await openFileMenu(user);
    await user.click(screen.getByRole("menuitem", { name: /^open$/i }));
    expect(screen.getByRole("button", { name: "Don't Save" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: /back to import/i }));
    await user.click(screen.getByRole("button", { name: "Don't Save" }));
    expect(wentBack).toBe(1);
  });

  it("asks before closing through the desktop bridge", async () => {
    let closeHandler: (() => boolean) | null = null;
    window.desktopBridge = { isDesktop: true, confirmClose: () => undefined, onCloseRequested: (handler) => { closeHandler = handler; } };
    const user = userEvent.setup();
    render(<AnalysisWorkspace onBack={() => undefined} />);
    fireEvent.change(screen.getByLabelText("Match notes", { exact: true }), { target: { value: "Changed notes" } });
    let allowed = true;
    act(() => { allowed = closeHandler!(); });
    expect(allowed).toBe(false);
    expect(screen.getByText("You have unsaved changes. Save before continuing?")).toBeInTheDocument();
    delete window.desktopBridge;
  });

  it("shows No Video Found after opening a project with a missing video", async () => {
    const user = userEvent.setup();
    render(<AnalysisWorkspace onBack={() => undefined} />);
    const project = createProjectFile({
      replay: { videoPath: "C:/vods/missing.mp4", title: "Loaded Set", originalUrl: "https://youtu.be/abc" },
      events: INITIAL_ANALYSIS_EVENTS, sorts: [], filters: DEFAULT_FILTERS, columnPreferences: DEFAULT_TABLE_PREFERENCES,
      notes: "Loaded notes", session: { currentTimestamp: 5, selectedRowId: null },
    });
    const file = new File([serializeProjectFile(project)], "loaded.vodproject", { type: "application/json" });
    await user.upload(screen.getByTestId("project-file-input"), file);
    expect(await screen.findByText("No Video Found")).toBeInTheDocument();
    expect(screen.getByText(/C:\/vods\/missing.mp4/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Loaded Set" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Loaded notes")).toBeInTheDocument();
  });

  it("shows an error for a malformed project file", async () => {
    const user = userEvent.setup();
    render(<AnalysisWorkspace onBack={() => undefined} />);
    await user.upload(screen.getByTestId("project-file-input"), new File(["{bad"], "bad.vodproject"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be read/i);
  });
});

describe("AnalysisWorkspace undo/redo", () => {
  beforeEach(() => window.localStorage.clear());

  it("undoes and redoes a row note edit committed on blur and clears unsaved", async () => {
    const user = userEvent.setup();
    render(<AnalysisWorkspace onBack={() => undefined} />);
    const input = screen.getAllByRole("textbox", { name: /edit note at/i })[0] as HTMLInputElement;
    const original = input.value;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: `${original} extra` } });
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
    fireEvent.blur(input);
    await user.keyboard("{Control>}z{/Control}");
    expect(screen.getAllByRole("textbox", { name: /edit note at/i })[0]).toHaveValue(original);
    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();
    await user.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");
    expect(screen.getAllByRole("textbox", { name: /edit note at/i })[0]).toHaveValue(`${original} extra`);
  });

  it("never changes match notes when undoing outside the match notes box", async () => {
    const user = userEvent.setup();
    render(<AnalysisWorkspace onBack={() => undefined} />);
    const input = screen.getAllByRole("textbox", { name: /edit note at/i })[0] as HTMLInputElement;
    const original = input.value;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: `${original}!` } });
    fireEvent.blur(input);
    const matchNotes = screen.getByLabelText("Match notes", { exact: true });
    fireEvent.focus(matchNotes);
    fireEvent.change(matchNotes, { target: { value: "Keep me" } });
    fireEvent.blur(matchNotes);
    await user.keyboard("{Control>}z{/Control}");
    expect(matchNotes).toHaveValue("Keep me");
    expect(screen.getAllByRole("textbox", { name: /edit note at/i })[0]).toHaveValue(original);
  });

  it("undoes match notes word by word only while focused in the box", () => {
    render(<AnalysisWorkspace onBack={() => undefined} />);
    const matchNotes = screen.getByLabelText("Match notes", { exact: true });
    matchNotes.focus();
    let value = "";
    for (const character of "Stop jumping") {
      value += character;
      fireEvent.change(matchNotes, { target: { value } });
    }
    fireEvent.keyDown(matchNotes, { key: "z", ctrlKey: true });
    expect(matchNotes).toHaveValue("Stop ");
    fireEvent.keyDown(matchNotes, { key: "z", ctrlKey: true });
    expect(matchNotes).toHaveValue("");
    fireEvent.keyDown(matchNotes, { key: "z", ctrlKey: true, shiftKey: true });
    expect(matchNotes).toHaveValue("Stop ");
    expect(screen.queryByText(/unsaved changes/i)).toBeInTheDocument();
    fireEvent.keyDown(matchNotes, { key: "z", ctrlKey: true });
    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();
  });

  it("commits a row note chunk after a 330ms pause and undoes it from inside the input", () => {
    vi.useFakeTimers();
    try {
      render(<AnalysisWorkspace onBack={() => undefined} />);
      const input = screen.getAllByRole("textbox", { name: /edit note at/i })[0] as HTMLInputElement;
      const original = input.value;
      input.focus();
      fireEvent.change(input, { target: { value: `${original}a` } });
      act(() => { vi.advanceTimersByTime(330); });
      fireEvent.change(input, { target: { value: `${original}ab` } });
      fireEvent.keyDown(input, { key: "z", ctrlKey: true });
      expect(input).toHaveValue(`${original}a`);
      fireEvent.keyDown(input, { key: "z", ctrlKey: true });
      expect(input).toHaveValue(original);
    } finally {
      vi.useRealTimers();
    }
  });
});
