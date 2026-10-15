using FluentAssertions;
using NSubstitute;
using Xunit;
using YSocial.Domain.Identities;
using YSocial.Domain.Users;

namespace YSocial.Domain.UnitTests.Identities;

public class AccountTests
{
    private static Account NewAccount() => Account.Create("user@example.com", null, PasswordHash.Create("hash"));

    [Fact]
    public void AddRefreshToken_SixthActive_EvictsOldest()
    {
        var account = NewAccount();
        var tokens = Enumerable.Range(1, 5).Select(i => account.AddRefreshToken($"d{i}", UserId.New())).ToList();

        var sixth = account.AddRefreshToken("d6", UserId.New());

        account.RefreshTokens.Count(t => t.IsActive).Should().Be(5);
        tokens[0].IsActive.Should().BeFalse();
        tokens.Skip(1).Should().OnlyContain(t => t.IsActive);
        sixth.IsActive.Should().BeTrue();
    }

    [Fact]
    public void AddRefreshToken_ManyLogins_NeverMoreThanFiveActive()
    {
        var account = NewAccount();

        for (var i = 0; i < 25; i++)
        {
            account.AddRefreshToken($"d{i}", UserId.New());
            account.RefreshTokens.Count(t => t.IsActive).Should().BeLessThanOrEqualTo(5);
        }
    }

    [Fact]
    public void VerifyPassword_ReflectsHasher()
    {
        var account = NewAccount();
        var hasher = Substitute.For<IPasswordHasher>();
        hasher.Verify("hash", "right").Returns(true);

        account.VerifyPassword("right", hasher).Should().BeTrue();
        account.VerifyPassword("wrong", hasher).Should().BeFalse();
    }

    [Fact]
    public void EnsureCanLogin_InactiveAccount_Throws()
    {
        var account = NewAccount();
        account.Deactivate();

        var act = account.EnsureCanLogin;

        act.Should().Throw<Microservice.BuildingBlocks.Domain.BusinessRules.BusinessRuleValidationException>();
    }

    [Fact]
    public void RotateRefreshToken_KeepsProfile_RecordsSuccessor()
    {
        var account = NewAccount();
        var profile = UserId.New();
        var first = account.AddRefreshToken("d", profile);

        var second = account.RotateRefreshToken(first.Token);

        first.IsActive.Should().BeFalse();
        first.ReplacedByTokenId.Should().Be(second.Id);
        second.UserId.Should().Be(profile);
        second.DeviceId.Should().Be("d");
    }

    [Fact]
    public void RotateRefreshToken_WithNewProfile_SwitchesBinding()
    {
        var account = NewAccount();
        var first = account.AddRefreshToken("d", UserId.New());
        var other = UserId.New();

        var second = account.RotateRefreshToken(first.Token, other);

        second.UserId.Should().Be(other);
    }

    [Fact]
    public void RotateRefreshToken_Rotated_Throws()
    {
        var account = NewAccount();
        var first = account.AddRefreshToken("d", UserId.New());
        account.RotateRefreshToken(first.Token);

        var act = () => account.RotateRefreshToken(first.Token);

        act.Should().Throw<Microservice.BuildingBlocks.Domain.BusinessRules.BusinessRuleValidationException>();
    }

    [Fact]
    public void RevokeRefreshToken_Rotated_RevokesWholeFamily()
    {
        var account = NewAccount();
        var first = account.AddRefreshToken("d", UserId.New());
        var second = account.RotateRefreshToken(first.Token);
        var third = account.RotateRefreshToken(second.Token);

        account.RevokeRefreshToken(first.Token);

        third.IsActive.Should().BeFalse();
        account.RefreshTokens.Count(t => t.IsActive).Should().Be(0);
    }

    [Fact]
    public void AddRefreshToken_KeepsRotatedAncestorsOfLiveFamily()
    {
        var account = NewAccount();
        var first = account.AddRefreshToken("d", UserId.New());
        var second = account.RotateRefreshToken(first.Token);

        account.AddRefreshToken("other", UserId.New()); // purges dead tokens

        account.RefreshTokens.Should().Contain(t => t.Token == first.Token, "logout of the old token must still find its family");
        account.RevokeRefreshToken(first.Token);
        second.IsActive.Should().BeFalse();
    }
}
