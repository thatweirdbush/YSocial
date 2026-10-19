import { HttpTransportType, HubConnectionBuilder, LogLevel } from "@microsoft/signalr";
import type { components } from "@/lib/api/generated";
import { API_BASE_URL } from "./api-config";

/** Push payload = the HTTP list item (MAP §2.7): `type` (`NewLike`, `NewComment`, `NewFollow`, `FollowRequested`, `FollowAccepted`...) is a plain string. */
export type NotificationPayload = components["schemas"]["NotificationDto"];

/** The slice of `HubConnection` the hub uses (lets tests inject a fake). */
export interface HubConnectionLike {
  on(event: string, handler: (payload: NotificationPayload) => void): void;
  /** Fires when the connection is closed for good (also after `stop()`). */
  onclose(handler: () => void): void;
  /** Fires when the library's automatic reconnect succeeds. */
  onreconnected(handler: () => void): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/** Builds a connection whose `accessTokenFactory` is asked for the token on every (re)connect. */
export type HubConnectionFactory = (url: string, accessTokenFactory: () => string) => HubConnectionLike;

const HUB_URL = `${API_BASE_URL}/hubs/notifications`;

const buildSignalRConnection: HubConnectionFactory = (url, accessTokenFactory) =>
  new HubConnectionBuilder()
    .withUrl(url, { accessTokenFactory, skipNegotiation: true, transport: HttpTransportType.WebSockets })
    .withAutomaticReconnect()
    .configureLogging(LogLevel.Warning)
    .build();

const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 60_000;

export function createNotificationHub(factory: HubConnectionFactory = buildSignalRConnection) {
  let connection: HubConnectionLike | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  const handlers = new Set<(notification: NotificationPayload) => void>();
  const resumeHandlers = new Set<() => void>();
  const emitResume = () => resumeHandlers.forEach((handler) => handler());

  const cancelRetry = () => {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  };

  /** Exponential backoff (5s doubling, capped at 60s) for a failed start or a socket the library gave up on. */
  const scheduleRetry = (getAccessToken: () => string | null) => {
    cancelRetry();
    const delay = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS);
    attempt += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      api.start(getAccessToken);
    }, delay);
  };

  const api = {
    /**
     * Connects once, only while a token exists. `getAccessToken` is read on every (re)connect so a rotated token
     * is picked up. A failed start or a final close (automatic reconnect exhausted) drops the connection & retries
     * with backoff until `stop()`.
     */
    start(getAccessToken: () => string | null): void {
      cancelRetry();
      if (connection || !getAccessToken()) return;

      const next = factory(HUB_URL, () => getAccessToken() ?? "");
      next.on("ReceiveNotification", (payload) => handlers.forEach((handler) => handler(payload)));
      next.onclose(() => {
        // `stop()` clears `connection` first, so only an unexpected close retries
        if (connection !== next) return;
        connection = null;
        scheduleRetry(getAccessToken);
      });
      next.onreconnected(() => {
        if (connection === next) emitResume();
      });
      connection = next;
      next
        .start()
        .then(() => {
          if (connection !== next) return;
          // Pushes sent while the socket was down are gone: a retry that finally connects signals a catch-up
          const recovered = attempt > 0;
          attempt = 0;
          if (recovered) emitResume();
        })
        .catch((error: unknown) => {
          console.error("[SignalR] Connection start failed:", error);
          if (connection !== next) return;
          connection = null;
          scheduleRetry(getAccessToken);
        });
    },

    stop(): void {
      cancelRetry();
      attempt = 0;
      const current = connection;
      connection = null;
      void current?.stop().catch(() => undefined);
    },

    /** Subscribes to "socket is back after a gap" (library reconnect or successful retry); returns the unsubscribe function. */
    onResume(handler: () => void): () => void {
      resumeHandlers.add(handler);
      return () => resumeHandlers.delete(handler);
    },

    /** Subscribes to pushes; returns the unsubscribe function. */
    onNotification(handler: (notification: NotificationPayload) => void): () => void {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
  return api;
}

export const notificationHub = createNotificationHub();
export default notificationHub;
