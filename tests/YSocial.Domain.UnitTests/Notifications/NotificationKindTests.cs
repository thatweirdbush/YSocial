using FluentAssertions;
using Xunit;
using YSocial.Domain.Notifications;

namespace YSocial.Domain.UnitTests.Notifications;

public class NotificationKindTests
{
    [Fact]
    public void Of_MapsEveryType()
    {
        NotificationKind.Of(NotificationType.NewLike).Should().Be("like");
        NotificationKind.Of(NotificationType.NewComment).Should().Be("reply");
        NotificationKind.Of(NotificationType.NewFollow).Should().Be("follow");
        NotificationKind.Of(NotificationType.FollowRequested).Should().Be("follow");
        NotificationKind.Of(NotificationType.FollowAccepted).Should().Be("follow");
    }

    [Fact]
    public void Of_CoversAllDeclaredTypes()
    {
        NotificationType.GetAll().Should().OnlyContain(t => NotificationKind.Of(t) != null);
    }

    [Theory]
    [InlineData("like", true, "like")]
    [InlineData("LIKE", true, "like")]
    [InlineData("Reply", true, "reply")]
    [InlineData("follow", true, "follow")]
    [InlineData("mention", false, "")]
    [InlineData(" ", false, "")]
    [InlineData("", false, "")]
    [InlineData(null, false, "")]
    public void TryParse_IsCaseInsensitive(string? value, bool ok, string expected)
    {
        NotificationKind.TryParse(value, out var kind).Should().Be(ok);
        kind.Should().Be(expected);
    }
}
