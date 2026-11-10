import { fireEvent, render, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

vi.mock("@tanstack/react-router", () => ({
  createRootRouteWithContext: () => (options: { component: () => React.ReactNode }) => ({
    options,
    useRouteContext: () => ({ queryClient: new QueryClient() }),
  }),
  Outlet: () => null,
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useRouter: () => ({ invalidate: vi.fn() }),
  HeadContent: () => null,
  Scripts: () => null,
}));

import { Route } from "./__root";

afterEach(() => {
  cleanup();
  document.body.classList.remove("using-keyboard");
});

it("switches to keyboard input on keydown and back on mouse movement", () => {
  const Component = Route.options.component;
  if (!Component) throw new Error("Missing root component");
  render(<Component />);
  fireEvent.keyDown(window, { key: "ArrowRight" });
  expect(document.body.classList.contains("using-keyboard")).toBe(true);
  fireEvent.mouseMove(window, { clientX: 1, clientY: 1 });
  expect(document.body.classList.contains("using-keyboard")).toBe(false);
});

it("removes input listeners and keyboard mode when the root unmounts", () => {
  const Component = Route.options.component;
  if (!Component) throw new Error("Missing root component");
  const { unmount } = render(<Component />);
  fireEvent.keyDown(window, { key: "Tab" });
  expect(document.body.classList.contains("using-keyboard")).toBe(true);
  unmount();
  expect(document.body.classList.contains("using-keyboard")).toBe(false);
  fireEvent.keyDown(window, { key: "Tab" });
  expect(document.body.classList.contains("using-keyboard")).toBe(false);
});