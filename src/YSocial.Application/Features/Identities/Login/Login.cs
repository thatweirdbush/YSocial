using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.Common.Errors;
using YSocial.Domain.Identities;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Identities.Login;

public sealed record LoginCommand(string LoginId, string Password, string DeviceId) : ResultCommand<LoginResponse>;

internal sealed class LoginCommandValidator : AbstractValidator<LoginCommand>
{
    public LoginCommandValidator()
    {
        RuleFor(x => x.LoginId)
            .NotEmpty()
            .WithMessage("Login identifier cannot be empty.");

        RuleFor(x => x.Password)
            .NotEmpty();

        RuleFor(x => x.DeviceId)
            .NotEmpty();
    }
}

internal sealed class LoginCommandHandler(
    IAccountRepository accountRepository,
    IJwtProvider jwtProvider,
    IPasswordHasher passwordHasher,
    IAccountSessionLock sessionLock,
    UserProfileService userProfileService)
    : ICommandHandler<LoginCommand, Result<LoginResponse>>
{
    // Verified for unknown accounts so response time does not reveal whether the account exists
    private static string? _dummyHash;

    public async Task<Result<LoginResponse>> Handle(LoginCommand request, CancellationToken cancellationToken)
    {
        var (account, profiles) = await accountRepository.GetAccountWithProfilesByIdentifierAsync(request.LoginId, cancellationToken);

        // Unknown, deleted & wrong password are indistinguishable (D3)
        if (account is null)
        {
            _dummyHash ??= passwordHasher.Hash("dummy-password-for-timing");
            passwordHasher.Verify(_dummyHash, request.Password);
            return InvalidCredentials();
        }

        if (!account.VerifyPassword(request.Password, passwordHasher))
        {
            return InvalidCredentials();
        }

        // Account state is revealed only to the credential holder
        account.EnsureCanLogin();

        var targetUser = userProfileService.ResolveProfile(request.LoginId, profiles);

        if (targetUser is null)
        {
            return Result<LoginResponse>.Fail("No user profile found for this account.", ErrorType.Business);
        }

        var accessToken = jwtProvider.GenerateToken(targetUser, account);

        await using var _ = await sessionLock.AcquireAsync(account.Id, cancellationToken);

        var refreshToken = account.AddRefreshToken(request.DeviceId, targetUser.Id);
        accountRepository.Update(account);

        return Result<LoginResponse>.Success(new LoginResponse(accessToken, refreshToken.Token, refreshToken.ExpiryTime));
    }

    private static Result<LoginResponse> InvalidCredentials()
        => Result<LoginResponse>.Unauthorized("Invalid credentials.", ErrorCodes.InvalidCredentials);
}
