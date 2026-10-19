import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const freshModule = async () => {
  vi.resetModules();
  return import("./device-id");
};

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("getDeviceId", () => {
  it("is a UUID, stable across calls & persisted", async () => {
    const { getDeviceId } = await freshModule();
    const id = getDeviceId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(getDeviceId()).toBe(id);
    expect(localStorage.getItem("ysocial_device_id")).toBe(id);
  });

  it("reuses the persisted id after a reload", async () => {
    localStorage.setItem("ysocial_device_id", "11111111-1111-4111-8111-111111111111");
    const { getDeviceId } = await freshModule();
    expect(getDeviceId()).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("survives storage failure with a stable in-memory id", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { getDeviceId } = await freshModule();
    const id = getDeviceId();
    expect(id).toBeTruthy();
    expect(getDeviceId()).toBe(id);
  });
});
