using FluentAssertions;
using Xunit;
using YSocial.Domain.UserRelations.Rules;
using YSocial.Domain.Users;

namespace YSocial.Domain.UnitTests.UserRelations.Rules;

public sealed class CannotFollowYourselfRuleTests
{
    [Fact]
    public void BrokenWhen_ShouldReturnTrue_WhenObserverIdEqualsTargetId()
    {
        // Arrange
        var userId = new UserId(Guid.NewGuid());
        var rule = new CannotFollowYourselfRule(userId, userId);

        // Assert
        rule.BrokenWhen.Should().BeTrue();
        rule.Message.Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public void BrokenWhen_ShouldReturnFalse_WhenDifferentIds()
    {
        // Arrange
        var rule = new CannotFollowYourselfRule(
            new UserId(Guid.NewGuid()),
            new UserId(Guid.NewGuid()));

        // Assert
        rule.BrokenWhen.Should().BeFalse();
    }
}
