using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
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
    IUserContext userContext)
    : ICommandHandler<SwitchProfileCommand, Result<LoginResponse>>
{
    public async Task<Result<LoginResponse>> Handle(SwitchProfileCommand request, CancellationToken cancellationToken)
    {
        var accountId = new AccountId(userContext.AccountId);
        var targetUserId = new UserId(request.ProfileId);

        // 1. Fetch Account and Target User Profile in parallel
        var accountTask = accountRepository.GetByIdAsync(accountId, cancellationToken);
        var userTask = userRepository.GetByIdAndAccountIdAsync(targetUserId, accountId, cancellationToken);

        await Task.WhenAll(accountTask, userTask);

        var account = await accountTask;
        var targetUser = await userTask;

        if (account is null) return Result<LoginResponse>.Fail("Account not found.", ErrorType.NotFound);
        if (targetUser is null) return Result<LoginResponse>.Fail("Profile not found or does not belong to this account.", ErrorType.NotFound);

        // 2. Perform token rotation
        var newRefreshToken = account.RotateRefreshToken(request.RefreshToken);
        var newAccessToken = jwtProvider.GenerateToken(targetUser, account);
        
        accountRepository.Update(account);

        return Result<LoginResponse>.Success(new LoginResponse(newAccessToken, newRefreshToken.Token, newRefreshToken.ExpiryTime));
    }
}
