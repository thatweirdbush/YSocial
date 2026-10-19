import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** Contract guard: every endpoint & schema FE adapters rely on must exist in the BE swagger copy (`docs/swagger.json`). */
interface Swagger {
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
}
const swagger = JSON.parse(readFileSync(resolve(process.cwd(), "docs/swagger.json"), "utf8")) as Swagger;

const USED_ENDPOINTS: Array<[method: string, path: string]> = [
  ["post", "/api/identities/register"],
  ["post", "/api/identities/login"],
  ["post", "/api/identities/refresh-token"],
  ["post", "/api/identities/logout"],
  ["post", "/api/identities/forgot-password"],
  ["post", "/api/identities/reset-password"],
  ["get", "/api/users/me"],
  ["get", "/api/users/{id}"],
  ["get", "/api/users/by-username/{username}"],
  ["get", "/api/users/{id}/followers"],
  ["get", "/api/users/{id}/following"],
  ["get", "/api/users/me/follow-requests"],
  ["get", "/api/users/me/follow-requests/count"],
  ["get", "/api/users/me/relation-sets"],
  ["get", "/api/users/me/blocks"],
  ["get", "/api/users/me/mutes"],
  ["put", "/api/users/profiles/me"],
  ["put", "/api/users/profiles/me/privacy"],
  ["post", "/api/posts"],
  ["get", "/api/posts/{id}"],
  ["put", "/api/posts/{id}"],
  ["delete", "/api/posts/{id}"],
  ["get", "/api/posts/user/{userId}"],
  ["get", "/api/threads/{id}"],
  ["post", "/api/comments"],
  ["put", "/api/comments/{id}"],
  ["delete", "/api/comments/{id}"],
  ["put", "/api/posts/{id}/like"],
  ["delete", "/api/posts/{id}/like"],
  ["put", "/api/comments/{id}/like"],
  ["delete", "/api/comments/{id}/like"],
  ["put", "/api/posts/{id}/bookmark"],
  ["delete", "/api/posts/{id}/bookmark"],
  ["put", "/api/comments/{id}/bookmark"],
  ["delete", "/api/comments/{id}/bookmark"],
  ["get", "/api/saveditems/posts"],
  ["post", "/api/users/{targetId}/relations/follow"],
  ["delete", "/api/users/{targetId}/relations/follow"],
  ["patch", "/api/users/{targetId}/relations/close-friend"],
  ["post", "/api/users/{targetId}/relations/follow-request"],
  ["put", "/api/users/{targetId}/relations/mute"],
  ["delete", "/api/users/{targetId}/relations/mute"],
  ["post", "/api/users/{targetId}/blocks"],
  ["delete", "/api/users/{targetId}/blocks"],
  ["get", "/api/feed"],
  ["get", "/api/notifications"],
  ["get", "/api/notifications/unread-count"],
  ["put", "/api/notifications/{id}/read"],
  ["put", "/api/notifications/read-all"],
];

const REQUIRED_SCHEMAS = [
  "PostDto",
  "ThreadDto",
  "MeDto",
  "LoginResponse",
  "RefreshTokenRequest",
  "RegisterAccountResponse",
  "RespondFollowRequestRequest",
  "UpdatePrivacyRequest",
  "PostDtoPagedResponse",
  "UserProfileDtoPagedResponse",
  "FollowListPageDto",
  "UserPostsPageDto",
  "NotificationPageDto",
];

describe("swagger contract", () => {
  it.each(USED_ENDPOINTS)("endpoint %s %s exists", (method, path) => {
    expect(swagger.paths[path], `missing path ${path}`).toBeDefined();
    expect(swagger.paths[path][method], `missing ${method.toUpperCase()} ${path}`).toBeDefined();
  });

  it.each(REQUIRED_SCHEMAS)("schema %s exists", (name) => {
    expect(swagger.components.schemas[name], `missing schema ${name}`).toBeDefined();
  });

  it("PostDto has kind, postId, parentId", () => {
    expect(Object.keys(swagger.components.schemas.PostDto.properties ?? {})).toEqual(
      expect.arrayContaining(["kind", "postId", "parentId"]),
    );
  });

  it("NotificationDto has senderUsername", () => {
    expect(Object.keys(swagger.components.schemas.NotificationDto.properties ?? {})).toContain("senderUsername");
  });
});
