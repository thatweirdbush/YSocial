using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.Identities;

namespace YSocial.Application.Features.Identities.Login;

public sealed record LoginCommand(string Email, string Password, string DeviceId) : ResultCommand<LoginResponse>;

internal sealed class LoginCommandValidator : AbstractValidator<LoginCommand>
{
    public LoginCommandValidator()
    {
        RuleFor(x => x.Email)
            .NotEmpty()
            .EmailAddress()
            .WithMessage("Invalid email address.");

        RuleFor(x => x.Password)
            .NotEmpty();

        RuleFor(x => x.DeviceId)
            .NotEmpty();
    }
}

internal sealed class LoginCommandHandler(
    IAccountRepository accountRepository,
    IJwtProvider jwtProvider)
    : ICommandHandler<LoginCommand, Result<LoginResponse>>
{
    public async Task<Result<LoginResponse>> Handle(LoginCommand request, CancellationToken cancellationToken)
    {
        var account = await accountRepository.GetByEmailAsync(request.Email, cancellationToken);
            
        if (account is null || account.PasswordHash.Value != request.Password)
        {
            return Result<LoginResponse>.Fail("Invalid credentials.", ErrorType.Business);
        }

        if (!account.IsActive)
        {
            return Result<LoginResponse>.Fail("Account is deactivated.", ErrorType.Business);
        }

        // Generate tokens
        var accessToken = jwtProvider.GenerateToken(account.Id.Value, account.Email); 
        var refreshToken = Guid.NewGuid().ToString();
        var expiry = DateTime.UtcNow.AddDays(7);

        // Record refresh token in Domain
        account.AddRefreshToken(refreshToken, expiry, request.DeviceId);

        // Update Account state (saving new token)
        accountRepository.Update(account);

        return Result<LoginResponse>.Success(new LoginResponse(accessToken, refreshToken, expiry));
    }
}
