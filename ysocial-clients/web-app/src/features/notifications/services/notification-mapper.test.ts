import { describe, expect, it } from "vitest";
import type { NotificationDto, NotificationPageDto } from "../types";
import { toNotificationItem, toNotificationPage } from "./notification-mapper";

const SENDER = "22222222-2222-4222-8222-222222222222";
const TARGET = "33333333-3333-4333-8333-333333333333";

const dto = (overrides: Partial<NotificationDto> = {}): NotificationDto => ({
  id: "11111111-1111-4111-8111-111111111111",
  type: "NewLike",
  kind: "like",
  title: "New like",
  message: "someone liked your post",
  createdAt: "2026-10-16T10:00:00Z",
  isRead: false,
  targetId: TARGET,
  senderId: SENDER,
  senderName: "Sender Name",
  senderUsername: "sender",
  senderAvatar: null,
  ...overrides,
});

describe("toNotificationItem", () => {
  it("like & reply link to the target post", () => {
    expect(toNotificationItem(dto())).toMatchObject({ kind: "like", postId: TARGET, isRead: false, createdAt: "2026-10-16T10:00:00Z" });
    expect(toNotificationItem(dto({ type: "NewComment", kind: "reply" }))).toMatchObject({ kind: "reply", postId: TARGET });
  });

  it("NewFollow links to the sender profile & carries no post id", () => {
    const item = toNotificationItem(dto({ type: "NewFollow", kind: "follow", targetId: null }));
    expect(item).toMatchObject({ kind: "follow", type: "NewFollow", user: { id: SENDER, username: "sender", displayName: "Sender Name" } });
    expect(item.postId).toBeUndefined();
  });

  it("FollowRequested & FollowAccepted are follow kinds keeping their type", () => {
    expect(toNotificationItem(dto({ type: "FollowRequested", kind: null }))).toMatchObject({ kind: "follow", type: "FollowRequested" });
    expect(toNotificationItem(dto({ type: "FollowAccepted", kind: "follow" }))).toMatchObject({ kind: "follow", type: "FollowAccepted" });
  });

  it("unknown type & kind render generic with the BE message", () => {
    expect(toNotificationItem(dto({ type: "SomethingNew", kind: "weird", message: "hello" }))).toMatchObject({
      kind: "other",
      message: "hello",
    });
  });

  it("null sender fields tolerated, real items have no follow state", () => {
    const item = toNotificationItem(dto({ senderName: null, senderUsername: null, senderAvatar: null }));
    expect(item.user).toEqual({ id: SENDER, username: "", displayName: "", avatarUrl: undefined });
    expect(item.user.isFollowing).toBeUndefined();
  });

  it("missing id is a contract breach (ApiError)", () => {
    expect(() => toNotificationItem(dto({ id: undefined }))).toThrow(/missing id/);
  });
});

describe("toNotificationPage", () => {
  it("nextPage from hasNextPage & unreadCount", () => {
    const page: NotificationPageDto = { items: [dto()], page: 2, pageSize: 20, totalCount: 30, hasNextPage: true, unreadCount: 5 };
    expect(toNotificationPage(page)).toMatchObject({ nextPage: 3, unreadCount: 5 });
    expect(toNotificationPage({ ...page, hasNextPage: false }).nextPage).toBeUndefined();
  });

  it("null items -> empty list", () => {
    expect(toNotificationPage({ items: null })).toEqual({ items: [], nextPage: undefined, unreadCount: 0 });
  });
});
