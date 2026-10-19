import { describe, expect, it, vi } from "vitest";
import { API_BASE_URL } from "./api-config";
import { createNotificationHub, type HubConnectionLike, type NotificationPayload } from "./signalr-client";

function fakeConnection(overrides: Partial<HubConnectionLike> = {}) {
  const listeners = new Map<string, (payload: NotificationPayload) => void>();
  let closeHandler: () => void = () => undefined;
  let reconnectedHandler: () => void = () => undefined;
  const connection: HubConnectionLike = {
    on: vi.fn((event, handler) => void listeners.set(event, handler)),
    onclose: vi.fn((handler) => void (closeHandler = handler)),
    onreconnected: vi.fn((handler) => void (reconnectedHandler = handler)),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return {
    connection,
    emit: (payload: NotificationPayload) => listeners.get("ReceiveNotification")?.(payload),
    close: () => closeHandler(),
    reconnect: () => reconnectedHandler(),
  };
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

  describe("self-healing", () => {
    const flush = async () => {
      await Promise.resolve();
      await Promise.resolve();
    };

    function setupSequence() {
      const fakes: ReturnType<typeof fakeConnection>[] = [];
      const factory = vi.fn(() => {
        const fake = fakeConnection();
        fakes.push(fake);
        return fake.connection;
      });
      return { fakes, factory, hub: createNotificationHub(factory) };
    }

    it("rebuilds the connection with backoff after the automatic reconnect gives up", () => {
      vi.useFakeTimers();
      const { hub, fakes, factory } = setupSequence();
      hub.start(() => "A1");
      fakes[0].close();
      expect(factory).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(5_000);
      expect(factory).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });

    it("retries a failed first start without another start call, doubling the delay", async () => {
      vi.useFakeTimers();
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const factory = vi.fn(() => fakeConnection({ start: vi.fn().mockRejectedValue(new Error("offline")) }).connection);
      const hub = createNotificationHub(factory);
      hub.start(() => "A1");
      await flush();
      vi.advanceTimersByTime(5_000);
      expect(factory).toHaveBeenCalledTimes(2);
      await flush();
      vi.advanceTimersByTime(5_000);
      expect(factory).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(5_000);
      expect(factory).toHaveBeenCalledTimes(3);
      hub.stop();
      vi.useRealTimers();
    });

    it("stop cancels a pending retry & an intentional stop never retries", () => {
      vi.useFakeTimers();
      const { hub, fakes, factory } = setupSequence();
      hub.start(() => "A1");
      fakes[0].close();
      hub.stop();
      vi.advanceTimersByTime(60_000);
      expect(factory).toHaveBeenCalledTimes(1);
      hub.start(() => "B1");
      hub.stop();
      fakes[1].close();
      vi.advanceTimersByTime(60_000);
      expect(factory).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });

    it("signals resume after the library reconnects or a retry succeeds, never for the first connect", async () => {
      vi.useFakeTimers();
      const { hub, fakes } = setupSequence();
      const resumed = vi.fn();
      hub.onResume(resumed);
      hub.start(() => "A1");
      await flush();
      expect(resumed).not.toHaveBeenCalled();

      fakes[0].reconnect();
      expect(resumed).toHaveBeenCalledTimes(1);

      fakes[0].close();
      vi.advanceTimersByTime(5_000);
      await flush();
      expect(resumed).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });

    it("onResume unsubscribes", async () => {
      const { hub, fakes } = setupSequence();
      const resumed = vi.fn();
      hub.onResume(resumed)();
      hub.start(() => "A1");
      fakes[0].reconnect();
      expect(resumed).not.toHaveBeenCalled();
    });

    it("does not retry once the token is gone", () => {
      vi.useFakeTimers();
      let token: string | null = "A1";
      const { hub, fakes, factory } = setupSequence();
      hub.start(() => token);
      fakes[0].close();
      token = null;
      vi.advanceTimersByTime(60_000);
      expect(factory).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });
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
