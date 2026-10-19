import { describe, expect, it } from "vitest";
import { ApiError, hasCode, isApiError, networkError, parseProblem } from "./api-error";

const json = (status: number, body: unknown, contentType = "application/problem+json") =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": contentType } });

describe("parseProblem", () => {
  it("parses ProblemDetails with code & traceId", async () => {
    const error = await parseProblem(
      json(409, { title: "Conflict", detail: "Email taken", status: 409, code: "EmailTaken", traceId: "abc" }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      kind: "http",
      status: 409,
      code: "EmailTaken",
      title: "Conflict",
      detail: "Email taken",
      traceId: "abc",
    });
  });

  it("parses validation errors map", async () => {
    const error = await parseProblem(
      json(400, { status: 400, code: "ValidationFailed", errors: { Email: ["bad"], Password: ["short", "weak"] } }),
    );
    expect(error.errors).toEqual({ Email: ["bad"], Password: ["short", "weak"] });
  });

  it("HTML body -> code Unknown, kind http", async () => {
    const error = await parseProblem(
      new Response("<html>502</html>", { status: 502, headers: { "content-type": "text/html" } }),
    );
    expect(error).toMatchObject({ kind: "http", status: 502, code: "Unknown" });
  });

  it("empty body -> code Unknown", async () => {
    const error = await parseProblem(new Response(null, { status: 500 }));
    expect(error).toMatchObject({ kind: "http", status: 500, code: "Unknown" });
  });

  it("JSON without code -> code Unknown, status from response", async () => {
    const error = await parseProblem(json(404, { title: "Not Found" }));
    expect(error).toMatchObject({ status: 404, code: "Unknown", title: "Not Found" });
  });
});

describe("networkError", () => {
  it("kind network status 0 code Network", () => {
    const cause = new TypeError("Failed to fetch");
    const error = networkError(cause);
    expect(error).toMatchObject({ kind: "network", status: 0, code: "Network" });
    expect(error.cause).toBe(cause);
  });
});

describe("guards", () => {
  it("isApiError detects instances only", () => {
    expect(isApiError(networkError(new Error("x")))).toBe(true);
    expect(isApiError(new Error("x"))).toBe(false);
    expect(isApiError({ code: "X" })).toBe(false);
  });

  it("hasCode false for non ApiError", () => {
    expect(hasCode({ code: "EmailTaken" }, "EmailTaken")).toBe(false);
    expect(hasCode(null, "EmailTaken")).toBe(false);
  });

  it("hasCode matches ApiError code", async () => {
    const error = await parseProblem(json(409, { code: "EmailTaken" }));
    expect(hasCode(error, "EmailTaken")).toBe(true);
    expect(hasCode(error, "UsernameTaken")).toBe(false);
  });
});
