using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.Common.Errors;
using YSocial.Domain.Identities;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Identities.Login;

/// <summary>
/// <see cref="UserAgent"/> is set by the controller from the request header, never from the body.
/// </summary>
public sealed record LoginCommand(string LoginId, string Password, string DeviceId, string? UserAgent = null) : ResultCommand<LoginResponse>;

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
    IUnitOfWork unitOfWork,
    UserProfileService userProfileService)
    : ICommandHandler<LoginCommand, Result<LoginResponse>>
{
    // Verified for unknown accounts so response time does not reveal whether the account exists
    private static string? _dummyHash;

    public async Task<Result<LoginResponse>> Handle(LoginCommand request, CancellationToken cancellationToken)
    {
        // Untracked snapshot: password check & profile resolution only, the account is re-loaded under the lock
        var (found, profiles) = await accountRepository.GetAccountWithProfilesByIdentifierAsync(request.LoginId, cancellationToken);

        // Unknown, deleted & wrong password are indistinguishable (D3)
        if (found is null)
        {
            _dummyHash ??= passwordHasher.Hash("dummy-password-for-timing");
            passwordHasher.Verify(_dummyHash, request.Password);
            return InvalidCredentials();
        }

        if (!found.VerifyPassword(request.Password, passwordHasher))
        {
            return InvalidCredentials();
        }

        // Account state is revealed only to the credential holder
        found.EnsureCanLogin();

        var targetUser = userProfileService.ResolveProfile(request.LoginId, profiles);

        if (targetUser is null)
        {
            return Result<LoginResponse>.Fail("No user profile found for this account.", ErrorType.Business);
        }

        await using var _ = await sessionLock.AcquireAsync(found.Id, cancellationToken);

        var account = await accountRepository.GetByIdAsync(found.Id, cancellationToken);
        if (account is null)
        {
            return InvalidCredentials();
        }

        var refreshToken = account.AddRefreshToken(request.DeviceId, targetUser.Id, request.UserAgent);
        var accessToken = jwtProvider.GenerateToken(targetUser, account, refreshToken.Id);
        accountRepository.Update(account);

        // Saved INSIDE the lock: the next login must see this session when it applies the cap
        await unitOfWork.CommitAsync(cancellationToken);

        return Result<LoginResponse>.Success(new LoginResponse(accessToken, refreshToken.Token, refreshToken.ExpiryTime));
    }

    private static Result<LoginResponse> InvalidCredentials()
        => Result<LoginResponse>.Unauthorized("Invalid credentials.", ErrorCodes.InvalidCredentials);
}
