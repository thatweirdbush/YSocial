import { useAuthStore } from "@/features/auth/store/auth-store";

// Use standard relative import path from node_modules if needed, microsoft-signalr is installed
import { HubConnection, HubConnectionBuilder, HttpTransportType, LogLevel } from "@microsoft/signalr";

const HUB_URL = "https://localhost:49895/hubs/notifications";

export interface NotificationPayload {
  id: string;
  type: "NewLike" | "NewComment" | "NewFollow" | string;
  title: string;
  message: string;
  createdAt: string;
  isRead: boolean;
  targetId?: string;
  senderName?: string;
  senderAvatar?: string;
}

export class NotificationHubClient {
  private connection: HubConnection | null = null;
  private onNotificationReceived: ((notification: NotificationPayload) => void) | null = null;

  public start(onReceived: (notification: NotificationPayload) => void) {
    if (this.connection) return;

    this.onNotificationReceived = onReceived;

    this.connection = new HubConnectionBuilder()
      .withUrl(HUB_URL, {
        // Dynamic access token factory to ensure auto-reconnect picks up rotated tokens
        accessTokenFactory: () => {
          const token = useAuthStore.getState().accessToken;
          return token || "";
        },
        skipNegotiation: true,
        transport: HttpTransportType.WebSockets,
      })
      .withAutomaticReconnect() // Explicit automatic reconnect activation
      .configureLogging(LogLevel.Warning)
      .build();

    // Event listener mapping to backend hub event
    this.connection.on("ReceiveNotification", (notification: any) => {
      if (this.onNotificationReceived) {
        this.onNotificationReceived(notification as NotificationPayload);
      }
    });

    this.connection
      .start()
      .then(() => {
        console.log("[SignalR] Connected to YSocial notifications hub.");
      })
      .catch((err) => {
        console.error("[SignalR] Connection start failed:", err);
      });
  }

  public stop() {
    if (this.connection) {
      this.connection.stop().then(() => {
        console.log("[SignalR] Connection stopped.");
      });
      this.connection = null;
    }
  }
}

export const notificationHub = new NotificationHubClient();
export default notificationHub;
