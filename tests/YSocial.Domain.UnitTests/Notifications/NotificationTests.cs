using FluentAssertions;
using Microservice.BuildingBlocks.Domain.BusinessRules;
using Xunit;
using YSocial.Domain.Notifications;
using YSocial.Domain.Users;

namespace YSocial.Domain.UnitTests.Notifications;

public class NotificationTests
{
    private static readonly UserId Sender = UserId.New();
    private static readonly UserId Recipient = UserId.New();

    [Fact]
    public void Create_ShouldKeepTargetId()
    {
        var target = Guid.NewGuid();

        var notification = Notification.Create(Recipient, Sender, NotificationType.NewLike, "t", "c", target);

        notification.TargetId.Should().Be(target);
        notification.IsRead.Should().BeFalse();
    }

    [Fact]
    public void Create_ShouldThrow_WhenSenderIsRecipient()
    {
        var act = () => Notification.Create(Sender, Sender, NotificationType.NewLike, "t", "c");

        act.Should().Throw<BusinessRuleValidationException>();
    }

    [Fact]
    public void MarkAsRead_ShouldThrow_WhenNotRecipient()
    {
        var notification = Notification.Create(Recipient, Sender, NotificationType.NewLike, "t", "c");

        var act = () => notification.MarkAsRead(Sender);

        act.Should().Throw<BusinessRuleValidationException>();
        notification.IsRead.Should().BeFalse();
    }

    [Fact]
    public void MarkAsRead_ShouldBeIdempotent()
    {
        var notification = Notification.Create(Recipient, Sender, NotificationType.NewLike, "t", "c");

        notification.MarkAsRead(Recipient);
        var readAt = notification.ReadAt;
        notification.MarkAsRead(Recipient);

        notification.IsRead.Should().BeTrue();
        notification.ReadAt.Should().Be(readAt);
    }
}
