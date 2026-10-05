import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/store/auth-store";
import * as service from "../../services/post-service";
import { resetPostStore, usePostStore } from "../../store/post-store";
import type { PostItem } from "../../types";
import { ReplyComposer } from "./reply-composer";
import { ReplyList } from "./reply-list";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, back: vi.fn() }),
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), info: vi.fn(), error: (...args: unknown[]) => toastError(...args) },
}));

const WAIT = { timeout: 3000 };

const parent: PostItem = {
  id: "post-001",
  content: "bài gốc",
  createdAt: new Date().toISOString(),
  likesCount: 0,
  commentsCount: 1,
  isLikedByCurrentUser: false,
  isBookmarkedByCurrentUser: false,
  user: { id: "author-04", displayName: "Minh Thư", username: "minh" },
};
const existingReply: PostItem = { ...parent, id: "reply-old", parentId: "post-001", content: "reply cũ", commentsCount: 0 };

function renderThread() {
  return render(
    <>
      <ReplyComposer parentId="post-001" replyToUsername="minh" />
      <ReplyList parentId="post-001" />
    </>,
  );
}

async function openAndType(text: string) {
  await userEvent.click(screen.getByRole("button", { name: "Trả lời @minh…" }));
  const textbox = await screen.findByPlaceholderText("Trả lời @minh…");
  await userEvent.type(textbox, text);
  return textbox;
}

/** Composer submit; scoped to the form because reply cards also have "Trả lời" comment buttons. */
const submitButton = () =>
  within(screen.getByPlaceholderText("Trả lời @minh…").closest("form")!).getByRole("button", { name: "Trả lời" });

const commentsCount = () => usePostStore.getState().posts["post-001"].commentsCount;

beforeEach(() => {
  resetPostStore();
  service.__resetMockDb();
  push.mockClear();
  toastError.mockClear();
  const { upsertPosts, setReplies } = usePostStore.getState().actions;
  upsertPosts([parent, existingReply]);
  setReplies("post-001", ["reply-old"]);
  useAuthStore.setState({
    isAuthenticated: true,
    user: { id: "me-1", email: "me@ysocial.app", username: "me", displayName: "Tôi" },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  useAuthStore.setState({ isAuthenticated: false, user: null });
});

describe("ReplyComposer", () => {
  it("asks guests to log in", async () => {
    useAuthStore.setState({ isAuthenticated: false, user: null });
    renderThread();

    await userEvent.click(screen.getByRole("button", { name: "Đăng nhập để trả lời" }));

    expect(push).toHaveBeenCalledWith("/login");
  });

  it("moves focus into the textarea when expanded", async () => {
    renderThread();

    await userEvent.click(screen.getByRole("button", { name: "Trả lời @minh…" }));

    expect(await screen.findByPlaceholderText("Trả lời @minh…")).toHaveFocus();
  });

  it("collapses on Escape when empty and returns focus to the bar", async () => {
    renderThread();
    await userEvent.click(screen.getByRole("button", { name: "Trả lời @minh…" }));
    await screen.findByPlaceholderText("Trả lời @minh…");

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByPlaceholderText("Trả lời @minh…")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Trả lời @minh…" })).toHaveFocus();
  });

  it("keeps the composer and text on Escape when there is content", async () => {
    renderThread();
    const textbox = await openAndType("đang gõ");

    await userEvent.keyboard("{Escape}");

    expect(textbox).toBeInTheDocument();
    expect(textbox).toHaveValue("đang gõ");
  });

  it("posts a reply to the top of the thread and collapses", async () => {
    renderThread();

    await openAndType("xin chào");
    await userEvent.click(submitButton());

    await waitFor(() => {
      const articles = screen.getAllByRole("article");
      expect(within(articles[0]).getByText("xin chào")).toBeInTheDocument();
    }, WAIT);
    await waitFor(() => expect(screen.queryByPlaceholderText("Trả lời @minh…")).not.toBeInTheDocument(), WAIT);
    expect(commentsCount()).toBe(2);
  });

  it("keeps the optimistic reply non-interactive until the server confirms it", async () => {
    let resolve!: (reply: PostItem) => void;
    vi.spyOn(service, "createReply").mockReturnValue(new Promise((r) => { resolve = r; }));
    renderThread();

    await openAndType("xin chào");
    await userEvent.click(submitButton());

    const pending = screen.getByText("xin chào").closest("article");
    expect(pending).toHaveAttribute("inert");

    resolve({ ...existingReply, id: "reply-new", content: "xin chào" });
    await waitFor(() => expect(screen.getByText("xin chào").closest("article")).not.toHaveAttribute("inert"), WAIT);
  });

  it("submits once when clicked twice", async () => {
    const spy = vi.spyOn(service, "createReply");
    renderThread();

    await openAndType("xin chào");
    const submit = submitButton();
    await userEvent.click(submit);
    await userEvent.click(submit);

    await waitFor(() => expect(screen.queryByPlaceholderText("Trả lời @minh…")).not.toBeInTheDocument(), WAIT);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(commentsCount()).toBe(2);
  });

  it("rolls back and keeps text on failure", async () => {
    vi.spyOn(service, "createReply").mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderThread();

    const textbox = await openAndType("xin chào");
    await userEvent.click(submitButton());

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Không gửi được câu trả lời"), WAIT);
    expect(commentsCount()).toBe(1);
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(textbox).toHaveValue("xin chào");
  });
});
