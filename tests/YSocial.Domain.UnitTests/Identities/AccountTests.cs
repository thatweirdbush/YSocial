using FluentAssertions;
using NSubstitute;
using Xunit;
using YSocial.Domain.Identities;

namespace YSocial.Domain.UnitTests.Identities;

public class AccountTests
{
    private static Account NewAccount() => Account.Create("user@example.com", null, PasswordHash.Create("hash"));

    [Fact]
    public void AddRefreshToken_SixthActive_EvictsOldest()
    {
        var account = NewAccount();
        var tokens = Enumerable.Range(1, 5).Select(i => account.AddRefreshToken($"d{i}")).ToList();

        var sixth = account.AddRefreshToken("d6");

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
            account.AddRefreshToken($"d{i}");
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
}
