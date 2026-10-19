import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/store/auth-store";
import { resetRelationStore } from "@/features/profile/store/relation-store";
import { resetUserStore } from "@/features/profile/store/user-store";
import { mockFetchSequence, problem, setRealSlices, type MockStep } from "@/test/api-test-utils";
import { resetPostStore } from "../../store/post-store";
import { PostDetailContainer } from "./post-detail-container";

const notFound = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  notFound: () => notFound(),
}));

const WAIT = { timeout: 3000 };
const ME = "0b8f1c52-6a3e-4c53-9b42-5f9d6f7a1e10";
const ID = "11111111-1111-4111-8111-111111111111";
const thread = {
  post: {
    id: ID,
    kind: "post",
    postId: ID,
    content: "Bài của người theo dõi",
    createdAt: "2026-10-19T00:00:00Z",
    user: { id: "22222222-2222-4222-8222-222222222222", username: "author", displayName: "Author" },
  },
  parent: null,
  replies: [],
  childReplies: {},
};

function useFetch(steps: MockStep[]) {
  const fake = mockFetchSequence(steps);
  vi.stubGlobal("fetch", fake.fetchFn);
  return fake.calls;
}

beforeEach(() => {
  setRealSlices("auth,content");
  resetPostStore();
  resetUserStore();
  resetRelationStore();
  notFound.mockClear();
  localStorage.clear();
  useAuthStore.getState().actions.clearAuth();
  useAuthStore.setState({ hydrated: false });
});
afterEach(() => vi.unstubAllGlobals());

describe("PostDetailContainer (real BE)", () => {
  it("404 -> not-found state", async () => {
    useFetch([problem(404, "NotFound")]);
    useAuthStore.setState({ hydrated: true });
    render(<PostDetailContainer postId={ID} />);
    await waitFor(() => expect(notFound).toHaveBeenCalled(), WAIT);
  });

  it("network error -> error state with retry, not not-found", async () => {
    useFetch([{ status: 0, reject: new TypeError("Failed to fetch") }]);
    useAuthStore.setState({ hydrated: true });
    render(<PostDetailContainer postId={ID} />);
    expect(await screen.findByRole("button", { name: "Thử lại" }, WAIT)).toBeInTheDocument();
    expect(notFound).not.toHaveBeenCalled();
  });

  it("waits for auth hydration: a hard reload sends the viewer's token, never an anonymous 404", async () => {
    localStorage.setItem("ysocial_access_token", "A1");
    localStorage.setItem("ysocial_refresh_token", "R1");
    localStorage.setItem("ysocial_user", JSON.stringify({ id: ME, email: "me@ysocial.dev", username: "me" }));
    const calls = useFetch([{ status: 200, body: thread }]);
    render(<PostDetailContainer postId={ID} />);

    // not hydrated yet: nothing is requested, nothing is decided
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(calls).toHaveLength(0);
    expect(notFound).not.toHaveBeenCalled();

    act(() => useAuthStore.getState().actions.hydrate());

    expect(await screen.findByText("Bài của người theo dõi", {}, WAIT)).toBeInTheDocument();
    expect(new Headers(calls[0].init?.headers).get("Authorization")).toBe("Bearer A1");
    expect(notFound).not.toHaveBeenCalled();
  });
});
