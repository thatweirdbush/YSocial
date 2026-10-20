using FluentAssertions;
using Xunit;
using YSocial.Domain.Countries;
using YSocial.Domain.Identities;
using YSocial.Domain.Notifications;
using YSocial.Domain.Users;

namespace YSocial.Domain.UnitTests.Notifications;

public class NotificationPreferencesTests
{
    [Fact]
    public void Default_AllowsEveryType()
    {
        var preferences = NotificationPreferences.Default();

        NotificationType.GetAll().Should().OnlyContain(t => preferences.Allows(t));
    }

    [Theory]
    [InlineData(false, true, true, "NewLike")]
    [InlineData(true, false, true, "NewComment")]
    [InlineData(true, true, false, "NewFollow")]
    [InlineData(true, true, false, "FollowRequested")]
    [InlineData(true, true, false, "FollowAccepted")]
    public void Allows_FalseOnlyForDisabledKind(bool likes, bool replies, bool follows, string typeName)
    {
        var preferences = new NotificationPreferences(likes, replies, follows);
        var type = NotificationType.GetAll().Single(t => t.Name == typeName);

        preferences.Allows(type).Should().BeFalse();
        NotificationType.GetAll()
            .Where(t => NotificationKind.Of(t) != NotificationKind.Of(type))
            .Should().OnlyContain(t => preferences.Allows(t));
    }

    [Fact]
    public void User_UpdateNotificationPreferences_Replaces()
    {
        var user = User.Create(new AccountId(Guid.NewGuid()), "someone", Country.Vietnam);

        user.UpdateNotificationPreferences(new NotificationPreferences(false, true, false));

        user.NotificationPreferences.Should().Be(new NotificationPreferences(false, true, false));
    }
}
