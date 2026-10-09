import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeUserProfile } from "../mocks/user-fixtures";
import type { FollowListPage, RelationListQuery, UserProfile } from "../types";
import { RelationUserList } from "./relation-user-list";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

const user = (id: string): UserProfile => makeUserProfile({ id, displayName: `User ${id}`, username: `user.${id}` });
const page = (ids: string[], nextPage?: number): FollowListPage => ({ users: ids.map(user), nextPage });

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

type FetchPage = (q: RelationListQuery) => Promise<FollowListPage>;

function renderList(fetchPage: FetchPage, extra: Partial<React.ComponentProps<typeof RelationUserList>> = {}) {
  return render(
    <RelationUserList
      fetchPage={fetchPage}
      renderAction={(item) => <button type="button">Action {item.id}</button>}
      emptyTitle="relations.blockedEmptyTitle"
      emptyDescription="relations.blockedEmptyDescription"
      searchLabel="relations.searchPlaceholder"
      {...extra}
    />,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("RelationUserList", () => {
  it("shows skeleton rows while the first page loads, then the rows with the row action", async () => {
    const first = deferred<FollowListPage>();
    renderList(vi.fn(() => first.promise));

    expect(screen.getByTestId("relation-list-skeleton").children).toHaveLength(6);

    await act(async () => first.resolve(page(["a", "b"])));

    expect(screen.queryByTestId("relation-list-skeleton")).toBeNull();
    expect(screen.getByText("User a")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /User b/ })).toHaveAttribute("href", "/@user.b");
    expect(screen.getByRole("button", { name: "Action a" })).toBeInTheDocument();
  });

  it("shows the empty state", async () => {
    renderList(vi.fn().mockResolvedValue(page([])));

    expect(await screen.findByText("Chưa chặn ai")).toBeInTheDocument();
    expect(screen.getByText("Những tài khoản bạn chặn sẽ xuất hiện ở đây.")).toBeInTheDocument();
  });

  it("debounces the search: one request after typing several characters within 300ms", async () => {
    const fetchPage = vi.fn<FetchPage>().mockResolvedValue(page(["a"]));
    renderList(fetchPage);
    await screen.findByText("User a");
    expect(fetchPage).toHaveBeenCalledTimes(1);

    const input = screen.getByRole("searchbox", { name: "Tìm theo tên hoặc @username" });
    await userEvent.type(input, "abc", { advanceTimers: vi.advanceTimersByTime });
    expect(fetchPage).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(2));
    expect(fetchPage).toHaveBeenLastCalledWith({ query: "abc", page: 1 });
  });

  it("shows a no-match message for a query without results", async () => {
    const fetchPage = vi.fn<FetchPage>().mockResolvedValueOnce(page(["a"])).mockResolvedValue(page([]));
    renderList(fetchPage);
    await screen.findByText("User a");

    await userEvent.type(screen.getByRole("searchbox"), "zzz", { advanceTimers: vi.advanceTimersByTime });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(await screen.findByText('Không tìm thấy ai khớp với "zzz"')).toBeInTheDocument();
  });

  it("loads the next page on demand and appends without duplicates", async () => {
    const fetchPage = vi.fn<FetchPage>().mockResolvedValueOnce(page(["a", "b"], 2)).mockResolvedValueOnce(page(["b", "c"]));
    renderList(fetchPage);
    await screen.findByText("User a");

    await userEvent.click(screen.getByRole("button", { name: "Xem thêm" }));

    expect(await screen.findByText("User c")).toBeInTheDocument();
    expect(fetchPage).toHaveBeenLastCalledWith({ query: "", page: 2 });
    expect(screen.getAllByText("User b")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Xem thêm" })).toBeNull();
  });

  it("shows an error with Retry and refetches the first page", async () => {
    const fetchPage = vi.fn<FetchPage>().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(page(["a"]));
    renderList(fetchPage);

    await userEvent.click(await screen.findByRole("button", { name: "Thử lại" }));

    expect(await screen.findByText("User a")).toBeInTheDocument();
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("keeps the rows and offers an inline retry when loading more fails", async () => {
    const fetchPage = vi.fn<FetchPage>().mockResolvedValueOnce(page(["a"], 2)).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(page(["b"]));
    renderList(fetchPage);
    await screen.findByText("User a");

    await userEvent.click(screen.getByRole("button", { name: "Xem thêm" }));
    await userEvent.click(await screen.findByRole("button", { name: "Thử lại" }));

    expect(await screen.findByText("User b")).toBeInTheDocument();
    expect(screen.getByText("User a")).toBeInTheDocument();
  });

  it("ignores the response of a previous query", async () => {
    const slow = deferred<FollowListPage>();
    const fetchPage = vi
      .fn<FetchPage>()
      .mockResolvedValueOnce(page(["initial"]))
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce(page(["fast"]));
    renderList(fetchPage);
    await screen.findByText("User initial");
    const input = screen.getByRole("searchbox");

    await userEvent.type(input, "a", { advanceTimers: vi.advanceTimersByTime });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    await userEvent.type(input, "b", { advanceTimers: vi.advanceTimersByTime });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(await screen.findByText("User fast")).toBeInTheDocument();

    await act(async () => slow.resolve(page(["stale"])));

    expect(screen.queryByText("User stale")).toBeNull();
    expect(screen.getByText("User fast")).toBeInTheDocument();
  });

  it("reloads the first page when reloadKey changes", async () => {
    const fetchPage = vi.fn<FetchPage>().mockResolvedValueOnce(page(["a"])).mockResolvedValueOnce(page(["b"]));
    const { rerender } = renderList(fetchPage, { reloadKey: 0 });
    await screen.findByText("User a");

    rerender(
      <RelationUserList
        fetchPage={fetchPage}
        renderAction={() => null}
        emptyTitle="relations.blockedEmptyTitle"
        emptyDescription="relations.blockedEmptyDescription"
        searchLabel="relations.searchPlaceholder"
        reloadKey={1}
      />,
    );

    expect(await screen.findByText("User b")).toBeInTheDocument();
    expect(screen.queryByText("User a")).toBeNull();
  });

  it("lets a row action remove its row optimistically and restore it at the same place", async () => {
    const undos = new Map<string, () => void>();
    renderList(vi.fn().mockResolvedValue(page(["a", "b", "c"])), {
      renderAction: (item, { removeRow }) => (
        <button type="button" onClick={() => undos.set(item.id, removeRow(item.id))}>
          Remove {item.id}
        </button>
      ),
    });
    await screen.findByText("User a");

    await userEvent.click(screen.getByRole("button", { name: "Remove a" }));
    expect(screen.queryByText("User a")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Remove b" }));
    expect(screen.queryByText("User b")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);

    act(() => undos.get("b")?.());

    const rows = screen.getAllByRole("listitem").map((row) => row.textContent);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain("User b");
    expect(rows[1]).toContain("User c");
  });
});
