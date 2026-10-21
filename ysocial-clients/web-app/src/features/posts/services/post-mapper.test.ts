import { describe, expect, it } from "vitest";
import type { PostDto, PostDtoPagedResponse, ThreadDto, UserPostsPageDto } from "../types";
import { toFeedPage, toPostItem, toPostThread, toUserPostsPage } from "./post-mapper";

const ID = "0b8f1c52-6a3e-4c53-9b42-5f9d6f7a1e10";
const ROOT = "11111111-1111-4111-8111-111111111111";
const AUTHOR = "22222222-2222-4222-8222-222222222222";

const dto = (overrides: Partial<PostDto> = {}): PostDto => ({
  id: ID,
  kind: "post",
  postId: ID,
  content: "hello",
  createdAt: "2026-10-19T00:00:00Z",
  isEdited: false,
  likesCount: 3,
  commentsCount: 1,
  isLikedByCurrentUser: true,
  isBookmarkedByCurrentUser: false,
  user: { id: AUTHOR, username: "demo", displayName: "Demo", avatarUrl: null, isVerified: true },
  ...overrides,
});

describe("toPostItem", () => {
  it("kind comment & parentId & rootPostId", () => {
    const item = toPostItem(dto({ id: "c1", kind: "comment", postId: ROOT, parentId: ROOT }));
    expect(item).toMatchObject({ id: "c1", kind: "comment", rootPostId: ROOT, parentId: ROOT });
  });

  it("kind null -> post", () => {
    expect(toPostItem(dto({ kind: null }))).toMatchObject({ kind: "post", rootPostId: ID });
  });

  it("imageUrl -> imageUrl + single imageUrls", () => {
    const item = toPostItem(dto({ imageUrl: "https://x/y.png" }));
    expect(item.imageUrl).toBe("https://x/y.png");
    expect(item.imageUrls).toEqual(["https://x/y.png"]);
  });

  describe("media (D33)", () => {
    const MEDIA_ID = "33333333-3333-4333-8333-333333333333";
    const media = (overrides: Record<string, unknown> = {}) => ({
      id: MEDIA_ID,
      kind: "image",
      url: "https://res.cloudinary.com/demo/image/upload/v1/a.jpg",
      posterUrl: null,
      width: 640,
      height: 480,
      durationSeconds: null,
      bytes: 1234,
      ...overrides,
    });

    it("maps media in order, nulls become undefined", () => {
      const item = toPostItem(dto({ media: [media(), media({ id: "44444444-4444-4444-8444-444444444444", kind: "video", url: "https://res.cloudinary.com/demo/video/upload/v1/a.mp4", posterUrl: "https://x/p.jpg", durationSeconds: 12.5 })] }));

      expect(item.media).toEqual([
        { id: MEDIA_ID, kind: "image", url: "https://res.cloudinary.com/demo/image/upload/v1/a.jpg", width: 640, height: 480 },
        {
          id: "44444444-4444-4444-8444-444444444444",
          kind: "video",
          url: "https://res.cloudinary.com/demo/video/upload/v1/a.mp4",
          posterUrl: "https://x/p.jpg",
          width: 640,
          height: 480,
          durationSeconds: 12.5,
        },
      ]);
    });

    it("with media, imageUrl stays (first uploaded image) but imageUrls is not duplicated", () => {
      const item = toPostItem(dto({ imageUrl: "https://res.cloudinary.com/demo/image/upload/v1/a.jpg", media: [media()] }));

      expect(item.imageUrl).toBe("https://res.cloudinary.com/demo/image/upload/v1/a.jpg");
      expect(item.imageUrls).toBeUndefined();
    });

    it("drops a malformed item (unknown kind, no url) and keeps the rest", () => {
      const item = toPostItem(dto({ media: [media({ kind: "audio" }), media({ url: null }), media()] }));

      expect(item.media).toHaveLength(1);
    });

    it("an empty or absent media array leaves no media field", () => {
      expect(toPostItem(dto({ media: [] })).media).toBeUndefined();
      expect(toPostItem(dto()).media).toBeUndefined();
    });
  });

  it("omitted imageUrl/parentId stay undefined", () => {
    const item = toPostItem(dto());
    expect(item.imageUrl).toBeUndefined();
    expect(item.imageUrls).toBeUndefined();
    expect(item.parentId).toBeUndefined();
  });

  it("visibility followersOnly/private preserved, unknown string -> private, null -> undefined", () => {
    expect(toPostItem(dto({ visibility: "followersOnly" })).visibility).toBe("followersOnly");
    expect(toPostItem(dto({ visibility: "private" })).visibility).toBe("private");
    expect(toPostItem(dto({ visibility: "public" })).visibility).toBe("public");
    expect(toPostItem(dto({ visibility: "mystery" })).visibility).toBe("private");
    expect(toPostItem(dto({ visibility: null })).visibility).toBeUndefined();
  });

  it("null content/displayName tolerated", () => {
    const item = toPostItem(dto({ content: null, user: { id: AUTHOR, username: null, displayName: null, isVerified: false } }));
    expect(item.content).toBe("");
    expect(item.user).toMatchObject({ id: AUTHOR, displayName: "", username: "" });
  });

  it("author avatarUrl null -> undefined, flags & counts copied", () => {
    const item = toPostItem(dto({ isEdited: true }));
    expect(item.user.avatarUrl).toBeUndefined();
    expect(item).toMatchObject({
      isEdited: true,
      likesCount: 3,
      commentsCount: 1,
      isLikedByCurrentUser: true,
      isBookmarkedByCurrentUser: false,
    });
  });
});

