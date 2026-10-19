import { describe, expect, it } from "vitest";
import { toPostRef } from "./post-ref";

describe("toPostRef", () => {
  it("derives kind & root for a root post", () => {
    expect(toPostRef({ id: "p1", kind: "post", rootPostId: "p1" })).toEqual({ id: "p1", kind: "post", rootPostId: "p1" });
  });

  it("keeps the root post id of a nested comment", () => {
    expect(toPostRef({ id: "c2", kind: "comment", rootPostId: "p1" })).toEqual({ id: "c2", kind: "comment", rootPostId: "p1" });
  });

  it("drops every other post field", () => {
    const ref = toPostRef({ id: "c2", kind: "comment", rootPostId: "p1", content: "x" } as never);
    expect(Object.keys(ref).sort()).toEqual(["id", "kind", "rootPostId"]);
  });
});
