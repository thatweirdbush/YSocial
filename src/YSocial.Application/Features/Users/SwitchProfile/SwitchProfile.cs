using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.Common.Errors;
using YSocial.Application.Features.Identities.Login;
using YSocial.Domain.Identities;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Users.SwitchProfile;

public sealed record SwitchProfileCommand(Guid ProfileId, string RefreshToken) : ResultCommand<LoginResponse>;

internal sealed class SwitchProfileCommandValidator : AbstractValidator<SwitchProfileCommand>
{
    public SwitchProfileCommandValidator()
    {
        RuleFor(x => x.ProfileId).NotEmpty();
        RuleFor(x => x.RefreshToken).NotEmpty();
    }
}

internal sealed class SwitchProfileCommandHandler(
    IUserRepository userRepository,
    IAccountRepository accountRepository,
    IJwtProvider jwtProvider,
    IAccountSessionLock sessionLock,
    IUserContext userContext)
    : ICommandHandler<SwitchProfileCommand, Result<LoginResponse>>
{
    public async Task<Result<LoginResponse>> Handle(SwitchProfileCommand request, CancellationToken cancellationToken)
    {
        if (!userContext.IsAuthenticated)
        {
            return Result<LoginResponse>.Unauthorized();
        }

        var accountId = new AccountId(userContext.AccountId);
        var account = await accountRepository.GetByIdAsync(accountId, cancellationToken);
        if (account is null)
        {
            return Result<LoginResponse>.Unauthorized();
        }

        await using var _ = await sessionLock.AcquireAsync(account.Id, cancellationToken);

        // Foreign, deleted & unknown profiles look the same (no id probing)
        var targetUser = await userRepository.GetByIdAndAccountIdAsync(new UserId(request.ProfileId), account.Id, cancellationToken);
        if (targetUser is null)
        {
            return Result<LoginResponse>.Forbidden("The profile does not belong to this account.", ErrorCodes.ProfileNotOwned);
        }

        // Token must be one of THIS account's active tokens, else InvalidRefreshToken rule (401)
        var newRefreshToken = account.RotateRefreshToken(request.RefreshToken, targetUser.Id);
        var newAccessToken = jwtProvider.GenerateToken(targetUser, account);

        accountRepository.Update(account);

        return Result<LoginResponse>.Success(new LoginResponse(newAccessToken, newRefreshToken.Token, newRefreshToken.ExpiryTime));
    }
}
