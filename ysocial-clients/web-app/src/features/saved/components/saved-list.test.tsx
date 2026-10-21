import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/store/auth-store";
import { getMockPostById } from "@/features/posts";
import { mockFetchSequence, problem, setRealSlices, type MockStep } from "@/test/api-test-utils";
import { SavedList } from "./saved-list";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push, back: vi.fn() }),
}));

describe("SavedList", () => {
  it("links every saved card to an existing thread", async () => {
    render(<SavedList />);

    const commentButtons = screen.getAllByRole("button", { name: "Trả lời" });
    expect(commentButtons.length).toBeGreaterThan(0);
    for (const button of commentButtons) {
      await userEvent.click(button);
    }

    const ids = push.mock.calls.map(([path]) => String(path).replace("/posts/", ""));
    expect(ids).toHaveLength(commentButtons.length);
    for (const id of ids) {
      expect(getMockPostById(id), id).toBeDefined();
    }
  });
});

describe("SavedList (real BE)", () => {
  const ME = "0b8f1c52-6a3e-4c53-9b42-5f9d6f7a1e10";
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";
  const post = (id: string) => ({
    id,
    kind: "post",
    postId: id,
    content: `saved ${id.slice(0, 4)}`,
    createdAt: "2026-10-19T00:00:00Z",
    isEdited: false,
    likesCount: 1,
    commentsCount: 0,
    isLikedByCurrentUser: false,
    isBookmarkedByCurrentUser: true,
    user: { id: ME, username: "me", displayName: "Me", isVerified: false },
  });
  const page = (ids: string[], hasNextPage = false): MockStep => ({
    status: 200,
    body: { items: ids.map(post), page: 1, pageSize: 10, totalCount: ids.length, hasNextPage },
  });

  beforeEach(() => {
    setRealSlices("auth,content");
    localStorage.clear();
    useAuthStore.getState().actions.clearAuth();
    useAuthStore.getState().actions.setTokens("A1", "R1");
    useAuthStore.getState().actions.updateUser({ id: ME, email: "me@ysocial.dev", username: "me" });
    useAuthStore.setState({ hydrated: true });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("renders the BE saved posts (not the mock seeds)", async () => {
    const fake = mockFetchSequence([page([A, B])]);
    vi.stubGlobal("fetch", fake.fetchFn);
    render(<SavedList />);

    expect(await screen.findByText(`saved ${A.slice(0, 4)}`)).toBeInTheDocument();
    expect(screen.getByText(`saved ${B.slice(0, 4)}`)).toBeInTheDocument();
    expect(fake.calls[0].url).toContain("/api/saveditems/posts?page=1");
    expect(screen.queryByText(/Next.js App Router/)).not.toBeInTheDocument();
  });

  it("pages through every saved page", async () => {
    const fake = mockFetchSequence([page([A], true), page([B])]);
    vi.stubGlobal("fetch", fake.fetchFn);
    render(<SavedList />);

    expect(await screen.findByText(`saved ${B.slice(0, 4)}`)).toBeInTheDocument();
    expect(fake.calls).toHaveLength(2);
  });

  it("notes when the 10-page safety cap hides older saved posts", async () => {
    const steps = Array.from({ length: 10 }, (_, i) => page([`${i}`.repeat(8) + A.slice(8)], true));
    const fake = mockFetchSequence(steps);
    vi.stubGlobal("fetch", fake.fetchFn);
    render(<SavedList />);

    expect(await screen.findByText("Chỉ hiển thị 100 mục đã lưu gần nhất")).toBeInTheDocument();
    expect(fake.calls).toHaveLength(10);
  });

  it("does not note a cap for a short list", async () => {
    vi.stubGlobal("fetch", mockFetchSequence([page([A])]).fetchFn);
    render(<SavedList />);
    await screen.findByText(`saved ${A.slice(0, 4)}`);
    expect(screen.queryByText(/Chỉ hiển thị/)).not.toBeInTheDocument();
  });

  it("an account switch drops the previous viewer's saved items", async () => {
    vi.stubGlobal("fetch", mockFetchSequence([page([A]), page([B])]).fetchFn);
    render(<SavedList />);
    await screen.findByText(`saved ${A.slice(0, 4)}`);

    act(() => {
      useAuthStore.getState().actions.updateUser({ id: "33333333-3333-4333-8333-333333333333", email: "x@ysocial.dev", username: "x" });
    });

    expect(await screen.findByText(`saved ${B.slice(0, 4)}`)).toBeInTheDocument();
    expect(screen.queryByText(`saved ${A.slice(0, 4)}`)).not.toBeInTheDocument();
  });

  it("a late answer for the previous viewer is dropped after an account switch", async () => {
    let answerA!: (response: Response) => void;
    const fresh = mockFetchSequence([page([B])]);
    let calls = 0;
    vi.stubGlobal("fetch", ((...args: Parameters<typeof fetch>) => {
      calls += 1;
      return calls === 1 ? new Promise<Response>((resolve) => (answerA = resolve)) : fresh.fetchFn(...args);
    }) as typeof fetch);
    render(<SavedList />);

    act(() => {
      useAuthStore.getState().actions.updateUser({ id: "33333333-3333-4333-8333-333333333333", email: "x@ysocial.dev", username: "x" });
    });
    expect(await screen.findByText(`saved ${B.slice(0, 4)}`)).toBeInTheDocument();
    await act(async () => answerA(new Response(JSON.stringify({ items: [{ id: A }], page: 1, pageSize: 20, totalCount: 1, hasNextPage: false }), { status: 200, headers: { "content-type": "application/json" } })));

    expect(screen.queryByText(`saved ${A.slice(0, 4)}`)).not.toBeInTheDocument();
    expect(screen.getByText(`saved ${B.slice(0, 4)}`)).toBeInTheDocument();
  });

  it("logout empties the list instead of keeping the last viewer's items", async () => {
    vi.stubGlobal("fetch", mockFetchSequence([page([A])]).fetchFn);
    render(<SavedList />);
    await screen.findByText(`saved ${A.slice(0, 4)}`);

    act(() => useAuthStore.getState().actions.clearAuth());

    expect(await screen.findByText("Không có mục đã lưu nào")).toBeInTheDocument();
    expect(screen.queryByText(`saved ${A.slice(0, 4)}`)).not.toBeInTheDocument();
  });

  it("bulk unsave sends one DELETE per post and keeps the ones the BE refused", async () => {
    const fake = mockFetchSequence([page([A, B]), { status: 204 }, problem(500, "InternalError")]);
    vi.stubGlobal("fetch", fake.fetchFn);
    render(<SavedList />);
    await screen.findByText(`saved ${A.slice(0, 4)}`);

    // enter manage mode, select both rows, run bulk unsave
    await userEvent.click(screen.getByRole("button", { name: /Quản lý|Manage/ }));
    const boxes = screen.getAllByRole("button").filter((b) => b.className.includes("size-5 rounded-md"));
    for (const box of boxes) await userEvent.click(box);
    await userEvent.click(screen.getByRole("button", { name: /Xóa mục đã chọn/ }));

    await waitFor(() => expect(fake.calls.filter((c) => c.init?.method === "DELETE")).toHaveLength(2));
    expect(fake.calls.filter((c) => c.init?.method === "DELETE").map((c) => c.url).join(" ")).toMatch(/\/bookmark/);
    await waitFor(() => expect(screen.queryByText(`saved ${A.slice(0, 4)}`)).not.toBeInTheDocument(), { timeout: 2000 });
    expect(screen.getByText(`saved ${B.slice(0, 4)}`)).toBeInTheDocument();
  });

  it("load failure shows an error state, not the empty state", async () => {
    vi.stubGlobal("fetch", mockFetchSequence([problem(500, "InternalError")]).fetchFn);
    render(<SavedList />);
    expect(await screen.findByText("Đã có lỗi xảy ra. Vui lòng thử lại!")).toBeInTheDocument();
    expect(screen.queryByText("Không có mục đã lưu nào")).not.toBeInTheDocument();
  });
});