describe("toPostThread", () => {
  it("maps post, replies & child replies; parent null preserved as undefined", () => {
    const reply = dto({ id: "c1", kind: "comment", postId: ID, parentId: ID });
    const child = dto({ id: "c2", kind: "comment", postId: ID, parentId: "c1" });
    const thread = { post: dto(), parent: null, replies: [reply], childReplies: { c1: [child] } } as unknown as ThreadDto;
    const mapped = toPostThread(thread);
    expect(mapped.post.id).toBe(ID);
    expect(mapped.parent).toBeUndefined();
    expect(mapped.replies.map((r) => r.id)).toEqual(["c1"]);
    expect(mapped.childReplies.c1.map((r) => r.id)).toEqual(["c2"]);
  });

  it("null replies/childReplies -> empty", () => {
    const mapped = toPostThread({ post: dto(), parent: dto({ id: "p0", postId: "p0" }), replies: null, childReplies: null } as unknown as ThreadDto);
    expect(mapped.replies).toEqual([]);
    expect(mapped.childReplies).toEqual({});
    expect(mapped.parent?.id).toBe("p0");
  });
});

describe("malformed DTOs", () => {
  it("missing id / postId / createdAt / user.id throws", () => {
    expect(() => toPostItem(dto({ id: undefined }))).toThrow(/missing id/);
    expect(() => toPostItem(dto({ postId: undefined }))).toThrow(/missing postId/);
    expect(() => toPostItem(dto({ createdAt: undefined }))).toThrow(/missing createdAt/);
    expect(() => toPostItem(dto({ user: undefined }))).toThrow(/missing user.id/);
  });

  it("missing counts/flags default to 0/false", () => {
    const item = toPostItem(dto({ likesCount: undefined, isLikedByCurrentUser: undefined, isEdited: undefined }));
    expect(item).toMatchObject({ likesCount: 0, isLikedByCurrentUser: false, isEdited: false });
  });
});

describe("pages", () => {
  it("toFeedPage nextPage from hasNextPage", () => {
    const base: PostDtoPagedResponse = { items: [dto()], page: 2, pageSize: 10, totalCount: 30, hasNextPage: true };
    expect(toFeedPage(base)).toMatchObject({ nextPage: 3 });
    expect(toFeedPage({ ...base, hasNextPage: false }).nextPage).toBeUndefined();
    expect(toFeedPage({ ...base, items: null }).posts).toEqual([]);
  });

  it("toUserPostsPage keeps locked, no parents", () => {
    const base: UserPostsPageDto = { items: [], page: 1, pageSize: 10, totalCount: 0, hasNextPage: false, locked: true };
    expect(toUserPostsPage(base)).toEqual({ posts: [], parents: [], nextPage: undefined, locked: true });
    expect(toUserPostsPage({ ...base, locked: false, items: [dto()], hasNextPage: true }).nextPage).toBe(2);
  });
});

describe("one malformed item never fails the whole page", () => {
  const bad = dto({ id: undefined });

  it("feed & profile pages drop the broken item and keep the rest", () => {
    const ok = dto();
    const page = { items: [bad, ok], page: 1, pageSize: 10, totalCount: 2, hasNextPage: false };
    expect(toFeedPage(page).posts.map((p) => p.id)).toEqual([ID]);
    expect(toUserPostsPage({ ...page, locked: false }).posts.map((p) => p.id)).toEqual([ID]);
  });

  it("thread replies & child replies drop broken items, a null child list is empty", () => {
    const reply = dto({ id: "c1", kind: "comment", postId: ID, parentId: ID });
    const mapped = toPostThread({
      post: dto(),
      replies: [bad, reply],
      childReplies: { c1: [bad, dto({ id: "c2", kind: "comment", postId: ID, parentId: "c1" })], c9: null },
    } as unknown as ThreadDto);
    expect(mapped.replies.map((r) => r.id)).toEqual(["c1"]);
    expect(mapped.childReplies.c1.map((r) => r.id)).toEqual(["c2"]);
    expect(mapped.childReplies.c9).toEqual([]);
  });

  it("the thread's own post stays strict", () => {
    expect(() => toPostThread({ post: bad } as ThreadDto)).toThrow(/missing id/);
  });
});