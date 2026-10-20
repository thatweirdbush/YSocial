using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.Abstractions.Persistence;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.Features.Identities.Login;
using YSocial.Domain.Common.Errors;
using YSocial.Domain.Identities;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Identities.RefreshToken;

/// <summary>
/// Anonymous silent refresh: rotates the token, keeps the bound profile (D5).
/// </summary>
public sealed record RefreshTokenCommand(string RefreshToken) : ResultCommand<LoginResponse>;

internal sealed class RefreshTokenCommandValidator : AbstractValidator<RefreshTokenCommand>
{
    public RefreshTokenCommandValidator()
    {
        RuleFor(x => x.RefreshToken).NotEmpty();
    }
}

internal sealed class RefreshTokenCommandHandler(
    IAccountRepository accountRepository,
    IUserRepository userRepository,
    IJwtProvider jwtProvider,
    IAccountSessionLock sessionLock,
    IUnitOfWork unitOfWork)
    : ICommandHandler<RefreshTokenCommand, Result<LoginResponse>>
{
    public async Task<Result<LoginResponse>> Handle(RefreshTokenCommand request, CancellationToken cancellationToken)
    {
        // Advisory lookup without lock (untracked snapshot); everything is re-loaded & re-validated under the lock
        var found = await accountRepository.GetByRefreshTokenAsync(request.RefreshToken, cancellationToken);
        if (found is null)
        {
            return Invalid();
        }

        await using var _ = await sessionLock.AcquireAsync(found.Id, cancellationToken);

        // Deleted accounts are not returned by the repository
        var account = await accountRepository.GetByIdAsync(found.Id, cancellationToken);
        var token = account?.RefreshTokens.FirstOrDefault(t => t.Token == request.RefreshToken);
        if (account is null || !account.IsActive || token is null || !token.IsActive)
        {
            return Invalid();
        }

        var profile = await userRepository.GetByIdAndAccountIdAsync(token.UserId, account.Id, cancellationToken);
        if (profile is null || profile.IsDeleted)
        {
            return Invalid();
        }

        var newRefreshToken = account.RotateRefreshToken(request.RefreshToken);
        var accessToken = jwtProvider.GenerateToken(profile, account);
        accountRepository.Update(account);

        // Saved INSIDE the lock: the next request for this account must see the rotation
        try
        {
            await unitOfWork.CommitAsync(cancellationToken);
        }
        catch (ConcurrencyConflictException)
        {
            // Another instance changed the account first: same outcome as losing the single-instance race (contract: any failure = 401)
            return Invalid();
        }

        return Result<LoginResponse>.Success(new LoginResponse(accessToken, newRefreshToken.Token, newRefreshToken.ExpiryTime));
    }

    private static Result<LoginResponse> Invalid()
        => Result<LoginResponse>.Unauthorized("Invalid or expired refresh token.", ErrorCodes.InvalidRefreshToken);
}
