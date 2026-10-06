import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchSuggestions } from "../types";
import { fetchSuggestions } from "../services/search-service";
import { resetSearchStore, useSearchStore } from "../store/search-store";
import { SearchBox } from "./search-box";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("../services/search-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/search-service")>()),
  fetchSuggestions: vi.fn(),
}));

const mockedFetch = vi.mocked(fetchSuggestions);

const suggestions = (tag: string): SearchSuggestions => ({ users: [], tags: [{ tag, postsCount: 3 }] });

// Real timers: RTL's async wrapper waits on a real setTimeout(0) and hangs under Vitest fake timers.
const setup = () => userEvent.setup();

/** Waits until the debounced suggestion request number `calls` fired. */
const settleDebounce = (calls: number) => waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(calls));

beforeEach(() => {
  resetSearchStore();
  push.mockClear();
  mockedFetch.mockReset();
  mockedFetch.mockResolvedValue(suggestions("NextJS"));
});

describe("SearchBox", () => {
  it("shows recent searches on focus and removes one", async () => {
    useSearchStore.getState().actions.addRecent("zinc");
    const user = setup();
    render(<SearchBox variant="page" />);

    await user.click(screen.getByRole("combobox"));
    expect(screen.getByRole("option", { name: /zinc/ })).toBeInTheDocument();

    await user.click(screen.getByTitle('Xóa "zinc"'));
    expect(useSearchStore.getState().recent).toEqual([]);
  });

  it("debounces suggestions", async () => {
    const user = setup();
    render(<SearchBox variant="page" />);

    await user.type(screen.getByRole("combobox"), "nex");
    expect(mockedFetch).not.toHaveBeenCalled();

    await settleDebounce(1);
    expect(mockedFetch).toHaveBeenCalledWith("nex");
  });

  it("ignores a stale response", async () => {
    let resolveFirst: (value: SearchSuggestions) => void = () => {};
    mockedFetch
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce(suggestions("Second"));
    const user = setup();
    render(<SearchBox variant="page" />);
    const input = screen.getByRole("combobox");

    await user.type(input, "ne");
    await settleDebounce(1);
    await user.type(input, "x");
    await settleDebounce(2);
    expect(await screen.findByRole("option", { name: /#Second/ })).toBeInTheDocument();
    await act(async () => resolveFirst(suggestions("First")));

    expect(screen.queryByRole("option", { name: /#First/ })).toBeNull();
  });

  it("navigates options with arrows and Enter", async () => {
    const user = setup();
    render(<SearchBox variant="page" />);
    const input = screen.getByRole("combobox");

    await user.type(input, "nex");
    await screen.findByRole("option", { name: /#NextJS/ });
    await user.keyboard("{ArrowDown}{ArrowDown}");

    const active = input.getAttribute("aria-activedescendant");
    expect(active && document.getElementById(active)).toHaveTextContent("#NextJS");

    await user.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/tags/NextJS");
  });

  it("submits the typed text before the debounce settles", async () => {
    const user = setup();
    render(<SearchBox variant="page" />);

    await user.type(screen.getByRole("combobox"), "da lat{Enter}");

    expect(push).toHaveBeenCalledWith("/search?q=da%20lat");
    expect(useSearchStore.getState().recent[0]).toBe("da lat");
  });

  it("closes on Escape and keeps the text", async () => {
    const user = setup();
    render(<SearchBox variant="page" />);
    const input = screen.getByRole("combobox");

    await user.type(input, "nex");
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(input).toHaveValue("nex");
  });

  it("submits the query from the first option", async () => {
    const user = setup();
    render(<SearchBox variant="page" />);

    await user.type(screen.getByRole("combobox"), "zinc");
    await user.click(screen.getByRole("option", { name: 'Tìm "zinc"' }));

    expect(push).toHaveBeenCalledWith("/search?q=zinc");
  });

  it("hides suggestions that belong to an older query", async () => {
    mockedFetch.mockResolvedValueOnce(suggestions("First")).mockImplementation(() => new Promise(() => {}));
    const user = setup();
    render(<SearchBox variant="page" />);
    const input = screen.getByRole("combobox");

    await user.type(input, "an");
    expect(await screen.findByRole("option", { name: /#First/ })).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, "zz");
    expect(screen.queryByRole("option", { name: /#First/ })).toBeNull();
  });

  it("does not submit a bare #", async () => {
    const user = setup();
    render(<SearchBox variant="page" />);

    await user.type(screen.getByRole("combobox"), "#{Enter}");

    expect(push).not.toHaveBeenCalled();
    expect(useSearchStore.getState().recent).toEqual([]);
  });

  it("only points aria-controls at a rendered listbox", async () => {
    const user = setup();
    render(<SearchBox variant="page" />);
    const input = screen.getByRole("combobox");
    expect(input).not.toHaveAttribute("aria-controls");

    await user.type(input, "zinc");
    expect(input).toHaveAttribute("aria-controls", screen.getByRole("listbox").id);
  });

  it("removes the active recent search with Delete, with no nested interactive control in the option", async () => {
    useSearchStore.getState().actions.addRecent("zinc");
    const user = setup();
    render(<SearchBox variant="page" />);

    await user.click(screen.getByRole("combobox"));
    expect(within(screen.getByRole("option", { name: /zinc/ })).queryByRole("button")).toBeNull();

    await user.keyboard("{ArrowDown}{Delete}");
    expect(useSearchStore.getState().recent).toEqual([]);
  });

  it("does not submit while an IME composition is active", async () => {
    const user = setup();
    render(<SearchBox variant="page" />);
    const input = screen.getByRole("combobox");

    await user.type(input, "dal");
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });

    expect(push).not.toHaveBeenCalled();
  });

  it("gives small icon buttons a 44px hit area", async () => {
    useSearchStore.getState().actions.addRecent("zinc");
    const user = setup();
    render(<SearchBox variant="page" />);

    await user.click(screen.getByRole("combobox"));
    expect(screen.getByTitle('Xóa "zinc"')).toHaveClass("after:absolute");
    expect(screen.getByRole("button", { name: "Xóa tất cả" })).toHaveClass("after:absolute");
    await user.type(screen.getByRole("combobox"), "x");
    expect(screen.getByRole("button", { name: "Xóa" })).toHaveClass("after:absolute");
  });
});
