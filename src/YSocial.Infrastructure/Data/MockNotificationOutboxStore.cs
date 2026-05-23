using YSocial.Infrastructure.Notifications.Outbox;

namespace YSocial.Infrastructure.Data;

public class MockNotificationOutboxStore
{
    public List<NotificationOutboxMessage> Messages = MockDataStore.Messages;
}
