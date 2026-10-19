import type { PostItem, PostRef } from "../types";

/** Operation target of a post: callers pass this so endpoint routing never relies on hidden store lookups. */
export const toPostRef = (post: Pick<PostItem, "id" | "kind" | "rootPostId">): PostRef => ({
  id: post.id,
  kind: post.kind,
  rootPostId: post.rootPostId,
});
