import { beforeEach, describe, expect, it } from "vitest";
import { beginOp, bumpViewerGeneration, getMutationSeq, getViewerGeneration, isCurrentOp, resetOpLedger } from "./op-ledger";

beforeEach(() => {
  resetOpLedger();
});

describe("op-ledger", () => {
  it("versions ops per actor and target key", () => {
    const first = beginOp("v1", "u1");
    expect(isCurrentOp("v1", "u1", first)).toBe(true);

    const second = beginOp("v1", "u1");
    expect(second).toBe(first + 1);
    expect(isCurrentOp("v1", "u1", first)).toBe(false);
    expect(isCurrentOp("v1", "u1", second)).toBe(true);
  });

  it("never lets different targets or actors interfere", () => {
    const a = beginOp("v1", "u1");
    beginOp("v1", "u2");
    beginOp("v2", "u1");

    expect(isCurrentOp("v1", "u1", a)).toBe(true);
  });

  it("bumps the per-actor mutation sequence on every op", () => {
    expect(getMutationSeq("v1")).toBe(0);

    beginOp("v1", "u1");
    beginOp("v1", "u2");
    beginOp("v2", "u1");

    expect(getMutationSeq("v1")).toBe(2);
    expect(getMutationSeq("v2")).toBe(1);
  });

  it("bumps the viewer generation", () => {
    const before = getViewerGeneration();

    expect(bumpViewerGeneration()).toBe(before + 1);
    expect(getViewerGeneration()).toBe(before + 1);
  });

  it("clears everything on reset", () => {
    const version = beginOp("v1", "u1");
    bumpViewerGeneration();
    resetOpLedger();

    expect(getMutationSeq("v1")).toBe(0);
    expect(getViewerGeneration()).toBe(0);
    expect(isCurrentOp("v1", "u1", version)).toBe(false);
  });
});
