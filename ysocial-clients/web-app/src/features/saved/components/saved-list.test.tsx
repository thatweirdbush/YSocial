import { render, screen } from "@testing-library/react";
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

  it("load failure shows an error state, not the empty state", async () => {
    vi.stubGlobal("fetch", mockFetchSequence([problem(500, "InternalError")]).fetchFn);
    render(<SavedList />);
    expect(await screen.findByText("Đã có lỗi xảy ra. Vui lòng thử lại!")).toBeInTheDocument();
    expect(screen.queryByText("Không có mục đã lưu nào")).not.toBeInTheDocument();
  });
});
