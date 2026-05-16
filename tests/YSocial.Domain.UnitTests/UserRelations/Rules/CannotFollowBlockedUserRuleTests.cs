using FluentAssertions;
using Xunit;
using YSocial.Domain.UserRelations.Rules;

namespace YSocial.Domain.UnitTests.UserRelations.Rules;

public sealed class CannotFollowBlockedUserRuleTests
{
    [Fact]
    public void BrokenWhen_ShouldReturnTrue_WhenHasBlockedTarget()
    {
        // Arrange
        var rule = new CannotFollowBlockedUserRule(HasBlockedTarget: true);

        // Assert
        rule.BrokenWhen.Should().BeTrue();
        rule.Message.Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public void BrokenWhen_ShouldReturnFalse_WhenHasNotBlockedTarget()
    {
        // Arrange
        var rule = new CannotFollowBlockedUserRule(HasBlockedTarget: false);

        // Assert
        rule.BrokenWhen.Should().BeFalse();
    }
}
