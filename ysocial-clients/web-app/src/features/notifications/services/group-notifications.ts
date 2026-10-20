import type { NotificationItemData } from "../types";

/** A like joins the open group of its post when it is at most this much older than the group's newest member. */
export const GROUP_WINDOW_MS = 24 * 60 * 60 * 1000;

export type NotificationRow =
  | { type: "item"; key: string; item: NotificationItemData }
  /** Likes of one post inside the window, newest first; at least 2 members, all of them LOADED ones. */
  | { type: "likeGroup"; key: string; items: NotificationItemData[] };

const time = (item: NotificationItemData): number => new Date(item.createdAt).getTime() || 0;

/**
 * Collapses likes of the same post into one row ("X and N others liked"). Pure: call it on the CURRENT list so pages
 * and pushes regroup by themselves. Input is newest first (store order). A group is anchored on its newest member (it
 * sits there, its key is that member's id) and takes older likes up to `GROUP_WINDOW_MS` later; the next older like
 * opens a new group. N is the number of loaded members, never the post's real like total.
 */
export function groupNotifications(items: readonly NotificationItemData[]): NotificationRow[] {
  const rows: Array<{ newest: NotificationItemData; members: NotificationItemData[] } | NotificationItemData> = [];
  const open = new Map<string, { newest: NotificationItemData; members: NotificationItemData[] }>();

  for (const item of items) {
    if (item.kind !== "like" || !item.postId) {
      rows.push(item);
      continue;
    }
    const group = open.get(item.postId);
    if (group && time(group.newest) - time(item) <= GROUP_WINDOW_MS) {
      group.members.push(item);
      continue;
    }
    const next = { newest: item, members: [item] };
    open.set(item.postId, next);
    rows.push(next);
  }

  return rows.map((row): NotificationRow => {
    if ("members" in row) {
      return row.members.length > 1
        ? { type: "likeGroup", key: `like:${row.newest.id}`, items: row.members }
        : { type: "item", key: row.newest.id, item: row.newest };
    }
    return { type: "item", key: row.id, item: row };
  });
}
