import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as service from "../../services/post-service";
import { resetPostStore } from "../../store/post-store";
import { PostDetailContainer } from "./post-detail-container";

const push = vi.fn();
const back = vi.fn();
const notFound = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push, back }),
  notFound: () => notFound(),
}));

const WAIT = { timeout: 3000 };

beforeEach(() => {
  resetPostStore();
  service.__resetMockDb();
  vi.restoreAllMocks();
  push.mockClear();
  back.mockClear();
  notFound.mockClear();
});

describe("PostDetailContainer", () => {
  it("shows a skeleton, then the root post and its replies", async () => {
    const { container } = render(<PostDetailContainer postId="post-001" />);

    expect(container.querySelector(".animate-pulse")).not.toBeNull();
    expect(await screen.findByText(/Chào mừng các bạn đến với YSocial/, {}, WAIT)).toBeInTheDocument();
    expect(screen.getByText("Thread đầu tiên mình comment trên YSocial 🎉")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem thêm 1 câu trả lời" })).toHaveAttribute("href", "/posts/reply-001-02");
  });

  it("links a reply thread back to its parent", async () => {
    render(<PostDetailContainer postId="reply-001-02" />);

    const link = await screen.findByRole("link", { name: "Trả lời @antigravity.core" }, WAIT);
    expect(link).toHaveAttribute("href", "/posts/post-001");
  });

  it("calls notFound for an unknown id", async () => {
    render(<PostDetailContainer postId="khong-ton-tai" />);

    await waitFor(() => expect(notFound).toHaveBeenCalled(), WAIT);
  });

  it("shows an error with retry, then recovers", async () => {
    vi.spyOn(service, "fetchPostThread").mockRejectedValueOnce(new Error("boom"));
    render(<PostDetailContainer postId="post-001" />);

    await userEvent.click(await screen.findByRole("button", { name: "Thử lại" }, WAIT));

    expect(await screen.findByText(/Chào mừng các bạn đến với YSocial/, {}, WAIT)).toBeInTheDocument();
  });

  it("goes home when there is no history, back otherwise", async () => {
    render(<PostDetailContainer postId="post-001" />);
    const backButton = screen.getByRole("button", { name: "Quay lại" });

    await userEvent.click(backButton);
    expect(push).toHaveBeenCalledWith("/");

    window.history.pushState({}, "", "/posts/post-001");
    await userEvent.click(backButton);
    expect(back).toHaveBeenCalled();
  });
});
