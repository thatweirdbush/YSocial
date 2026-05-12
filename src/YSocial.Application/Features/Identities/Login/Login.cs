using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
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
    UserProfileService userProfileService)
    : ICommandHandler<LoginCommand, Result<LoginResponse>>
{
    public async Task<Result<LoginResponse>> Handle(LoginCommand request, CancellationToken cancellationToken)
    {
        var (account, profiles) = await accountRepository.GetAccountWithProfilesByIdentifierAsync(request.LoginId, cancellationToken);

        if (account is null)
        {
            return Result<LoginResponse>.Fail("Invalid credentials.", ErrorType.Business);
        }

        account.Login(request.Password, passwordHasher);

        var targetUser = userProfileService.ResolveProfile(request.LoginId, profiles);

        if (targetUser is null)
        {
            return Result<LoginResponse>.Fail("No user profile found for this account.", ErrorType.Business);
        }

        // Generate tokens
        var accessToken = jwtProvider.GenerateToken(targetUser, account);

        // Record refresh token in Domain
        var refreshToken = account.AddRefreshToken(request.DeviceId);

        // Update Account state (saving new token)
        accountRepository.Update(account);

        return Result<LoginResponse>.Success(new LoginResponse(accessToken, refreshToken.Token, refreshToken.ExpiryTime));
    }
}
