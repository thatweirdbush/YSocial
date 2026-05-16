using FluentAssertions;
using Xunit;
using YSocial.Domain.UserRelations.Rules;

namespace YSocial.Domain.UnitTests.UserRelations.Rules;

public sealed class TargetMustNotHaveBlockedObserverRuleTests
{
    [Fact]
    public void BrokenWhen_ShouldReturnTrue_WhenIsBlockedByTarget()
    {
        // Arrange
        var rule = new TargetMustNotHaveBlockedObserverRule(IsBlockedByTarget: true);

        // Assert
        rule.BrokenWhen.Should().BeTrue();
        rule.Message.Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public void BrokenWhen_ShouldReturnFalse_WhenNotBlockedByTarget()
    {
        // Arrange
        var rule = new TargetMustNotHaveBlockedObserverRule(IsBlockedByTarget: false);

        // Assert
        rule.BrokenWhen.Should().BeFalse();
    }
}
