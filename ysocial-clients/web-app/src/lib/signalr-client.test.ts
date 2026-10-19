import { describe, expect, it, vi } from "vitest";
import { API_BASE_URL } from "./api-config";
import { createNotificationHub, type HubConnectionLike, type NotificationPayload } from "./signalr-client";

function fakeConnection(overrides: Partial<HubConnectionLike> = {}) {
  const listeners = new Map<string, (payload: NotificationPayload) => void>();
  const connection: HubConnectionLike = {
    on: vi.fn((event, handler) => void listeners.set(event, handler)),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return { connection, emit: (payload: NotificationPayload) => listeners.get("ReceiveNotification")?.(payload) };
}

function setup(overrides: Partial<HubConnectionLike> = {}) {
  const fake = fakeConnection(overrides);
  const factory = vi.fn((_url: string, _tokenFactory: () => string) => fake.connection);
  return { ...fake, factory, hub: createNotificationHub(factory) };
}

describe("notification hub", () => {
  it("connects to the BE hub URL and starts the connection", () => {
    const { hub, factory, connection } = setup();
    hub.start(() => "A1");
    expect(factory.mock.calls[0][0]).toBe(`${API_BASE_URL}/hubs/notifications`);
    expect(connection.start).toHaveBeenCalledTimes(1);
    expect(connection.on).toHaveBeenCalledWith("ReceiveNotification", expect.any(Function));
  });

  it("token factory returns the latest token after rotation (reconnect picks it up)", () => {
    let token: string | null = "A1";
    const { hub, factory } = setup();
    hub.start(() => token);
    const tokenFactory = factory.mock.calls[0][1];
    expect(tokenFactory()).toBe("A1");
    token = "A2";
    expect(tokenFactory()).toBe("A2");
    token = null;
    expect(tokenFactory()).toBe("");
  });

  it("does not start without a token (not authenticated)", () => {
    const { hub, factory } = setup();
    hub.start(() => null);
    expect(factory).not.toHaveBeenCalled();
  });

  it("start twice builds one connection", () => {
    const { hub, factory } = setup();
    hub.start(() => "A1");
    hub.start(() => "A1");
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("stop closes the connection & allows a fresh start (logout -> login)", () => {
    const { hub, factory, connection } = setup();
    hub.start(() => "A1");
    hub.stop();
    expect(connection.stop).toHaveBeenCalledTimes(1);
    hub.start(() => "B1");
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("delivers payloads to every subscriber until unsubscribed", () => {
    const { hub, emit } = setup();
    const first = vi.fn();
    const second = vi.fn();
    const off = hub.onNotification(first);
    hub.onNotification(second);
    hub.start(() => "A1");
    emit({ id: "n1" });
    off();
    emit({ id: "n2" });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it("a failed first start is retried by the next start call", async () => {
    const { hub, factory } = setup({ start: vi.fn().mockRejectedValue(new Error("offline")) });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    hub.start(() => "A1");
    await Promise.resolve();
    await Promise.resolve();
    hub.start(() => "A1");
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
