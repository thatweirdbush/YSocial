using FluentAssertions;
using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Xunit;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.Abstractions.Persistence;
using YSocial.Application.Features.Identities.ForgotPassword;
using YSocial.Application.Features.Identities.LogoutUser;
using YSocial.Application.Features.Identities.RefreshToken;
using YSocial.Application.Features.Identities.RevokeSession;
using YSocial.Application.Features.Users.SwitchProfile;
using YSocial.Domain.Common.Errors;
using YSocial.Domain.Countries;
using YSocial.Domain.Identities;
using YSocial.Domain.Users;
using YSocial.Infrastructure.Identity;

namespace YSocial.Application.UnitTests.Identity;

/// <summary>
/// Another instance changing the account first (optimistic concurrency) must end in the documented outcome of each
/// endpoint: refresh &amp; switch 401, logout &amp; forgot-password 204 (MAP 2.1, 2.2). Revoke session is the exception: it lets the
/// conflict propagate so <c>GlobalExceptionHandler</c> answers 409 (mapping pinned by <c>PersistenceTests.ConcurrencyConflict_Returns409_Conflict</c>).
/// </summary>
public class SessionConflictTests
{
    private readonly IAccountRepository _accounts = Substitute.For<IAccountRepository>();
    private readonly IUserRepository _users = Substitute.For<IUserRepository>();
    private readonly IJwtProvider _jwt = Substitute.For<IJwtProvider>();
    private readonly IUnitOfWork _unitOfWork = Substitute.For<IUnitOfWork>();
    private readonly IUserContext _userContext = Substitute.For<IUserContext>();
    private readonly AccountSessionLock _lock = new();
    private readonly BCryptPasswordHasher _hasher = new(4);

    private readonly Account _account;
    private readonly User _profile;
    private readonly string _token;

    public SessionConflictTests()
    {
        _account = Account.Create("conflict@example.com", null, PasswordHash.Create(_hasher.Hash("Password123!")));
        _profile = User.Create(_account.Id, "conflict_user", Country.Vietnam, isDefault: true);
        _token = _account.AddRefreshToken("device", _profile.Id).Token;

        _accounts.GetByRefreshTokenAsync(_token, Arg.Any<CancellationToken>()).Returns(_account);
        _accounts.GetByIdAsync(_account.Id, Arg.Any<CancellationToken>()).Returns(_account);
        _accounts.GetByIdAsync(_account.Id, true, Arg.Any<CancellationToken>()).Returns(_account);
        _accounts.GetIdByIdentifierAsync(Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(_account.Id);
        _users.GetByIdAndAccountIdAsync(_profile.Id, _account.Id, Arg.Any<CancellationToken>()).Returns(_profile);
        _jwt.GenerateToken(Arg.Any<User>(), Arg.Any<Account>(), Arg.Any<RefreshTokenId?>()).Returns("jwt");
        _userContext.IsAuthenticated.Returns(true);
        _userContext.AccountId.Returns(_account.Id.Value);

        _unitOfWork.CommitAsync(Arg.Any<CancellationToken>()).ThrowsAsync(new ConcurrencyConflictException("stale"));
    }

    [Fact]
    public async Task Refresh_ConflictOnSave_Returns401InvalidRefreshToken()
    {
        var handler = new RefreshTokenCommandHandler(_accounts, _users, _jwt, _lock, _unitOfWork);

        var result = await handler.Handle(new RefreshTokenCommand(_token), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Code.Should().Be(ErrorCodes.InvalidRefreshToken);
    }

    [Fact]
    public async Task Logout_ConflictOnSave_StillSucceeds()
    {
        var handler = new LogoutUserCommandHandler(_accounts, _lock, _unitOfWork);

        var result = await handler.Handle(new LogoutUserCommand(_token), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
    }

    [Fact]
    public async Task SwitchProfile_ConflictOnSave_Returns401InvalidRefreshToken()
    {
        var handler = new SwitchProfileCommandHandler(_users, _accounts, _jwt, _lock, _unitOfWork, _userContext);

        var result = await handler.Handle(new SwitchProfileCommand(_profile.Id.Value, _token), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Code.Should().Be(ErrorCodes.InvalidRefreshToken);
    }

    [Fact]
    public async Task Revoke_ConcurrencyConflict_Maps409()
    {
        var handler = new RevokeSessionCommandHandler(_accounts, _lock, _unitOfWork, _userContext);
        var sessionId = _account.RefreshTokens.Single().Id.Value;

        var act = () => handler.Handle(new RevokeSessionCommand(sessionId), CancellationToken.None);

        await act.Should().ThrowAsync<ConcurrencyConflictException>("the client retries on 409, never a silent success");
    }

    [Fact]
    public async Task ForgotPassword_ConflictOnSave_StillAnswersUniformSuccess()
    {
        var handler = new ForgotPasswordCommandHandler(_accounts, _hasher, _lock, _unitOfWork);

        var result = await handler.Handle(new ForgotPasswordCommand("conflict@example.com"), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
    }

    [Fact]
    public async Task Handlers_ReleaseTheSessionLock_EvenWhenSaveConflicts()
    {
        var handler = new RefreshTokenCommandHandler(_accounts, _users, _jwt, _lock, _unitOfWork);
        await handler.Handle(new RefreshTokenCommand(_token), CancellationToken.None);

        await using var again = await _lock.AcquireAsync(_account.Id).WaitAsync(TimeSpan.FromSeconds(2));
    }
}
