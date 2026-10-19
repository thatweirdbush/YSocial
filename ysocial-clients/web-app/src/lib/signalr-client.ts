import { HttpTransportType, HubConnectionBuilder, LogLevel } from "@microsoft/signalr";
import type { components } from "@/lib/api/generated";
import { API_BASE_URL } from "./api-config";

/** Push payload = the HTTP list item (MAP §2.7): `type` (`NewLike`, `NewComment`, `NewFollow`, `FollowRequested`, `FollowAccepted`...) is a plain string. */
export type NotificationPayload = components["schemas"]["NotificationDto"];

/** The slice of `HubConnection` the hub uses (lets tests inject a fake). */
export interface HubConnectionLike {
  on(event: string, handler: (payload: NotificationPayload) => void): void;
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

export function createNotificationHub(factory: HubConnectionFactory = buildSignalRConnection) {
  let connection: HubConnectionLike | null = null;
  const handlers = new Set<(notification: NotificationPayload) => void>();

  return {
    /**
     * Connects once, only while a token exists. `getAccessToken` is read on every (re)connect so a rotated token
     * is picked up; a failed first start is dropped so the next call retries.
     */
    start(getAccessToken: () => string | null): void {
      if (connection || !getAccessToken()) return;

      const next = factory(HUB_URL, () => getAccessToken() ?? "");
      next.on("ReceiveNotification", (payload) => handlers.forEach((handler) => handler(payload)));
      connection = next;
      next.start().catch((error: unknown) => {
        console.error("[SignalR] Connection start failed:", error);
        if (connection === next) connection = null;
      });
    },

    stop(): void {
      const current = connection;
      connection = null;
      void current?.stop().catch(() => undefined);
    },

    /** Subscribes to pushes; returns the unsubscribe function. */
    onNotification(handler: (notification: NotificationPayload) => void): () => void {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
}

export const notificationHub = createNotificationHub();
export default notificationHub;
