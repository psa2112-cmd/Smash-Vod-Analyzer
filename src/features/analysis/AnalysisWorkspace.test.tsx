import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnalysisWorkspace } from "./AnalysisWorkspace";

describe("AnalysisWorkspace", () => {
  it("sorts the event table and seeks from a timestamp", async () => {
    const user = userEvent.setup();
    render(<AnalysisWorkspace />);

    await user.click(screen.getByRole("button", { name: /sort by timestamp/i }));
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("0:18")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /jump to 0:18/i }));
    expect(screen.getByTestId("playhead-time")).toHaveTextContent("0:17");
  });

  it("filters events and resets the result", async () => {
    const user = userEvent.setup();
    render(<AnalysisWorkspace />);

    await user.click(screen.getByRole("button", { name: "Manual Events" }));
    expect(screen.getByText("Missed Tech Chase")).toBeInTheDocument();
    expect(screen.queryByText("Hit Received")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /reset filters/i }));
    expect(screen.getByText("Hit Received")).toBeInTheDocument();
  });

  it("adds a manual event at the current playhead", async () => {
    const user = userEvent.setup();
    render(<AnalysisWorkspace />);

    await user.click(screen.getByRole("button", { name: /add event/i }));
    await user.selectOptions(screen.getByLabelText(/event type/i), "Neutral Win");
    await user.type(screen.getByLabelText(/event note/i), "Held center stage.");
    await user.click(screen.getByRole("button", { name: /save event/i }));
    expect(screen.getByText("Held center stage.")).toBeInTheDocument();
  });

  it("edits notes and toggles workspace panels", async () => {
    const user = userEvent.setup();
    render(<AnalysisWorkspace />);

    const notes = screen.getByLabelText(/match notes/i);
    await user.clear(notes);
    await user.type(notes, "Stop jumping from the corner.");
    expect(screen.getByText(/saved locally/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /hide match notes/i }));
    expect(screen.queryByLabelText(/match notes/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /show match notes/i }));
    expect(screen.getByLabelText(/match notes/i)).toBeInTheDocument();
  });
});