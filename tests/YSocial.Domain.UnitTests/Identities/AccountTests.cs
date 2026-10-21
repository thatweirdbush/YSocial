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

    #region Sessions
    private static readonly DateTime T0 = new(2026, 10, 1, 8, 0, 0, DateTimeKind.Utc);

    private static void SetCreatedAt(RefreshToken token, DateTime value)
        => typeof(RefreshToken).GetProperty(nameof(RefreshToken.CreatedAt))!.SetValue(token, value);

    [Fact]
    public void GetSessions_OneEntryPerActiveFamily()
    {
        var account = NewAccount();
        var first = account.AddRefreshToken("a", UserId.New());
        account.AddRefreshToken("b", UserId.New());
        var head = account.RotateRefreshToken(first.Token);

        var sessions = account.GetSessions();

        sessions.Should().HaveCount(2);
        sessions.Select(s => s.HeadId).Should().Contain(head.Id).And.NotContain(first.Id);
    }

    [Fact]
    public void GetSessions_RootCreatedAtSurvivesRotation()
    {
        var account = NewAccount();
        var root = account.AddRefreshToken("a", UserId.New());
        SetCreatedAt(root, T0);
        var second = account.RotateRefreshToken(root.Token);
        var third = account.RotateRefreshToken(second.Token);

        var session = account.GetSessions().Single();

        session.HeadId.Should().Be(third.Id);
        session.CreatedAt.Should().Be(T0);
    }

    [Fact]
    public void GetSessions_LastTokenIssuedAt_IsHeadCreatedAt_NotRootOrExpiry()
    {
        var account = NewAccount();
        var root = account.AddRefreshToken("a", UserId.New());
        SetCreatedAt(root, T0);
        var head = account.RotateRefreshToken(root.Token);
        SetCreatedAt(head, T0.AddHours(3));

        var session = account.GetSessions().Single();

        session.LastTokenIssuedAt.Should().Be(T0.AddHours(3));
        session.LastTokenIssuedAt.Should().NotBe(head.ExpiryTime).And.NotBe(session.CreatedAt);
    }

    [Fact]
    public void GetSessions_OrderedByLastIssuedDesc_TiesStable()
    {
        var account = NewAccount();
        var older = account.AddRefreshToken("old", UserId.New());
        var tieA = account.AddRefreshToken("tieA", UserId.New());
        var tieB = account.AddRefreshToken("tieB", UserId.New());
        var newest = account.AddRefreshToken("new", UserId.New());
        SetCreatedAt(older, T0);
        SetCreatedAt(tieA, T0.AddHours(1));
        SetCreatedAt(tieB, T0.AddHours(1));
        SetCreatedAt(newest, T0.AddHours(2));

        var ids = account.GetSessions().Select(s => s.HeadId).ToList();

        ids[0].Should().Be(newest.Id);
        ids[3].Should().Be(older.Id);
        ids.Skip(1).Take(2).Should().BeEquivalentTo([tieA.Id, tieB.Id]);
        account.GetSessions().Select(s => s.HeadId).Should().Equal(ids, "ties resolve the same way every call");
    }

    [Fact]
    public void RevokeSession_ByRotatedId_RevokesActiveHead()
    {
        var account = NewAccount();
        var first = account.AddRefreshToken("a", UserId.New());
        var head = account.RotateRefreshToken(first.Token);

        var found = account.RevokeSession(first.Id);

        found.Should().BeTrue();
        head.IsActive.Should().BeFalse();
        account.GetSessions().Should().BeEmpty();
    }

    [Fact]
    public void RevokeSession_UnknownId_ReturnsFalse()
    {
        var account = NewAccount();
        account.AddRefreshToken("a", UserId.New());

        account.RevokeSession(RefreshTokenId.New()).Should().BeFalse();
        account.GetSessions().Should().HaveCount(1);
    }

    [Fact]
    public void RevokeSession_EndedFamily_ReturnsTrue()
    {
        var account = NewAccount();
        var token = account.AddRefreshToken("a", UserId.New());
        account.RevokeSession(token.Id);

        account.RevokeSession(token.Id).Should().BeTrue();
    }

    [Fact]
    public void Rotate_CopiesUserAgent()
    {
        var account = NewAccount();
        var first = account.AddRefreshToken("a", UserId.New(), "Mozilla/5.0 Test");

        var second = account.RotateRefreshToken(first.Token);

        second.UserAgent.Should().Be("Mozilla/5.0 Test");
        account.GetSessions().Single().UserAgent.Should().Be("Mozilla/5.0 Test");
    }

    [Fact]
    public void AddRefreshToken_SixthSession_EvictsOldest_StillFiveActive()
    {
        var account = NewAccount();
        var tokens = Enumerable.Range(1, 5).Select(i => account.AddRefreshToken($"d{i}", UserId.New())).ToList();
        for (var i = 0; i < tokens.Count; i++)
        {
            SetCreatedAt(tokens[i], T0.AddMinutes(i));
        }

        var sixth = account.AddRefreshToken("d6", UserId.New());

        var sessions = account.GetSessions();
        sessions.Should().HaveCount(5);
        sessions.Select(s => s.HeadId).Should().NotContain(tokens[0].Id).And.Contain(sixth.Id);
    }

    [Fact]
    public void BelongsToSession_StaleProbe_True()
    {
        var account = NewAccount();
        var first = account.AddRefreshToken("a", UserId.New());
        var head = account.RotateRefreshToken(first.Token);
        var other = account.AddRefreshToken("b", UserId.New());

        account.BelongsToSession(head.Id, first.Id).Should().BeTrue();
        account.BelongsToSession(head.Id, head.Id).Should().BeTrue();
        account.BelongsToSession(head.Id, other.Id).Should().BeFalse();
        account.BelongsToSession(head.Id, RefreshTokenId.New()).Should().BeFalse();
    }

    [Fact]
    public void UserAgent_LongerThan256_Truncated()
    {
        var account = NewAccount();

        var token = account.AddRefreshToken("a", UserId.New(), new string('x', 400));

        token.UserAgent.Should().HaveLength(256);
    }
    #endregion
}
